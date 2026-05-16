"""Embed every chunk with a null embedding using the local sentence-transformers model.

Usage:
    python scripts/04_embed_and_store.py [--batch-size 256] [--limit N]

Resumable: only processes chunks where embedding IS NULL.
No API calls. Cost: $0.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.config import EMBEDDING_MODEL, supabase_admin  # noqa: E402
from src.ingestion.embedder import EmbedStats, embed_texts  # noqa: E402


def fetch_unembedded_chunks(sb, batch_size: int):
    while True:
        res = (
            sb.table("chunks")
            .select("id, content, metadata")
            .is_("embedding", "null")
            .limit(batch_size)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return
        yield rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    sb = supabase_admin()

    head = (
        sb.table("chunks")
        .select("id", count="exact")
        .is_("embedding", "null")
        .limit(1)
        .execute()
    )
    total = head.count or 0
    print(f"{total:,} chunks pending embedding (model={EMBEDDING_MODEL}).")
    if total == 0:
        return

    stats = EmbedStats()
    processed = 0
    start = time.time()
    pbar = tqdm(total=min(total, args.limit) if args.limit else total)

    for batch in fetch_unembedded_chunks(sb, args.batch_size):
        if args.limit and processed >= args.limit:
            break
        if args.limit:
            batch = batch[: args.limit - processed]

        contents = [r["content"] for r in batch]
        vectors = embed_texts(contents, batch_size=args.batch_size, stats=stats)

        # Per-row update (Supabase python client doesn't bulk-upsert vector columns cleanly).
        for row, vec in zip(batch, vectors):
            new_meta = dict(row.get("metadata") or {})
            new_meta["embedding_model"] = EMBEDDING_MODEL
            sb.table("chunks").update(
                {"embedding": vec, "metadata": new_meta}
            ).eq("id", row["id"]).execute()

        processed += len(batch)
        pbar.update(len(batch))

    pbar.close()
    elapsed = time.time() - start
    print(
        f"\nEmbedded {stats.total_chunks:,} chunks in {elapsed:.1f}s "
        f"({stats.chunks_per_second:.0f} chunks/sec). Cost: $0."
    )


if __name__ == "__main__":
    main()
