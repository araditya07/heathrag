"""Vector retriever: embed query with the local model, call the match_chunks RPC."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.config import EMBEDDING_MODEL, embedding_model, supabase_admin


# MiniLM cosine similarities on the CDC corpus run lower than expected:
#   - Top relevant chunks score around 0.20-0.35
#   - 0.20 is the empirical floor that still excludes truly unrelated content
DEFAULT_THRESHOLD = 0.20


@dataclass
class RetrievedChunk:
    id: str
    document_id: str
    content: str
    similarity_score: float
    metadata: dict[str, Any] = field(default_factory=dict)
    reranker_score: float | None = None
    reranker_reason: str | None = None

    @property
    def source_url(self) -> str:
        return (self.metadata or {}).get("source_url", "")


class Retriever:
    def __init__(
        self,
        k: int = 5,
        similarity_threshold: float = DEFAULT_THRESHOLD,
        supabase=None,
        model_name: str | None = None,
    ):
        self.k = k
        self.similarity_threshold = similarity_threshold
        self.supabase = supabase or supabase_admin()
        # Load model once at construction (~2s); subsequent encodes are ~5ms.
        self.model = embedding_model()
        self.model_name = model_name or EMBEDDING_MODEL

    def _embed_query(self, query: str) -> list[float]:
        vec = self.model.encode(query, convert_to_numpy=True, show_progress_bar=False)
        return vec.tolist()

    def retrieve(self, query: str, k: int | None = None) -> list[RetrievedChunk]:
        return self._retrieve(query, k=k or self.k, threshold=0.0)

    def retrieve_with_threshold(
        self, query: str, threshold: float | None = None, k: int | None = None
    ) -> list[RetrievedChunk]:
        t = threshold if threshold is not None else self.similarity_threshold
        return self._retrieve(query, k=k or self.k, threshold=t)

    def _retrieve(self, query: str, k: int, threshold: float) -> list[RetrievedChunk]:
        vec = self._embed_query(query)
        res = self.supabase.rpc(
            "match_chunks",
            {
                "query_embedding": vec,
                "match_count": k,
                "similarity_threshold": threshold,
            },
        ).execute()
        rows = res.data or []
        return [
            RetrievedChunk(
                id=r["id"],
                document_id=r["document_id"],
                content=r["content"],
                similarity_score=float(r["similarity"]),
                metadata=r.get("metadata") or {},
            )
            for r in rows
        ]
