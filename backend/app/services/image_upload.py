"""Local featured-image uploads with slugified filenames."""

from __future__ import annotations

import re
import secrets
import uuid
from pathlib import Path

from fastapi import UploadFile

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


def _extension_for(upload: UploadFile) -> str:
    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type in ALLOWED_CONTENT_TYPES:
        return ALLOWED_CONTENT_TYPES[content_type]
    name = upload.filename or ""
    suffix = Path(name).suffix.lower()
    if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    raise ValueError("Only JPG, PNG, WEBP, or GIF images are allowed")


async def save_blog_image(upload: UploadFile, *, slug_hint: str | None = None) -> dict[str, str]:
    ext = _extension_for(upload)
    original_stem = Path(upload.filename or "image").stem
    hint_stem = Path((slug_hint or "").strip()).stem if (slug_hint or "").strip() else ""
    base = slugify_filename(hint_stem or original_stem, fallback="image")
    # Keep names stable + unique so republish retries do not collide.
    filename = f"{base}-{secrets.token_hex(3)}{ext}"
    destination = uploads_root() / "images" / filename

    total = 0
    with destination.open("wb") as out:
        while True:
            chunk = await upload.read(1024 * 64)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_IMAGE_BYTES:
                out.close()
                destination.unlink(missing_ok=True)
                raise ValueError("Image must be 5 MB or smaller")
            out.write(chunk)

    if total == 0:
        destination.unlink(missing_ok=True)
        raise ValueError("Empty image upload")

    return {
        "filename": filename,
        "path": f"/media/images/{filename}",
        "original_name": upload.filename or filename,
        "content_type": (upload.content_type or "").split(";")[0].strip().lower(),
        "bytes": str(total),
        "id": str(uuid.uuid4()),
    }
