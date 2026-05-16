"""HealthRAG generator: cite-aware Gemini answers with guardrail instructions injected."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from src.config import GEMINI_MODEL
from src.generation.llm_client import llm_generate
from src.generation.prompt_templates import (
    NO_CONTEXT_RESPONSE,
    USER_PROMPT,
    build_context_block,
    build_system_prompt,
)
from src.retrieval.retriever import RetrievedChunk


@dataclass
class GeneratedAnswer:
    text: str
    citations: list[dict] = field(default_factory=list)
    model_used: str = ""
    backend: str = ""


_CITE_RE = re.compile(r"\[Source\s+(\d+)\]")


def extract_citations(answer_text: str, chunks: list[RetrievedChunk]) -> list[dict]:
    cited_nums = sorted(set(int(m.group(1)) for m in _CITE_RE.finditer(answer_text)))
    out = []
    for n in cited_nums:
        if 1 <= n <= len(chunks):
            ch = chunks[n - 1]
            out.append(
                {
                    "source_number": n,
                    "chunk_id": ch.id,
                    "source_url": (ch.metadata or {}).get("source_url", ""),
                    "quote": ch.content[:300],
                }
            )
    return out


class Generator:
    def __init__(self, backend: str = "gemini", max_tokens: int = 1024):
        self.backend = backend
        self.max_tokens = max_tokens

    def generate(
        self,
        query: str,
        chunks: list[RetrievedChunk],
        *,
        guardrail_instructions: str = "",
        health_context: str = "",
    ) -> GeneratedAnswer:
        if not chunks and not health_context:
            return GeneratedAnswer(
                text=NO_CONTEXT_RESPONSE,
                citations=[],
                model_used=GEMINI_MODEL,
                backend=self.backend,
            )

        context_block = build_context_block(chunks)
        system = build_system_prompt(
            context_block=context_block,
            guardrail_instructions=guardrail_instructions,
            health_context=health_context,
        )
        user = USER_PROMPT.format(query=query)

        resp = llm_generate(
            user,
            backend=self.backend,
            system=system,
            max_tokens=self.max_tokens,
            temperature=0.2,
        )

        return GeneratedAnswer(
            text=resp.text,
            citations=extract_citations(resp.text, chunks),
            model_used=resp.model,
            backend=resp.backend,
        )
