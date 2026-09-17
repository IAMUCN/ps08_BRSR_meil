# OCR worker image (02_TRD.md §12, §35). Model weights are downloaded at build time and baked in, so the
# running worker never depends on the Hugging Face Hub. The image holds no secrets: every setting comes
# from the hosting platform's environment variables (.env.example lists the names).
FROM python:3.12-slim

# OpenCV (pulled in by PaddleOCR) and PaddlePaddle need these shared libraries at import time.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    OCR_MODEL_PATH=/app/models

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY worker/ worker/
COPY scripts/ scripts/
RUN python scripts/download_models.py

# PaddleX writes a small cache under $HOME, so the non-root user gets a home directory.
RUN useradd --create-home --uid 10001 worker
USER worker

CMD ["python", "-m", "worker"]
