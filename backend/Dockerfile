FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
  && pip install -r requirements.txt

COPY . .

# Do NOT install Playwright browsers in the image (OOM / slow boot on free Railway).
# Maps scrape can install browsers later on a worker; API must stay light.
EXPOSE 8080

CMD ["sh", "-c", "echo PORT=$PORT; alembic upgrade head || echo WARN_alembic_failed; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
