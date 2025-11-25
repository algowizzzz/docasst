"""PDF to JSON conversion using Claude Vision."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import time
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    from pdf2image import convert_from_path
    from PIL import Image
except ImportError:
    convert_from_path = None
    Image = None

from tools.llm_client import get_llm_client

logger = logging.getLogger(__name__)


def _image_to_base64(image: Image.Image) -> str:
    """Convert PIL Image to base64 string."""
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode('utf-8')


def _generate_stable_block_id(page: int, block_num: int, content: str) -> str:
    """Generate stable block ID: p{page}_b{block_num}_{hash}"""
    content_hash = hashlib.md5(content[:100].encode()).hexdigest()[:8]
    return f"p{page}_b{block_num}_{content_hash}"


def _generate_table_of_contents(blocks: List[Dict]) -> List[Dict]:
    """Generate table of contents from heading blocks."""
    toc = []
    for block in blocks:
        if block.get('type') == 'heading':
            # Get content text (handle both string and array formats)
            content = block.get('content', '')
            if isinstance(content, list):
                content = ' '.join(seg.get('text', '') for seg in content if isinstance(seg, dict))
            elif not isinstance(content, str):
                content = str(content)
            
            toc.append({
                'title': content,
                'level': block.get('level', 1),
                'block_id': block['id'],
                'page': block.get('page', 1)
            })
    return toc


def _transcribe_page_direct_to_json(image: Image.Image, page_num: int, client) -> Dict[str, Any]:
    """Transcribe PDF page image directly to BlockEditor JSON blocks."""
    image_base64 = _image_to_base64(image)
    
    prompt = """You are a **high-accuracy PDF Vision Transcriber and Structural Layout Engine**.

Your job is to convert this **PDF page image** directly into **structured BlockEditor JSON blocks**, preserving *all* visual, semantic, and structural features with absolute fidelity.

# PRIMARY OBJECTIVE

Extract ALL visible text, formatting, and structure from the PDF image and output as a JSON array of block objects.

# CRITICAL RULES

1. **EXACT CONTENT** - Preserve all text exactly as shown (do not fix grammar, spelling, or OCR errors)
2. **ALL ELEMENTS** - Include headers, footers, logos, footnotes, page numbers, stamps, signatures
3. **INLINE FORMATTING** - Detect bold, italic, underline from font styling
4. **FONT SIZE → HEADING LEVEL** - Largest text = level 1, next = level 2, etc.
5. **NO REWRITING** - Output what you see, not what you think it should be
6. **PRESERVE SPACING** - Maintain line breaks, blank lines, indentation

# BLOCK TYPES

### 1. HEADING
Use for large, bold, standalone text. Detect level from visual font size.

```json
{
  "id": "b1",
  "type": "heading",
  "level": 1,
  "content": "Guideline",
  "formatting": {"bold": true, "size": "large"},
  "bbox": [x1, y1, x2, y2]
}
```

### 2. PARAGRAPH
Regular text blocks. Use inline segments for mixed formatting.

```json
{
  "id": "b2",
  "type": "paragraph",
  "content": [
    {"text": "The ", "bold": false},
    {"text": "Bank Act (BA)", "bold": true},
    {"text": " requires...", "bold": false}
  ],
  "bbox": [...]
}
```

**IMPORTANT:** If paragraph has ANY bold/italic/underline within it, use array format with segments.

### 3. LIST
```json
{
  "id": "b4",
  "type": "bulleted_list",
  "items": [
    {"content": "First item"},
    {"content": "Second item", "children": [{"content": "Nested"}]}
  ]
}
```

### 4. TABLE
```json
{
  "id": "b5",
  "type": "table",
  "columns": ["Name", "Value"],
  "rows": [["Risk Type", "Market"]]
}
```

# OUTPUT FORMAT

Return ONLY a valid JSON object:

```json
{
  "blocks": [
    { ... block 1 ... },
    { ... block 2 ... }
  ],
  "page_metadata": {
    "page_number": """ + str(page_num) + """,
    "has_header": true,
    "has_footer": true
  }
}
```

NO markdown code fences. NO explanations. ONLY JSON."""

    try:
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": image_base64,
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ],
                }
            ],
        )
        
        response_text = response.content[0].text.strip()
        
        # Remove markdown code fences if present
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            response_text = '\n'.join(lines[1:-1]) if len(lines) > 2 else response_text
        
        # Parse JSON
        result = json.loads(response_text)
        blocks = result.get('blocks', [])
        
        logger.info(f"Page {page_num}: Direct JSON transcription created {len(blocks)} blocks")
        return result
        
    except Exception as e:
        logger.error(f"Failed direct JSON transcription for page {page_num}: {e}")
        raise


def convert_pdf_to_json(pdf_path: str, output_dir: str = "data/documents") -> Dict[str, Any]:
    """
    Convert PDF to JSON blocks using Claude Vision.
    
    Args:
        pdf_path: Path to PDF file
        output_dir: Directory for output files
        
    Returns:
        Dictionary with:
        - file_id: Generated file ID
        - block_metadata: List of JSON blocks
        - images: List of extracted images
        - stats: Document statistics
        - toc: Table of contents
    """
    if not convert_from_path:
        raise RuntimeError("pdf2image is required but not installed")
    
    client = get_llm_client()
    source_path = Path(pdf_path)
    
    logger.info(f"Converting PDF to images at 300 DPI: {source_path}")
    
    # Convert PDF pages to images at 300 DPI
    images = convert_from_path(
        str(source_path),
        dpi=300,
        fmt='PNG',
        grayscale=False,
    )
    
    logger.info(f"Converted {len(images)} pages to images")
    
    # Transcribe each page and build block metadata
    all_blocks = []
    failed_pages = []
    start_time = datetime.now()
    
    for page_num, image in enumerate(images, start=1):
        page_success = False
        
        for attempt in range(3):
            try:
                logger.info(f"Transcribing page {page_num}/{len(images)} directly to JSON (attempt {attempt+1}/3)...")
                page_result = _transcribe_page_direct_to_json(image, page_num, client)
                
                # Extract blocks from result
                page_json_blocks = page_result.get('blocks', [])
                
                # Generate stable IDs for each block
                page_blocks = []
                for block_num, block_data in enumerate(page_json_blocks):
                    content_for_id = block_data.get('content', '')
                    if isinstance(content_for_id, list):
                        content_for_id = content_for_id[0].get('text', '') if content_for_id else ''
                    
                    block_id = _generate_stable_block_id(page_num, block_num, str(content_for_id))
                    
                    block_meta = {
                        'id': block_id,
                        'page': page_num,
                        'block_num': block_num,
                        'start_line': block_data.get('start_line', block_num),
                        'end_line': block_data.get('end_line', block_num),
                        'type': block_data.get('type', 'paragraph')
                    }
                    
                    if 'content' in block_data:
                        block_meta['content'] = block_data['content']
                    else:
                        block_meta['content'] = ''
                    
                    # Pass through optional fields
                    optional_fields = [
                        'level', 'formatting', 'indent_level',
                        'items', 'columns', 'rows',
                        'language', 'src', 'alt', 'alignment', 'bbox'
                    ]
                    for field in optional_fields:
                        if field in block_data:
                            block_meta[field] = block_data[field]
                    
                    all_blocks.append(block_meta)
                    page_blocks.append(block_meta)
                
                page_success = True
                break
                
            except json.JSONDecodeError as e:
                if attempt == 2:
                    logger.error(f"❌ Page {page_num} FAILED after 3 attempts: {e}")
                    failed_pages.append({
                        "page": page_num,
                        "error": f"JSON parse error: {str(e)}",
                        "error_type": "JSONDecodeError",
                        "timestamp": datetime.now().isoformat()
                    })
                    break
                else:
                    wait_time = 2 ** attempt
                    logger.warning(f"⚠️ Page {page_num} failed (attempt {attempt+1}/3), retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    
            except Exception as e:
                if attempt == 2:
                    logger.error(f"❌ Page {page_num} FAILED after 3 attempts: {e}")
                    failed_pages.append({
                        "page": page_num,
                        "error": str(e),
                        "error_type": type(e).__name__,
                        "timestamp": datetime.now().isoformat()
                    })
                    break
                else:
                    wait_time = 2 ** attempt
                    logger.warning(f"⚠️ Page {page_num} failed (attempt {attempt+1}/3), retrying in {wait_time}s...")
                    time.sleep(wait_time)
        
        if not page_success or not page_blocks:
            logger.warning(f"Skipping page {page_num} - no blocks generated")
    
    # Generate table of contents
    toc = _generate_table_of_contents(all_blocks)
    
    # Calculate stats
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    processed_pages = len(images) - len(failed_pages)
    
    logger.info(f"Successfully transcribed {processed_pages}/{len(images)} pages")
    if failed_pages:
        logger.warning(f"❌ Failed pages: {len(failed_pages)}")
    logger.info(f"Generated {len(all_blocks)} blocks with stable IDs")
    logger.info(f"Generated TOC with {len(toc)} entries")
    logger.info(f"Total duration: {duration:.2f}s")
    
    # Generate file ID from PDF path
    file_id = source_path.stem
    
    # Build result
    ingestion_stats = {
        "total_pages": len(images),
        "processed_pages": processed_pages,
        "failed_pages": failed_pages,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "duration_seconds": duration
    }
    
    return {
        "file_id": file_id,
        "block_metadata": all_blocks,
        "images": [],  # Images not extracted in this version
        "stats": ingestion_stats,
        "toc": toc,
    }
