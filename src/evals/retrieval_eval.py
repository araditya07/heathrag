"""Retrieval-only evaluation: did the retriever return the right chunks?

Computes precision@k, recall@k, MRR per question, with macro-averages per category.

Falls back to keyword-overlap matching when chunk IDs drift (e.g. after re-ingest).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from src.retrieval.retriever import RetrievedChunk, Retriever


@dataclass
class PerQuestionRetrievalResult:
    question_id: str
    question_text: str
    category: str
    retrieved_chunk_ids: list[str]
    expected_chunk_ids: list[str]
    precision_at_k: float
    recall_at_k: float
    mrr: float
    relevant_indices: list[int] = field(default_factory=list)  # 0-indexed positions in retrieved


@dataclass
class RetrievalAggregate:
    precision_at_k: float
    recall_at_k: float
    mrr: float
    by_category: dict[str, dict[str, float]]
    total_questions: int


def _keyword_match(retrieved_content: str, keywords: list[str]) -> bool:
    if not keywords:
        return False
    lc = retrieved_content.lower()
    # ALL keywords must appear (case-insensitive substring).
    return all(kw.lower() in lc for kw in keywords if kw)


def _url_prefix_match(chunk_url: str, expected_urls) -> bool:
    """A retrieved chunk is considered relevant if its source URL starts with
    ANY of the expected URL prefixes from the golden dataset.

    The dataset stores prefixes like 'https://www.cdc.gov/diabetes/' but the
    chunks themselves carry full URLs like
    'https://www.cdc.gov/diabetes/about/index.html'. Exact equality would
    never match — prefix match is the right semantics.
    """
    if not chunk_url or not expected_urls:
        return False
    return any(chunk_url.startswith(prefix) for prefix in expected_urls if prefix)


def _is_relevant(
    chunk: RetrievedChunk,
    expected_chunk_ids: set[str],
    expected_source_urls,
    expected_keywords: list[str],
) -> bool:
    if chunk.id in expected_chunk_ids:
        return True
    url = (chunk.metadata or {}).get("source_url", "")
    if _url_prefix_match(url, expected_source_urls):
        return True
    return _keyword_match(chunk.content, expected_keywords)


def evaluate_question(
    retriever: Retriever,
    question_row: dict,
    *,
    k: int,
    use_threshold: bool = False,
    threshold: float = 0.65,
) -> PerQuestionRetrievalResult:
    question_text = question_row["question"]
    category = question_row["category"]
    expected_ids = set(question_row.get("expected_chunk_ids") or [])
    expected_urls = set(question_row.get("expected_source_urls") or [])
    expected_kws = question_row.get("expected_chunk_keywords") or []

    if use_threshold:
        retrieved = retriever.retrieve_with_threshold(question_text, threshold=threshold, k=k)
    else:
        retrieved = retriever.retrieve(question_text, k=k)

    retrieved_ids = [c.id for c in retrieved]

    # Special handling for UNANSWERABLE category.
    if category == "unanswerable":
        # Success = retrieve nothing above threshold.
        # We report this as precision=1 (no false positives), recall=1, mrr=1 when len==0.
        if not retrieved or all(c.similarity_score < threshold for c in retrieved):
            p_at_k, r_at_k, mrr = 1.0, 1.0, 1.0
        else:
            p_at_k, r_at_k, mrr = 0.0, 0.0, 0.0
        return PerQuestionRetrievalResult(
            question_id=question_row["id"],
            question_text=question_text,
            category=category,
            retrieved_chunk_ids=retrieved_ids,
            expected_chunk_ids=list(expected_ids),
            precision_at_k=p_at_k,
            recall_at_k=r_at_k,
            mrr=mrr,
        )

    relevant_idxs = [
        i
        for i, c in enumerate(retrieved)
        if _is_relevant(c, expected_ids, expected_urls, expected_kws)
    ]
    num_relevant_retrieved = len(relevant_idxs)

    # Treat "total relevant" as the expected set size, but if we don't have IDs/URLs (only
    # keyword fallback), use max(1, num_relevant_retrieved) as a soft denominator so recall
    # doesn't blow up.
    total_relevant = max(len(expected_ids), len(expected_urls))
    if total_relevant == 0:
        total_relevant = max(1, num_relevant_retrieved)

    p_at_k = num_relevant_retrieved / k if k else 0.0
    r_at_k = min(1.0, num_relevant_retrieved / total_relevant)
    mrr = (1.0 / (relevant_idxs[0] + 1)) if relevant_idxs else 0.0

    return PerQuestionRetrievalResult(
        question_id=question_row["id"],
        question_text=question_text,
        category=category,
        retrieved_chunk_ids=retrieved_ids,
        expected_chunk_ids=list(expected_ids),
        precision_at_k=p_at_k,
        recall_at_k=r_at_k,
        mrr=mrr,
        relevant_indices=relevant_idxs,
    )


def aggregate(results: list[PerQuestionRetrievalResult]) -> RetrievalAggregate:
    n = len(results) or 1
    p = sum(r.precision_at_k for r in results) / n
    r = sum(r.recall_at_k for r in results) / n
    mrr = sum(r.mrr for r in results) / n  # noqa: F811

    by_cat: dict[str, list[PerQuestionRetrievalResult]] = {}
    for row in results:
        by_cat.setdefault(row.category, []).append(row)

    cat_summary = {}
    for cat, items in by_cat.items():
        m = len(items) or 1
        cat_summary[cat] = {
            "precision_at_k": sum(x.precision_at_k for x in items) / m,
            "recall_at_k": sum(x.recall_at_k for x in items) / m,
            "mrr": sum(x.mrr for x in items) / m,
            "n": len(items),
        }

    return RetrievalAggregate(
        precision_at_k=p,
        recall_at_k=r,
        mrr=mrr,
        by_category=cat_summary,
        total_questions=len(results),
    )
