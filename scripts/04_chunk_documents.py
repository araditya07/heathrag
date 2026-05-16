"""Chunk every document in the `documents` table and insert chunks (without embeddings).

Usage:
    python scripts/03_chunk_documents.py [--chunk-size 512] [--overlap 50] [--reset]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.config import supabase_admin  # noqa: E402
from src.ingestion.chunker import chunk_document  # noqa: E402


CONFIG = {
    "chunk_size": 512,  # tokens (cl100k_base)
    "overlap": 50,      # tokens
}


def fetch_documents_in_pages(sb, page_size: int = 500):
    """Supabase caps responses at ~1000 rows. Page through them."""
    offset = 0
    while True:
        res = (
            sb.table("documents")
            .select("id, source, source_url, title, raw_content")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return
        for r in rows:
            yield r
        if len(rows) < page_size:
            return
        offset += page_size


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chunk-size", type=int, default=CONFIG["chunk_size"])
    parser.add_argument("--overlap", type=int, default=CONFIG["overlap"])
    parser.add_argument("--reset", action="store_true", help="Delete all chunks before re-chunking.")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    sb = supabase_admin()

    if args.reset:
        print("Deleting all existing chunks…")
        sb.table("chunks").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    print(f"Chunking with chunk_size={args.chunk_size} overlap={args.overlap}")

    total_docs = 0
    total_chunks = 0
    batch = []
    BATCH_SIZE = 200

    docs = fetch_documents_in_pages(sb)
    iter_docs = docs

    for doc in tqdm(iter_docs, desc="Chunking documents"):
        if args.limit and total_docs >= args.limit:
            break
        total_docs += 1

        chunks = chunk_document(
            doc["raw_content"],
            chunk_size=args.chunk_size,
            overlap=args.overlap,
            base_metadata={
                "source": doc["source"],
                "source_url": doc["source_url"],
                "document_title": doc["title"],
            },
        )
        for c in chunks:
            batch.append(
                {
                    "document_id": doc["id"],
                    "chunk_index": c.chunk_index,
                    "content": c.content,
                    "token_count": c.token_count,
                    "metadata": c.metadata,
                }
            )
            if len(batch) >= BATCH_SIZE:
                sb.table("chunks").insert(batch).execute()
                total_chunks += len(batch)
                batch = []

    if batch:
        sb.table("chunks").insert(batch).execute()
        total_chunks += len(batch)

    avg = total_chunks / total_docs if total_docs else 0
    print(f"\nDone. documents={total_docs} chunks={total_chunks} avg_chunks_per_doc={avg:.1f}")


if __name__ == "__main__":
    main()
