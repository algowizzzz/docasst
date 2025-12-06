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
from typing import Any, Dict, List, Tuple, Optional

try:
    from pdf2image import convert_from_path
    from PIL import Image
except ImportError:
    convert_from_path = None
    Image = None

try:
    import fitz  # PyMuPDF
    FITZ_AVAILABLE = True
except ImportError:
    FITZ_AVAILABLE = False
    fitz = None

from tools.llm_client import get_llm_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)


def _image_to_base64(image: Image.Image) -> str:
    """Convert PIL Image to base64 string."""
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode('utf-8')


def _match_llm_image_with_programmatic(
    llm_bbox: List[float],
    programmatic_images: List[Dict[str, Any]],
    page_num: int,
    tolerance: float = 0.3
) -> Optional[Dict[str, Any]]:
    """
    Match an LLM-detected image block with a programmatically extracted image.
    
    Args:
        llm_bbox: Bounding box from LLM [x1, y1, x2, y2] in rendered image coordinates (300 DPI)
        programmatic_images: List of programmatically extracted images
        page_num: Page number (1-indexed)
        tolerance: Fraction of image size to use as matching tolerance (default 0.3 = 30%)
        
    Returns:
        Matching programmatic image dict or None
    """
    # Filter programmatic images for this page
    page_images = [img for img in programmatic_images if img['page_num'] == page_num]
    
    if not page_images:
        return None
    
    # Calculate LLM bbox center and size
    llm_x1, llm_y1, llm_x2, llm_y2 = llm_bbox
    llm_center_x = (llm_x1 + llm_x2) / 2
    llm_center_y = (llm_y1 + llm_y2) / 2
    llm_width = abs(llm_x2 - llm_x1)
    llm_height = abs(llm_y2 - llm_y1)
    
    # Find best match by comparing centers and sizes
    best_match = None
    best_score = float('inf')
    
    for prog_img in page_images:
        prog_bbox = prog_img['bbox_scaled']  # Already scaled to 300 DPI
        prog_x1, prog_y1, prog_x2, prog_y2 = prog_bbox
        prog_center_x = (prog_x1 + prog_x2) / 2
        prog_center_y = (prog_y1 + prog_y2) / 2
        prog_width = abs(prog_x2 - prog_x1)
        prog_height = abs(prog_y2 - prog_y1)
        
        # Calculate distance between centers (normalized by average size)
        center_distance = ((llm_center_x - prog_center_x) ** 2 + (llm_center_y - prog_center_y) ** 2) ** 0.5
        avg_size = (llm_width + llm_height + prog_width + prog_height) / 4
        normalized_distance = center_distance / max(avg_size, 1)
        
        # Calculate size difference (normalized)
        width_diff = abs(llm_width - prog_width) / max(llm_width, prog_width, 1)
        height_diff = abs(llm_height - prog_height) / max(llm_height, prog_height, 1)
        size_score = (width_diff + height_diff) / 2
        
        # Combined score (lower is better)
        score = normalized_distance * 0.6 + size_score * 0.4
        
        # Check if within tolerance
        if normalized_distance <= tolerance and size_score <= tolerance:
            if score < best_score:
                best_score = score
                best_match = prog_img
    
    return best_match


def _crop_image_from_bbox(full_page_image: Image.Image, bbox: List[float]) -> Image.Image:
    """
    Crop an image region from full page using bbox coordinates.
    
    Args:
        full_page_image: PIL Image of the full page
        bbox: [x1, y1, x2, y2] bounding box coordinates
        
    Returns:
        Cropped PIL Image
    """
    if not bbox or len(bbox) != 4:
        raise ValueError(f"Invalid bbox: {bbox}. Expected [x1, y1, x2, y2]")
    
    x1, y1, x2, y2 = bbox
    # Ensure coordinates are within image bounds
    width, height = full_page_image.size
    x1 = max(0, min(int(x1), width))
    y1 = max(0, min(int(y1), height))
    x2 = max(0, min(int(x2), width))
    y2 = max(0, min(int(y2), height))
    
    # PIL crop format: (left, top, right, bottom)
    return full_page_image.crop((x1, y1, x2, y2))


def extract_images_from_pdf_programmatic(
    pdf_path: str, 
    output_dir: str = None,
    dpi: int = 300
) -> List[Dict[str, Any]]:
    """
    Extract images directly from PDF using PyMuPDF with exact coordinates.
    
    This is more accurate than LLM-provided bbox coordinates because it uses
    the actual PDF structure to get precise image positions.
    
    Args:
        pdf_path: Path to PDF file
        output_dir: Optional directory to save extracted images
        dpi: DPI for coordinate scaling (default 300, matching pdf2image conversion)
        
    Returns:
        List of dicts with:
        - page_num: Page number (1-indexed)
        - image_index: Image index on page
        - bbox: [x1, y1, x2, y2] coordinates in PDF space
        - bbox_scaled: [x1, y1, x2, y2] coordinates scaled to match rendered image DPI
        - image_bytes: Raw image bytes
        - image_ext: Image extension (png, jpg, etc.)
        - width: Image width in pixels
        - height: Image height in pixels
    """
    if not FITZ_AVAILABLE:
        raise RuntimeError("PyMuPDF (fitz) is required. Install with: pip install pymupdf")
    
    doc = fitz.open(pdf_path)
    extracted_images = []
    output_path = Path(output_dir) if output_dir else None
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        page_rect = page.rect  # Page dimensions in PDF points (72 DPI)
        
        # Get all images on this page with full metadata
        images = page.get_images(full=True)
        
        for img_index, img in enumerate(images):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            
            # Get image position on page (bbox in PDF points)
            # Use get_image_rects which returns list of rectangles where image appears
            try:
                rects = page.get_image_rects(xref)
                if not rects or len(rects) == 0:
                    logger.warning(f"No rectangles found for image {img_index} (xref={xref}) on page {page_num + 1}")
                    continue
                # Use first rectangle (image might appear multiple times)
                rect = rects[0]
                pdf_bbox = [rect.x0, rect.y0, rect.x1, rect.y1]
            except Exception as e:
                logger.warning(f"Could not get bbox for image {img_index} (xref={xref}) on page {page_num + 1}: {e}")
                continue
            
            # Scale coordinates from PDF points (72 DPI) to target DPI
            # PDF uses 72 DPI, we render at 300 DPI, so scale factor = 300/72
            scale_factor = dpi / 72.0
            scaled_bbox = [
                pdf_bbox[0] * scale_factor,  # x1
                pdf_bbox[1] * scale_factor,  # y1
                pdf_bbox[2] * scale_factor,  # x2
                pdf_bbox[3] * scale_factor   # y2
            ]
            
            # Get image dimensions
            if Image is None:
                # Fallback: try to get dimensions from base_image metadata
                width = base_image.get("width", 0)
                height = base_image.get("height", 0)
            else:
                img_pil = Image.open(BytesIO(image_bytes))
                width, height = img_pil.size
            
            image_data = {
                "page_num": page_num + 1,
                "image_index": img_index,
                "bbox": pdf_bbox,  # Original PDF coordinates (72 DPI)
                "bbox_scaled": scaled_bbox,  # Scaled to match rendered image (300 DPI)
                "image_bytes": image_bytes,
                "image_ext": image_ext,
                "width": width,
                "height": height,
            }
            
            # Save image if output directory provided
            if output_path:
                output_path.mkdir(parents=True, exist_ok=True)
                image_filename = output_path / f"page_{page_num + 1:03d}_extracted_image_{img_index}.{image_ext}"
                with open(image_filename, "wb") as img_file:
                    img_file.write(image_bytes)
                image_data["saved_path"] = str(image_filename)
            
            extracted_images.append(image_data)
            logger.debug(f"Extracted image {img_index} from page {page_num + 1}: bbox={pdf_bbox}, scaled={scaled_bbox}")
    
    doc.close()
    logger.info(f"Extracted {len(extracted_images)} images from PDF using PyMuPDF")
    return extracted_images


def _generate_stable_block_id(page: int, block_num: int, content: str) -> str:
    """Generate stable block ID: p{page}_b{block_num}_{hash}"""
    content_hash = hashlib.md5(content[:100].encode()).hexdigest()[:8]
    return f"p{page}_b{block_num}_{content_hash}"




def _load_extraction_prompt() -> str:
    """Load PDF extraction prompt from config file."""
    prompt_path = Path("config/prompts/pdf_extraction_prompt.md")
    if not prompt_path.exists():
        # Fallback to default if file doesn't exist
        logger.warning(f"Prompt file not found: {prompt_path}, using default")
        return ""
    return prompt_path.read_text(encoding='utf-8')


def _transcribe_page_direct_to_json(image: Image.Image, page_num: int, client, save_intermediary: bool = False, intermediary_dir: Path = None) -> Dict[str, Any]:
    """Transcribe PDF page image directly to BlockEditor JSON blocks."""
    image_base64 = _image_to_base64(image)
    
    # Save base64 if requested
    if save_intermediary and intermediary_dir:
        base64_path = intermediary_dir / f"page_{page_num:03d}_base64.txt"
        base64_path.write_text(image_base64, encoding='utf-8')
    
    # Load prompt from file
    prompt_template = _load_extraction_prompt()
    if not prompt_template:
        # Fallback to minimal prompt if file not found
        logger.warning("Using fallback prompt - config/prompts/pdf_extraction_prompt.md not found")
        prompt_template = """You are a PDF Vision Transcriber. Convert this PDF page image into structured JSON blocks. Return ONLY valid JSON with blocks array and page_metadata."""
    
    # Replace page number placeholder
    prompt = prompt_template.replace("{{page_number}}", str(page_num))

    # Model selection: Use better model for more reliable JSON output
    # Haiku is faster/cheaper but less reliable for strict JSON formatting
    # Sonnet is more reliable and still cost-effective
    # Opus is most reliable but more expensive
    # Check both PDF_EXTRACTION_MODEL and ANTHROPIC_MODEL env vars
    # Default to claude-3-opus-20240229 (known working model with vision)
    model = os.environ.get('PDF_EXTRACTION_MODEL') or os.environ.get('ANTHROPIC_MODEL') or 'claude-3-opus-20240229'
    logger.info(f"🤖 Using model: {model}")
    
    # System message to reinforce JSON-only output
    system_message = (
        "You are a PDF transcription system. Your ONLY job is to return valid JSON. "
        "Do NOT wrap JSON in markdown code fences. Do NOT add explanatory text. "
        "Return ONLY the raw JSON object starting with { and ending with }."
    )
    
    # Model-specific max_tokens limits
    # Claude 3 Opus: 4096 max, Claude 3.5 Sonnet: 8192 max
    max_output_tokens = 8192 if 'sonnet' in model.lower() else 4096
    
    try:
        response = client.messages.create(
            model=model,
            max_tokens=max_output_tokens,
            system=system_message,
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
        
        # Fix 1: Validate response structure
        if not response or not hasattr(response, 'content') or not response.content:
            raise ValueError("Empty or invalid API response")
        
        if len(response.content) == 0:
            raise ValueError("API response has no content blocks")
        
        if not hasattr(response.content[0], 'text'):
            raise ValueError("API response content block has no text attribute")
        
        response_text = response.content[0].text.strip()
        
        # Fix 1: Validate response text is not empty
        if not response_text:
            raise ValueError("API response text is empty")
        
        # Fix 5: Save raw response BEFORE parsing (for debugging)
        if save_intermediary and intermediary_dir:
            raw_response_path = intermediary_dir / f"page_{page_num:03d}_api_response_raw.txt"
            raw_response_path.write_text(response_text, encoding='utf-8')
            logger.debug(f"Saved raw API response to {raw_response_path}")
        
        # Remove markdown code fences if present
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            response_text = '\n'.join(lines[1:-1]) if len(lines) > 2 else response_text
        
        # Parse JSON
        result = json.loads(response_text)
        blocks = result.get('blocks', [])
        
        # Save parsed JSON response if requested
        if save_intermediary and intermediary_dir:
            parsed_response_path = intermediary_dir / f"page_{page_num:03d}_api_response.json"
            parsed_response_path.write_text(
                json.dumps(result, indent=2, ensure_ascii=False),
                encoding='utf-8'
            )
        
        logger.info(f"✅ Page {page_num}: Direct JSON transcription created {len(blocks)} blocks")
        return result
        
    except Exception as e:
        logger.error(f"Failed direct JSON transcription for page {page_num}: {e}")
        # Fix 5: Save error context for debugging
        if save_intermediary and intermediary_dir:
            error_path = intermediary_dir / f"page_{page_num:03d}_error.txt"
            error_path.write_text(
                f"Error: {str(e)}\n\n"
                f"Error type: {type(e).__name__}\n\n"
                f"If response was received, it would be saved above.",
                encoding='utf-8'
            )
        raise


def convert_pdf_to_json(
    pdf_path: str, 
    output_dir: str = "data/documents", 
    save_intermediary: bool = None,
    extract_images: bool = None
) -> Dict[str, Any]:
    """
    Convert PDF to JSON blocks using Claude Vision with programmatic image extraction.
    
    Uses a hybrid approach:
    - LLM (Claude Vision): Detects text, structure, and image presence (semantic detection)
    - Programmatic extraction (PyMuPDF): Provides accurate image coordinates and image data
    - Matches LLM-detected image blocks with programmatically extracted images
    
    Args:
        pdf_path: Path to PDF file
        output_dir: Directory for output files
        save_intermediary: If True, save intermediary files (images, API responses, etc.)
        extract_images: If True, extract images using programmatic extraction (accurate) or
                        fallback to LLM bbox cropping (less accurate if PyMuPDF unavailable).
                        If False, image blocks only have metadata (bbox, role, etc.) without src.
                        Defaults to environment variable EXTRACT_PDF_IMAGES or True.
        
    Returns:
        Dictionary with:
        - file_id: Generated file ID
        - block_metadata: List of JSON blocks
        - images: List of extracted images
        - stats: Document statistics
    """
    if not convert_from_path:
        raise RuntimeError("pdf2image is required but not installed")
    
    client = get_llm_client()
    source_path = Path(pdf_path)
    
    # Check environment variable if save_intermediary not explicitly set
    if save_intermediary is None:
        save_intermediary = os.environ.get('SAVE_PDF_INTERMEDIARY', 'true').lower() == 'true'
    
    # Check environment variable if extract_images not explicitly set
    # Default to True - extract image data so images render in UI
    if extract_images is None:
        extract_images = os.environ.get('EXTRACT_PDF_IMAGES', 'true').lower() == 'true'
    
    # Create intermediary directory if saving
    intermediary_dir = None
    if save_intermediary:
        intermediary_dir = Path(output_dir) / "intermediary" / source_path.stem
        intermediary_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Saving intermediary files to: {intermediary_dir}")
    
    logger.info(f"Converting PDF to images at 300 DPI: {source_path}")
    
    # Convert PDF pages to images at 300 DPI
    images = convert_from_path(
        str(source_path),
        dpi=300,
        fmt='PNG',
        grayscale=False,
    )
    
    logger.info(f"Converted {len(images)} pages to images")
    
    # Save page images if requested
    if save_intermediary and intermediary_dir:
        for page_num, image in enumerate(images, start=1):
            image_path = intermediary_dir / f"page_{page_num:03d}.png"
            image.save(str(image_path), "PNG")
        logger.info(f"Saved {len(images)} page images to {intermediary_dir}")
    
    # Extract images programmatically if enabled (for accurate coordinates and image data)
    programmatic_images = []
    if extract_images and FITZ_AVAILABLE:
        try:
            logger.info("🔍 Extracting images programmatically from PDF structure...")
            programmatic_images = extract_images_from_pdf_programmatic(
                str(source_path),
                output_dir=None,  # Don't save separately, we'll use the data directly
                dpi=300
            )
            logger.info(f"✅ Programmatically extracted {len(programmatic_images)} images with exact coordinates")
        except Exception as e:
            logger.warning(f"⚠️  Programmatic image extraction failed: {e}. Falling back to LLM bbox coordinates.")
            programmatic_images = []
    elif extract_images and not FITZ_AVAILABLE:
        logger.warning("⚠️  PyMuPDF not available. Image extraction will use LLM bbox coordinates (may be inaccurate).")
    
    # Transcribe each page and build block metadata
    all_blocks = []
    failed_pages = []
    start_time = datetime.now()
    
    for page_num, image in enumerate(images, start=1):
        page_success = False
        
        for attempt in range(3):
            try:
                logger.info(f"🔄 Transcribing page {page_num}/{len(images)} directly to JSON (attempt {attempt+1}/3)...")
                page_result = _transcribe_page_direct_to_json(image, page_num, client, save_intermediary, intermediary_dir)
                
                # Extract blocks from result
                page_json_blocks = page_result.get('blocks', [])
                
                # Generate stable IDs for each block
                page_blocks = []
                # Track matched programmatic images using (page_num, image_index) tuples
                matched_programmatic_indices = set()
                unmatched_llm_image_blocks = []  # Track LLM image blocks that didn't match programmatic images
                
                for block_num, block_data in enumerate(page_json_blocks):
                    # Extract content for ID generation
                    content_for_id = block_data.get('content', '')
                    if isinstance(content_for_id, list):
                        content_for_id = content_for_id[0].get('text', '') if content_for_id else ''
                    
                    block_id = _generate_stable_block_id(page_num, block_num, str(content_for_id))
                    
                    # Start with ALL fields from API response (fully flexible)
                    block_meta = dict(block_data)
                    
                    # Only override fields we need to set for our system
                    block_meta['id'] = block_id  # Use our stable ID
                    block_meta['page'] = page_num  # Set page number
                    block_meta['block_num'] = block_num  # Set block number within page
                    
                    # Set defaults only if not provided by LLM
                    if 'start_line' not in block_meta:
                        block_meta['start_line'] = block_num
                    if 'end_line' not in block_meta:
                        block_meta['end_line'] = block_num
                    if 'type' not in block_meta:
                        block_meta['type'] = 'paragraph'
                    if 'content' not in block_meta:
                        block_meta['content'] = ''
                    
                    # Extract image data if enabled and this is an image block
                    is_unmatched_llm = False  # Track if this LLM block didn't match
                    
                    if extract_images and block_meta.get('type') == 'image':
                        llm_bbox = block_meta.get('bbox')
                        
                        # Try to match with programmatically extracted image
                        programmatic_match = None
                        matched_prog_index = None
                        if programmatic_images and llm_bbox and isinstance(llm_bbox, list) and len(llm_bbox) == 4:
                            # Filter out already matched programmatic images
                            # Use tuple (page_num, image_index) as unique identifier
                            available_programmatic = [
                                (idx, img) for idx, img in enumerate(programmatic_images)
                                if img['page_num'] == page_num and (page_num, img['image_index']) not in matched_programmatic_indices
                            ]
                            
                            if available_programmatic:
                                # Try matching with available programmatic images
                                for prog_idx, prog_img in available_programmatic:
                                    match_result = _match_llm_image_with_programmatic(
                                        llm_bbox, [prog_img], page_num
                                    )
                                    if match_result:
                                        programmatic_match = match_result
                                        # Use (page_num, image_index) as unique identifier for tracking
                                        matched_prog_index = (page_num, prog_img['image_index'])
                                        # Store the original index for metadata
                                        block_meta['programmatic_image_index'] = prog_img['image_index']
                                        break
                        
                        if programmatic_match:
                            # Use programmatically extracted image (accurate coordinates + actual image data)
                            try:
                                # Get image bytes from programmatic extraction
                                image_bytes = programmatic_match['image_bytes']
                                image_ext = programmatic_match['image_ext']
                                
                                # Convert to PIL Image and then to base64
                                img_pil = Image.open(BytesIO(image_bytes))
                                base64_data = _image_to_base64(img_pil)
                                
                                # Update with programmatic data
                                block_meta['src'] = f"data:image/{image_ext};base64,{base64_data}"
                                block_meta['bbox'] = [int(x) for x in programmatic_match['bbox_scaled']]
                                
                                # Optionally save extracted image for debugging
                                if save_intermediary and intermediary_dir:
                                    extracted_path = intermediary_dir / f"page_{page_num:03d}_image_{block_num}_programmatic.{image_ext}"
                                    img_pil.save(str(extracted_path), image_ext.upper())
                                
                                logger.info(f"✅ Used programmatic extraction for image block {block_id} on page {page_num} (bbox: {block_meta['bbox']})")
                                
                                # Mark this programmatic image as matched
                                if matched_prog_index is not None:
                                    matched_programmatic_indices.add(matched_prog_index)
                                    block_meta['extraction_method'] = 'programmatic'
                            except Exception as e:
                                logger.warning(f"Failed to process programmatic image for block {block_id}: {e}")
                                # Fall back to LLM bbox cropping
                                programmatic_match = None
                                matched_prog_index = None
                        
                        if not programmatic_match:
                            # Fallback: Use LLM bbox to crop from full page image (less accurate)
                            if llm_bbox and isinstance(llm_bbox, list) and len(llm_bbox) == 4:
                                try:
                                    # Crop image from full page using LLM bbox coordinates
                                    cropped_image = _crop_image_from_bbox(image, llm_bbox)
                                    
                                    # Convert to base64
                                    cropped_base64 = _image_to_base64(cropped_image)
                                    
                                    # Always override/replace src with base64 data URL
                                    block_meta['src'] = f"data:image/png;base64,{cropped_base64}"
                                    block_meta['extraction_method'] = 'llm_bbox'
                                    
                                    # Optionally save cropped image for debugging
                                    if save_intermediary and intermediary_dir:
                                        cropped_path = intermediary_dir / f"page_{page_num:03d}_image_{block_num}_llm_bbox.png"
                                        cropped_image.save(str(cropped_path), "PNG")
                                    
                                    logger.warning(f"⚠️  Used LLM bbox for image block {block_id} (may be inaccurate): {llm_bbox}")
                                    # Mark as unmatched (no programmatic match found) - will be moved to end
                                    is_unmatched_llm = True
                                    unmatched_llm_image_blocks.append({
                                        'original_block': block_meta.copy(),
                                        'reason': 'no_programmatic_match'
                                    })
                                except Exception as e:
                                    logger.warning(f"Failed to extract image for block {block_id}: {e}")
                                    # Mark as unmatched - no valid extraction - will be moved to end
                                    is_unmatched_llm = True
                                    block_meta['extraction_method'] = 'failed'
                                    block_meta['extraction_error'] = str(e)
                                    # Remove invalid src if present
                                    block_meta.pop('src', None)
                                    unmatched_llm_image_blocks.append({
                                        'original_block': block_meta.copy(),
                                        'reason': 'extraction_failed',
                                        'error': str(e)
                                    })
                            else:
                                logger.debug(f"Image block {block_id} missing valid bbox, skipping extraction")
                                # Mark as unmatched - will be moved to end
                                is_unmatched_llm = True
                                block_meta['extraction_method'] = 'no_bbox'
                                # Remove invalid src if present
                                block_meta.pop('src', None)
                                unmatched_llm_image_blocks.append({
                                    'original_block': block_meta.copy(),
                                    'reason': 'no_bbox'
                                })
                    
                    # Only add to blocks if not unmatched (unmatched will be added at end)
                    if not (extract_images and block_meta.get('type') == 'image' and is_unmatched_llm):
                        all_blocks.append(block_meta)
                        page_blocks.append(block_meta)
                
                # Add unmatched LLM image blocks at end of page (if any)
                # These are blocks that were detected by LLM but didn't match programmatic images
                if unmatched_llm_image_blocks:
                    logger.info(f"📋 Adding {len(unmatched_llm_image_blocks)} unmatched LLM image blocks at end of page {page_num}")
                    for unmatched_item in unmatched_llm_image_blocks:
                        unmatched_block = unmatched_item['original_block'].copy()
                        unmatched_block['is_unmatched'] = True
                        unmatched_block['is_unmatched_llm'] = True
                        unmatched_block['unmatched_reason'] = unmatched_item.get('reason', 'unknown')
                        if 'error' in unmatched_item:
                            unmatched_block['extraction_error'] = unmatched_item['error']
                        # Generate new block_num for unmatched items (at end of page)
                        unmatched_block['block_num'] = len(page_blocks)
                        unmatched_block['id'] = _generate_stable_block_id(
                            page_num, unmatched_block['block_num'], 
                            f"unmatched_llm_{unmatched_block.get('id', 'unknown')}"
                        )
                        # Update start/end line
                        unmatched_block['start_line'] = len(page_blocks)
                        unmatched_block['end_line'] = len(page_blocks)
                        all_blocks.append(unmatched_block)
                        page_blocks.append(unmatched_block)
                
                # Add unmatched programmatic images at end of page (if any)
                page_programmatic_images = [
                    (idx, img) for idx, img in enumerate(programmatic_images)
                    if img['page_num'] == page_num and (page_num, img['image_index']) not in matched_programmatic_indices
                ]
                
                if page_programmatic_images:
                    logger.info(f"📋 Adding {len(page_programmatic_images)} unmatched programmatic images at end of page {page_num}")
                    for prog_idx, prog_img in page_programmatic_images:
                        try:
                            # Convert to base64
                            image_bytes = prog_img['image_bytes']
                            image_ext = prog_img['image_ext']
                            img_pil = Image.open(BytesIO(image_bytes))
                            base64_data = _image_to_base64(img_pil)
                            
                            # Create block for unmatched programmatic image
                            unmatched_block = {
                                'id': _generate_stable_block_id(
                                    page_num, len(page_blocks),
                                    f"unmatched_programmatic_image_{prog_idx}"
                                ),
                                'type': 'image',
                                'page': page_num,
                                'block_num': len(page_blocks),
                                'bbox': [int(x) for x in prog_img['bbox_scaled']],
                                'src': f"data:image/{image_ext};base64,{base64_data}",
                                'alt': f"Unmatched programmatic image {prog_idx}",
                                'description': f"Extracted from PDF structure but not detected by LLM",
                                'extraction_method': 'programmatic',
                                'programmatic_image_index': prog_idx,
                                'is_unmatched': True,
                                'unmatched_reason': 'no_llm_match',
                                'start_line': len(page_blocks),
                                'end_line': len(page_blocks),
                                'content': '',
                                'role': 'content',
                                'position': 'inline'
                            }
                            
                            # Optionally save extracted image for debugging
                            if save_intermediary and intermediary_dir:
                                extracted_path = intermediary_dir / f"page_{page_num:03d}_unmatched_programmatic_{prog_idx}.{image_ext}"
                                img_pil.save(str(extracted_path), image_ext.upper())
                            
                            all_blocks.append(unmatched_block)
                            page_blocks.append(unmatched_block)
                            
                        except Exception as e:
                            logger.warning(f"Failed to create block for unmatched programmatic image {prog_idx} on page {page_num}: {e}")
                
                # Save per-page blocks if requested
                if save_intermediary and intermediary_dir:
                    page_blocks_path = intermediary_dir / f"page_{page_num:03d}_blocks.json"
                    page_blocks_path.write_text(
                        json.dumps(page_blocks, indent=2, ensure_ascii=False),
                        encoding='utf-8'
                    )
                
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
    
    # Calculate stats
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    processed_pages = len(images) - len(failed_pages)
    
    logger.info(f"✅ Successfully transcribed {processed_pages}/{len(images)} pages")
    if failed_pages:
        logger.warning(f"❌ Failed pages: {len(failed_pages)}")
        for failed in failed_pages:
            logger.warning(f"   - Page {failed['page']}: {failed.get('error', 'Unknown error')}")
    logger.info(f"📦 Generated {len(all_blocks)} blocks with stable IDs")
    logger.info(f"⏱️  Total duration: {duration:.2f}s ({duration/60:.1f} minutes)")
    
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
    
    # Save final aggregated blocks if requested
    if save_intermediary and intermediary_dir:
        all_blocks_path = intermediary_dir / "all_blocks.json"
        all_blocks_path.write_text(
            json.dumps(all_blocks, indent=2, ensure_ascii=False),
            encoding='utf-8'
        )
        
        stats_path = intermediary_dir / "ingestion_stats.json"
        stats_path.write_text(
            json.dumps(ingestion_stats, indent=2, ensure_ascii=False),
            encoding='utf-8'
        )
        
        logger.info(f"Saved intermediary files to {intermediary_dir}")
    
    return {
        "file_id": file_id,
        "block_metadata": all_blocks,
        "images": [],  # Images are embedded in blocks as type='image' with src (base64 data URLs)
        "stats": ingestion_stats,
        "intermediary_dir": str(intermediary_dir) if save_intermediary else None,
    }
