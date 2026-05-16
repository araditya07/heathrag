"""Recursive character splitter with token counting and heading-path metadata.

Splits a markdown document into chunks of ~chunk_size tokens with `overlap` tokens of
sliding-window overlap. Tracks the current heading hierarchy so each chunk records
the section_title and a breadcrumb-style heading_path.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

import tiktoken

# cl100k_base matches OpenAI text-embedding-3-small / GPT-4 tokenization.
ENCODER = tiktoken.get_encoding("cl100k_base")

SEPARATORS = ["\n\n", "\n", ". ", " "]


@dataclass
class Chunk:
    content: str
    token_count: int
    chunk_index: int
    metadata: dict = field(default_factory=dict)


def count_tokens(text: str) -> int:
    return len(ENCODER.encode(text, disallowed_special=()))


def _split_recursive(text: str, max_tokens: int, sep_idx: int = 0) -> list[str]:
    """Split text into pieces each <= max_tokens, recursing through SEPARATORS."""
    if count_tokens(text) <= max_tokens:
        return [text]

    if sep_idx >= len(SEPARATORS):
        # Fallback: hard-slice on token boundaries.
        ids = ENCODER.encode(text, disallowed_special=())
        pieces = []
        for start in range(0, len(ids), max_tokens):
            pieces.append(ENCODER.decode(ids[start : start + max_tokens]))
        return pieces

    sep = SEPARATORS[sep_idx]
    parts = text.split(sep)
    out: list[str] = []
    buf: list[str] = []
    buf_tokens = 0

    for part in parts:
        # Re-attach the separator so we don't lose punctuation.
        piece = part + (sep if sep != " " and part is not parts[-1] else "")
        p_tokens = count_tokens(piece)

        if p_tokens > max_tokens:
            if buf:
                out.append(sep.join(buf) if sep != "\n\n" else "\n\n".join(buf))
                buf = []
                buf_tokens = 0
            out.extend(_split_recursive(part, max_tokens, sep_idx + 1))
            continue

        if buf_tokens + p_tokens > max_tokens:
            out.append(sep.join(buf) if sep != "\n\n" else "\n\n".join(buf))
            buf = [part]
            buf_tokens = p_tokens
        else:
            buf.append(part)
            buf_tokens += p_tokens

    if buf:
        out.append(sep.join(buf) if sep != "\n\n" else "\n\n".join(buf))

    return [p.strip() for p in out if p.strip()]


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def _heading_path_for_line(line: str, stack: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """Update the heading stack in place style; returns the new stack."""
    m = _HEADING_RE.match(line)
    if not m:
        return stack
    level = len(m.group(1))
    title = m.group(2).strip()
    new_stack = [(lvl, t) for (lvl, t) in stack if lvl < level]
    new_stack.append((level, title))
    return new_stack


def chunk_document(
    text: str,
    *,
    chunk_size: int = 512,
    overlap: int = 50,
    base_metadata: dict | None = None,
) -> list[Chunk]:
    """Split `text` into chunks. Each chunk carries section/heading metadata."""
    base_metadata = base_metadata or {}

    # Track headings line-by-line so we know which section each character belongs to.
    lines = text.split("\n")
    line_headings: list[list[tuple[int, str]]] = []
    stack: list[tuple[int, str]] = []
    for line in lines:
        stack = _heading_path_for_line(line, stack)
        line_headings.append(stack.copy())

    # Map a char offset → heading stack so we can look up where a chunk starts.
    char_to_line = []
    pos = 0
    for line in lines:
        char_to_line.append(pos)
        pos += len(line) + 1  # +1 for the newline we split on

    def heading_for_offset(offset: int) -> list[tuple[int, str]]:
        # Find the largest line index with start <= offset.
        lo, hi = 0, len(char_to_line) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if char_to_line[mid] <= offset:
                lo = mid
            else:
                hi = mid - 1
        return line_headings[lo] if 0 <= lo < len(line_headings) else []

    raw_chunks = _split_recursive(text, chunk_size)

    # Apply token-level overlap by sliding window over the concatenated token stream.
    if overlap > 0 and len(raw_chunks) > 1:
        overlapped: list[str] = []
        prev_tail = ""
        for piece in raw_chunks:
            if prev_tail:
                piece = prev_tail + "\n" + piece
            tail_ids = ENCODER.encode(piece, disallowed_special=())[-overlap:]
            prev_tail = ENCODER.decode(tail_ids)
            overlapped.append(piece)
        raw_chunks = overlapped

    # Build Chunk objects with metadata.
    chunks: list[Chunk] = []
    cursor = 0
    for i, content in enumerate(raw_chunks):
        # Find where this chunk starts in the original document (best-effort).
        offset = text.find(content[:80], cursor) if content else -1
        if offset == -1:
            offset = cursor
        cursor = max(cursor, offset + 1)

        hp = heading_for_offset(offset)
        section_title = hp[-1][1] if hp else ""
        heading_path = " > ".join(t for _, t in hp)

        metadata = dict(base_metadata)
        metadata.update(
            {
                "section_title": section_title,
                "heading_path": heading_path,
            }
        )

        chunks.append(
            Chunk(
                content=content.strip(),
                token_count=count_tokens(content),
                chunk_index=i,
                metadata=metadata,
            )
        )

    return chunks


def chunk_documents(
    documents: Iterable[dict],
    *,
    chunk_size: int = 512,
    overlap: int = 50,
) -> Iterable[tuple[dict, list[Chunk]]]:
    """Yield (document_row, chunks) pairs. `document_row` must include id, raw_content, source_url, source."""
    for doc in documents:
        base = {
            "source": doc.get("source"),
            "source_url": doc.get("source_url"),
            "document_title": doc.get("title"),
        }
        yield doc, chunk_document(
            doc["raw_content"],
            chunk_size=chunk_size,
            overlap=overlap,
            base_metadata=base,
        )
