#!/bin/sh
set -eu
PORT="${PORT:-8080}"
echo "LeadRankPilot starting on 0.0.0.0:${PORT}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" --log-level info --proxy-headers
