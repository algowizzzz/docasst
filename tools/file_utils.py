"""File utility functions."""

import hashlib
import re
import uuid
from pathlib import Path
from typing import Dict, List


def ensure_directory(path: Path) -> Path:
    """Create directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_text_file(path: Path, content: str) -> None:
    """Write text content to file."""
    ensure_directory(path.parent)
    path.write_text(content, encoding="utf-8")


def generate_md_file_id(file_id: str) -> str:
    """Generate a unique file ID from base file ID."""
    return f"{file_id}_md_{uuid.uuid4().hex[:8]}"


def resolve_path(path_str: str) -> Path:
    """Resolve and expand path."""
    return Path(path_str).expanduser().resolve()


def slugify(value: str) -> str:
    """Convert string to URL-friendly slug."""
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or uuid.uuid4().hex[:8]
