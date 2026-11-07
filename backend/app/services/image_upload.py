"""Blog image uploads — Cloudinary when configured, else local /media."""

from __future__ import annotations

import asyncio
import re
import secrets
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def uploads_root() -> Path:
    root = Path(__file__).resolve().parents[2] / "data" / "uploads"
    images = root / "images"
    images.mkdir(parents=True, exist_ok=True)
    return root


def slugify_filename(value: str, *, fallback: str = "image") -> str:
    text = (value or "").strip().lower()
    text = text.replace("_", "-").replace(" ", "-")
    text = re.sub(r"[^a-z0-9-]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or fallback


def _strip_env(value: str) -> str:
    text = (value or "").strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {'"', "'"}:
        text = text[1:-1].strip()
    return text


def _cloudinary_creds() -> tuple[str, str, str]:
    cloud = _strip_env(settings.cloudinary_cloud_name)
    key = _strip_env(settings.cloudinary_api_key)
    secret = _strip_env(settings.cloudinary_api_secret)
    if cloud and key and secret:
        return cloud, key, secret

    url = _strip_env(settings.cloudinary_url)
    # cloudinary://API_KEY:API_SECRET@CLOUD_NAME
    if url.startswith("cloudinary://"):
        rest = url[len("cloudinary://") :]
        if "@" in rest and ":" in rest.split("@", 1)[0]:
            auth, cloud_name = rest.rsplit("@", 1)
            api_key, api_secret = auth.split(":", 1)
            return cloud_name.strip(), api_key.strip(), api_secret.strip()
    return "", "", ""


def cloudinary_enabled() -> bool:
    cloud, key, secret = _cloudinary_creds()
    return bool(cloud and key and secret)


def _configure_cloudinary() -> None:
    import cloudinary

    cloud, key, secret = _cloudinary_creds()
    if not (cloud and key and secret):
        raise ValueError("Cloudinary credentials are incomplete")
    cloudinary.config(cloud_name=cloud, api_key=key, api_secret=secret, secure=True)


def _extension_for(upload: UploadFile) -> str:
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type in ALLOWED_CONTENT_TYPES:
        return ALLOWED_CONTENT_TYPES[content_type]
    name = upload.filename or ""
    suffix = Path(name).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    raise ValueError("Only JPG, PNG, WEBP, or GIF images are allowed")


async def _read_upload(upload: UploadFile) -> tuple[bytes, str]:
    ext = _extension_for(upload)
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 64)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_IMAGE_BYTES:
            raise ValueError("Image must be 5 MB or smaller")
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise ValueError("Empty image upload")
    return data, ext


async def save_blog_image(upload: UploadFile, *, slug_hint: str | None = None) -> dict[str, str]:
    data, ext = await _read_upload(upload)
    original_stem = Path(upload.filename or "image").stem
    hint_stem = Path((slug_hint or "").strip()).stem if (slug_hint or "").strip() else ""
    base = slugify_filename(hint_stem or original_stem, fallback="image")
    public_id = f"{base}-{secrets.token_hex(3)}"
    content_type = (upload.content_type or "").split(";")[0].strip().lower()

    if cloudinary_enabled():
        import cloudinary.uploader

        _configure_cloudinary()
        folder = (settings.cloudinary_folder or "leadrankpilot/blogs").strip().strip("/")

        def _upload() -> dict:
            return cloudinary.uploader.upload(
                data,
                folder=folder,
                public_id=public_id,
                resource_type="image",
                overwrite=False,
            )

        try:
            result = await asyncio.to_thread(_upload)
        except Exception as exc:  # noqa: BLE001 — surface Cloudinary/API errors cleanly
            raise ValueError(f"Cloudinary upload failed: {exc}") from exc
        secure_url = str(result.get("secure_url") or result.get("url") or "").strip()
        if not secure_url:
            raise ValueError("Cloudinary upload returned no URL")
        filename = f"{public_id}{ext}"
        return {
            "filename": filename,
            "path": secure_url,
            "url": secure_url,
            "original_name": upload.filename or filename,
            "content_type": content_type or str(result.get("format") or ""),
            "bytes": str(len(data)),
            "id": str(result.get("public_id") or uuid.uuid4()),
            "storage": "cloudinary",
        }

    filename = f"{public_id}{ext}"
    destination = uploads_root() / "images" / filename
    destination.write_bytes(data)
    return {
        "filename": filename,
        "path": f"/media/images/{filename}",
        "original_name": upload.filename or filename,
        "content_type": content_type,
        "bytes": str(len(data)),
        "id": str(uuid.uuid4()),
        "storage": "local",
    }
