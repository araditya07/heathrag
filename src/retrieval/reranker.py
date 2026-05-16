"""Cross-encoder reranker. Local model, no API calls, ~10ms per pair on CPU.

The cross-encoder reads (query, passage) jointly and outputs a single relevance score,
which is more precise than the bi-encoder cosine similarity used for first-stage retrieval.
"""

from __future__ import annotations

from src.config import RERANKER_MODEL, reranker_model
from src.retrieval.retriever import RetrievedChunk


class Reranker:
    def __init__(self, model_name: str | None = None):
        self.model = reranker_model()
        self.model_name = model_name or RERANKER_MODEL

    def rerank(self, query: str, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        if not chunks:
            return []

        # Truncate long passages — cross-encoder has a small context window.
        pairs = [(query, c.content[:2000]) for c in chunks]
        scores = self.model.predict(pairs, show_progress_bar=False)

        for chunk, score in zip(chunks, scores):
            chunk.reranker_score = float(score)
            chunk.reranker_reason = None  # cross-encoder doesn't produce free-text rationale

        chunks.sort(key=lambda c: (c.reranker_score or 0.0, c.similarity_score), reverse=True)
        return chunks
