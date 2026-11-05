from __future__ import annotations

import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
key = (os.getenv("GEMINI_API_KEY") or "").strip()
print("key_prefix", key[:8], "len", len(key))

models = [
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
]
payload = {
    "contents": [{"parts": [{"text": 'Reply with JSON {"ok":true} only'}]}],
    "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
}

with httpx.Client(timeout=40.0) as client:
    for model in models:
        try:
            resp = client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                json=payload,
            )
            print(model, resp.status_code, resp.text[:200].replace("\n", " "))
        except Exception as exc:  # noqa: BLE001
            print(model, "EXC", type(exc).__name__, exc)
