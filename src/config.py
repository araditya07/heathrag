"""Centralized configuration and client/model singletons.

Local models (sentence-transformers, cross-encoder) are cached so they only load once
per process. Gemini calls share a single configured client.
"""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


# Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Gemini (free tier)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Ollama (optional offline fallback)
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")

# Local models
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
RERANKER_MODEL = os.environ.get("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")

EMBED_DIM = 384

# Rate-limit pacing for Gemini free tier (15 requests / minute → ~4s between calls).
GEMINI_REQUEST_INTERVAL_SECONDS = float(os.environ.get("GEMINI_REQUEST_INTERVAL_SECONDS", "4.0"))


@lru_cache(maxsize=1)
def supabase_admin():
    from supabase import create_client

    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


@lru_cache(maxsize=1)
def supabase_anon():
    from supabase import create_client

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env")
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


@lru_cache(maxsize=1)
def embedding_model():
    """sentence-transformers encoder. Auto-downloads (~80MB) on first call."""
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(EMBEDDING_MODEL)


@lru_cache(maxsize=1)
def reranker_model():
    """Cross-encoder for relevance scoring. Auto-downloads (~80MB) on first call."""
    from sentence_transformers import CrossEncoder

    return CrossEncoder(RERANKER_MODEL)


@lru_cache(maxsize=1)
def gemini_model():
    import google.generativeai as genai

    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY must be set in .env. Get one free at https://aistudio.google.com"
        )
    genai.configure(api_key=GEMINI_API_KEY)
    return genai.GenerativeModel(GEMINI_MODEL)
