"""File utility functions."""

import hashlib
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List


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


def blocks_to_markdown(block_metadata: List[Dict[str, Any]]) -> str:
    """Convert JSON blocks to markdown format."""
    if not block_metadata:
        return ""
    
    lines = []
    for block in block_metadata:
        block_type = block.get("type", "paragraph")
        content = block.get("content", "")
        level = block.get("level", 1)
        
        if block_type == "heading":
            # Heading: # for level 1, ## for level 2, etc.
            prefix = "#" * level
            if isinstance(content, str):
                lines.append(f"{prefix} {content}")
            else:
                # If content is array, extract text
                text = "".join(seg.get("text", "") for seg in content if isinstance(seg, dict))
                lines.append(f"{prefix} {text}")
            lines.append("")
        
        elif block_type == "paragraph":
            if isinstance(content, str):
                lines.append(content)
            elif isinstance(content, list):
                # Handle formatted segments
                text_parts = []
                for seg in content:
                    if isinstance(seg, dict):
                        text = seg.get("text", "")
                        if seg.get("bold"):
                            text = f"**{text}**"
                        if seg.get("italic"):
                            text = f"*{text}*"
                        if seg.get("code"):
                            text = f"`{text}`"
                        text_parts.append(text)
                    else:
                        text_parts.append(str(seg))
                lines.append("".join(text_parts))
            else:
                lines.append(str(content))
            lines.append("")
        
        elif block_type in ["bulleted_list", "numbered_list"]:
            items = block.get("items", [])
            for i, item in enumerate(items):
                if isinstance(item, dict):
                    item_content = item.get("content", "")
                    prefix = "- " if block_type == "bulleted_list" else f"{i+1}. "
                    lines.append(f"{prefix}{item_content}")
                else:
                    prefix = "- " if block_type == "bulleted_list" else f"{i+1}. "
                    lines.append(f"{prefix}{item}")
            lines.append("")
        
        elif block_type == "table":
            columns = block.get("columns", [])
            rows = block.get("rows", [])
            if columns:
                # Header
                lines.append("| " + " | ".join(str(c) for c in columns) + " |")
                lines.append("| " + " | ".join(["---"] * len(columns)) + " |")
                # Rows
                for row in rows:
                    lines.append("| " + " | ".join(str(c) for c in row) + " |")
                lines.append("")
        
        elif block_type == "blockquote":
            if isinstance(content, str):
                lines.append(f"> {content}")
            lines.append("")
        
        elif block_type == "code":
            code_content = content if isinstance(content, str) else str(content)
            lang = block.get("language", "")
            lines.append(f"```{lang}")
            lines.append(code_content)
            lines.append("```")
            lines.append("")
        
        elif block_type == "divider":
            lines.append("---")
            lines.append("")
    
    return "\n".join(lines)
