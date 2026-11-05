from __future__ import annotations

from app.services.connectors.custom import CustomPublisher
from app.services.connectors.export_fallback import ExportPublisher
from app.services.connectors.wordpress_adapter import WordPressPublisher

_REGISTRY = {
    "wordpress": WordPressPublisher(),
    "custom": CustomPublisher(),
    "export": ExportPublisher(),
}


def get_publisher(connector_type: str):
    key = (connector_type or "").strip().lower()
    publisher = _REGISTRY.get(key)
    if publisher is None:
        supported = ", ".join(sorted(_REGISTRY))
        raise ValueError(f"Unsupported connector type '{connector_type}'. Supported: {supported}")
    return publisher


def supported_connectors() -> list[str]:
    return sorted(_REGISTRY.keys())
