"""Load data/golden_eval_dataset.json into the eval_golden_dataset table.

Usage:
    python scripts/06_load_golden_dataset.py [--reset]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.config import supabase_admin  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/golden_eval_dataset.json")
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()

    path = ROOT / args.file
    rows = json.loads(path.read_text())
    print(f"Loaded {len(rows)} questions from {path}")

    sb = supabase_admin()
    if args.reset:
        print("Deleting existing eval_golden_dataset rows…")
        sb.table("eval_golden_dataset").delete().neq(
            "id", "00000000-0000-0000-0000-000000000000"
        ).execute()

    payload = []
    for r in rows:
        payload.append(
            {
                "question": r["question"],
                "category": r["category"],
                "expected_answer": r.get("expected_answer", ""),
                "expected_source_urls": r.get("expected_source_urls", []),
                "expected_chunk_keywords": r.get("expected_chunk_keywords", []),
                "mock_health_context": r.get("mock_health_context"),
                "expected_guardrail": r.get("expected_guardrail"),
                "difficulty": r.get("difficulty", "medium"),
                "notes": r.get("notes", ""),
            }
        )
    res = sb.table("eval_golden_dataset").insert(payload).execute()
    print(f"Inserted {len(res.data or [])} rows.")


if __name__ == "__main__":
    main()
