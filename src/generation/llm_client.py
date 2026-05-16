"""Shared Gemini client with per-process pacing and 429 backoff.

The Gemini free tier caps at ~15 requests/minute. We sleep at least
GEMINI_REQUEST_INTERVAL_SECONDS between consecutive calls in this process. On 429
we exponentially back off and retry up to 4 times.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from src.config import (
    GEMINI_MODEL,
    GEMINI_REQUEST_INTERVAL_SECONDS,
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    gemini_model,
)


_lock = threading.Lock()
_last_call_at: float = 0.0


def _wait_for_slot():
    """Block until at least GEMINI_REQUEST_INTERVAL_SECONDS have passed since last call."""
    global _last_call_at
    with _lock:
        now = time.time()
        gap = now - _last_call_at
        if gap < GEMINI_REQUEST_INTERVAL_SECONDS:
            time.sleep(GEMINI_REQUEST_INTERVAL_SECONDS - gap)
        _last_call_at = time.time()


@dataclass
class LLMResponse:
    text: str
    model: str
    backend: str  # "gemini" or "ollama"


def _is_rate_limit(err: Exception) -> bool:
    msg = str(err).lower()
    return any(s in msg for s in ("429", "rate", "quota", "resource_exhausted"))


def gemini_generate(
    prompt: str,
    *,
    system: str | None = None,
    max_tokens: int = 1024,
    temperature: float = 0.2,
    max_retries: int = 4,
) -> LLMResponse:
    """One Gemini call with pacing + retry. Use this for both generator and judge."""
    import google.generativeai as genai

    model = gemini_model()
    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    generation_config = genai.types.GenerationConfig(
        max_output_tokens=max_tokens,
        temperature=temperature,
    )

    attempt = 0
    backoff = 8.0
    while True:
        _wait_for_slot()
        try:
            resp = model.generate_content(full_prompt, generation_config=generation_config)
            text = (getattr(resp, "text", "") or "").strip()
            return LLMResponse(text=text, model=GEMINI_MODEL, backend="gemini")
        except Exception as e:
            if attempt >= max_retries or not _is_rate_limit(e):
                raise
            time.sleep(backoff)
            backoff *= 2
            attempt += 1


def ollama_generate(
    prompt: str,
    *,
    system: str | None = None,
    max_tokens: int = 1024,
    temperature: float = 0.2,
) -> LLMResponse:
    """Call a local Ollama model. Use when Gemini is exhausted or you want offline."""
    import requests

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "system": system or "",
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }
    r = requests.post(f"{OLLAMA_BASE_URL}/api/generate", json=payload, timeout=120)
    r.raise_for_status()
    body = r.json()
    return LLMResponse(text=(body.get("response") or "").strip(), model=OLLAMA_MODEL, backend="ollama")


def llm_generate(
    prompt: str,
    *,
    backend: str = "gemini",
    system: str | None = None,
    max_tokens: int = 1024,
    temperature: float = 0.2,
) -> LLMResponse:
    """Backend-agnostic helper.

    Backends:
      "gemini" — primary, free tier, paced + retried.
      "ollama" — local fallback. Slower but unlimited.
      "auto"   — try Gemini; on persistent rate-limit error, fall back to Ollama.
    """
    if backend == "ollama":
        return ollama_generate(prompt, system=system, max_tokens=max_tokens, temperature=temperature)
    if backend == "auto":
        try:
            return gemini_generate(prompt, system=system, max_tokens=max_tokens, temperature=temperature)
        except Exception as e:
            if _is_rate_limit(e):
                return ollama_generate(
                    prompt, system=system, max_tokens=max_tokens, temperature=temperature
                )
            raise
    return gemini_generate(prompt, system=system, max_tokens=max_tokens, temperature=temperature)
