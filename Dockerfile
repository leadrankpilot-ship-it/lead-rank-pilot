# Build from REPO ROOT (Railway Root Directory empty).
FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --upgrade pip \
  && pip install -r requirements.txt \
  && python -m playwright install --with-deps chromium

COPY backend/ .

EXPOSE 8080

CMD ["sh", "-c", "python -c \"import app.main; print('import_ok')\" && echo listening_on_${PORT:-8080} && exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --log-level info --proxy-headers"]
