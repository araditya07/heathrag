# HealthRAG backend — FastAPI + sentence-transformers + cross-encoder + Gemini.
# Pre-downloads the local HF models into the image so the first request
# doesn't pay a ~80MB download.

FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf-cache \
    SENTENCE_TRANSFORMERS_HOME=/opt/hf-cache \
    TRANSFORMERS_OFFLINE=0

WORKDIR /app

# System deps for pdfplumber (libgl, fonts), torch, requests
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps. Torch wheels are ~750MB; pinning CPU-only saves bandwidth.
COPY requirements.txt ./
RUN pip install --upgrade pip && \
    pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.0.0" && \
    pip install -r requirements.txt

# Pre-download HF models so the container starts fast.
RUN python -c "from sentence_transformers import SentenceTransformer, CrossEncoder; \
    SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2'); \
    CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')"

# App code
COPY src ./src
COPY data ./data
COPY supabase ./supabase
# Scripts are useful for ad-hoc reingestion from inside the container
COPY scripts ./scripts

EXPOSE 8000
CMD ["uvicorn", "src.api.server:app", "--host", "0.0.0.0", "--port", "8000"]
