"""Local sentence-transformers embeddings. No API calls.

`all-MiniLM-L6-v2` produces 384-dim vectors and runs at ~500-1000 chunks/sec on CPU.
The model auto-downloads on first use (~80MB).
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from src.config import EMBEDDING_MODEL, embedding_model

# Reasonable on a laptop; sentence-transformers will batch internally as well.
DEFAULT_BATCH = 256


@dataclass
class EmbedStats:
    total_chunks: int = 0
    elapsed_seconds: float = 0.0

    @property
    def chunks_per_second(self) -> float:
        return self.total_chunks / self.elapsed_seconds if self.elapsed_seconds else 0.0


def embed_texts(
    texts: list[str],
    *,
    batch_size: int = DEFAULT_BATCH,
    stats: EmbedStats | None = None,
) -> list[list[float]]:
    """Embed a list of strings using the local sentence-transformer model.

    Returns one 384-dim list per input. Identical model to what the retriever uses
    so query/chunk vectors live in the same space.
    """
    stats = stats or EmbedStats()
    model = embedding_model()
    start = time.time()
    arr = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=False,
    )
    stats.total_chunks += len(texts)
    stats.elapsed_seconds += time.time() - start
    return arr.tolist()


# Re-exported so other modules don't need to import the env constant directly.
MODEL_NAME = EMBEDDING_MODEL
