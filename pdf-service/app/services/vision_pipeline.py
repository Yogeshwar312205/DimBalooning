import os
import json
import re
import math
import asyncio
import io
import time
from typing import List, Dict, Any, Optional, Tuple
import fitz  # PyMuPDF
import numpy as np
from PIL import Image
import cv2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
VISION_MODEL = os.getenv("VISION_MODEL", "gemini-1.5-flash")
CONCURRENCY_LIMIT = int(os.getenv("CONCURRENCY_LIMIT", "3"))

# Initialize semaphore for rate-limit control
semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)


def parse_dimension_regex(text: str) -> Optional[Dict[str, Any]]:
    """
    Parses dimension text string into nominal, upper tolerance, lower tolerance, unit, and prefix.
    """
    clean_text = text.strip()
    if not clean_text:
        return None

    # Detect prefix (Ø, R, M, etc.)
    prefix = ""
    prefix_match = re.match(r'^([ØøRM]|SR|SØ|SQ)?\s*', clean_text, re.IGNORECASE)
    if prefix_match and prefix_match.group(1):
        prefix = prefix_match.group(1).upper()
        clean_text = clean_text[prefix_match.end():].strip()

    # Pattern 1: Symmetric tolerance e.g., 25 ± 0.1 or 25±0.10
    sym_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*(?:±|\+/-|\+-)\s*([0-9]+(?:\.[0-9]+)?)', clean_text)
    if sym_match:
        nominal = float(sym_match.group(1))
        tol = float(sym_match.group(2))
        return {
            "dimensionText": text.strip(),
            "nominalValue": nominal,
            "upperTolerance": tol,
            "lowerTolerance": -tol,
            "unit": "mm",
            "prefix": prefix
        }

    # Pattern 2: Asymmetric tolerance e.g., 25 +0.1/-0.2 or 25 +0.10 -0.20
    asym_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*([\+\-][0-9]+(?:\.[0-9]+)?)\s*[\/ ]\s*([\+\-][0-9]+(?:\.[0-9]+)?)', clean_text)
    if asym_match:
        nominal = float(asym_match.group(1))
        tol1 = float(asym_match.group(2))
        tol2 = float(asym_match.group(3))
        return {
            "dimensionText": text.strip(),
            "nominalValue": nominal,
            "upperTolerance": max(tol1, tol2),
            "lowerTolerance": min(tol1, tol2),
            "unit": "mm",
            "prefix": prefix
        }

    # Pattern 3: Single signed tolerance e.g. 25 +0.1 or 25 -0.2
    single_tol_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*([\+\-][0-9]+(?:\.[0-9]+)?)', clean_text)
    if single_tol_match:
        nominal = float(single_tol_match.group(1))
        tol = float(single_tol_match.group(2))
        return {
            "dimensionText": text.strip(),
            "nominalValue": nominal,
            "upperTolerance": tol if tol > 0 else 0.0,
            "lowerTolerance": tol if tol < 0 else 0.0,
            "unit": "mm",
            "prefix": prefix
        }

    # Pattern 4: Simple nominal number e.g. 25 or 25.00
    nom_match = re.search(r'^([0-9]+(?:\.[0-9]+)?)', clean_text)
    if nom_match:
        nominal = float(nom_match.group(1))
        return {
            "dimensionText": text.strip(),
            "nominalValue": nominal,
            "upperTolerance": 0.0,
            "lowerTolerance": 0.0,
            "unit": "mm",
            "prefix": prefix
        }

    return None


def render_pdf_page_to_image(file_path: str, page_number: int = 1, dpi: int = 300) -> Tuple[Image.Image, np.ndarray, int, int]:
    """
    Renders a PDF page to a high-DPI Pillow Image and OpenCV BGR numpy array.
    """
    doc = fitz.open(file_path)
    if page_number < 1 or page_number > len(doc):
        raise ValueError(f"Page number {page_number} out of range (1..{len(doc)})")

    page = doc[page_number - 1]
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)

    img_pil = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, 3))
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)

    doc.close()
    return img_pil, img_bgr, pix.width, pix.height


def extract_macro_metadata(file_path: str, page_number: int = 1) -> Dict[str, Any]:
    """
    Stage 1: Macro Pass.
    Extracts global drawing metadata (Part Number, Revision, Sheet, General Tolerances like ISO 2768).
    """
    doc = fitz.open(file_path)
    page = doc[page_number - 1]
    full_text = page.get_text("text")
    doc.close()

    metadata = {
        "partNumber": None,
        "partName": None,
        "revision": "Rev A",
        "generalTolerance": "ISO 2768-mK",
        "scale": "1:1",
        "unit": "mm",
        "rawTitleBlock": ""
    }

    # Extract revision
    rev_match = re.search(r'(?:REV(?:ISION)?\.?|VER(?:SION)?\.?)\s*[:\-]?\s*([A-Z0-9\.\-]+)', full_text, re.IGNORECASE)
    if rev_match:
        metadata["revision"] = f"Rev {rev_match.group(1).upper()}"

    # Extract part number
    pn_match = re.search(r'(?:PART\s*(?:NO|NUMBER|#)|DWG\s*(?:NO|NUMBER|#)|DRAWING\s*NO)\s*[:\-]?\s*([A-Z0-9\-_]+)', full_text, re.IGNORECASE)
    if pn_match:
        metadata["partNumber"] = pn_match.group(1).strip()

    # Extract general tolerances standard
    tol_match = re.search(r'(ISO\s*2768\s*[\-\s]*[a-zA-Z]+|DIN\s*7168\s*[\-\s]*[a-zA-Z]+|ASME\s*Y14\.\d+)', full_text, re.IGNORECASE)
    if tol_match:
        metadata["generalTolerance"] = tol_match.group(1).strip()

    # Extract unit
    if re.search(r'\b(?:INCHES|INCH|IN\.)\b', full_text, re.IGNORECASE):
        metadata["unit"] = "inch"
    else:
        metadata["unit"] = "mm"

    return metadata


def slice_into_overlapping_grid(
    full_img_pil: Image.Image,
    grid_rows: int = 3,
    grid_cols: int = 3,
    overlap_pct: float = 0.15
) -> List[Dict[str, Any]]:
    """
    Stage 2: Image Slicing.
    Divides the high-resolution drawing into an overlapping 3x3 grid (with 15% overlap).
    Returns tile images with normalized global coordinate bounds [x0, y0, x1, y1].
    """
    w, h = full_img_pil.size
    base_tile_w = w / grid_cols
    base_tile_h = h / grid_rows
    overlap_px_x = base_tile_w * overlap_pct
    overlap_px_y = base_tile_h * overlap_pct

    tiles = []
    tile_id = 0

    for r in range(grid_rows):
        for c in range(grid_cols):
            x_min = max(0, int(c * base_tile_w - (overlap_px_x if c > 0 else 0)))
            x_max = min(w, int((c + 1) * base_tile_w + (overlap_px_x if c < grid_cols - 1 else 0)))
            y_min = max(0, int(r * base_tile_h - (overlap_px_y if r > 0 else 0)))
            y_max = min(h, int((r + 1) * base_tile_h + (overlap_px_y if r < grid_rows - 1 else 0)))

            tile_crop = full_img_pil.crop((x_min, y_min, x_max, y_max))

            tiles.append({
                "tileId": tile_id,
                "row": r,
                "col": c,
                "image": tile_crop,
                "pixelBounds": (x_min, y_min, x_max, y_max),
                "normBounds": (x_min / w, y_min / h, x_max / w, y_max / h),
                "width": x_max - x_min,
                "height": y_max - y_min
            })
            tile_id += 1

    return tiles


def pre_filter_tile_edges(tile_crop_pil: Image.Image, min_edge_density: float = 0.0035) -> Tuple[bool, float]:
    """
    Stage 3: Pre-Filter Engine.
    Uses OpenCV Canny edge detection to compute edge density.
    Returns (keep_tile, edge_density). If edge_density < min_edge_density, tile is skipped.
    """
    # Convert PIL Image to OpenCV Grayscale
    img_np = np.array(tile_crop_pil)
    if len(img_np.shape) == 3:
        gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    else:
        gray = img_np

    # Apply Canny Edge Detector
    edges = cv2.Canny(gray, 50, 150)
    total_pixels = edges.shape[0] * edges.shape[1]
    edge_pixels = np.count_nonzero(edges)
    edge_density = edge_pixels / float(total_pixels) if total_pixels > 0 else 0.0

    # Non-white variance check
    variance = float(np.var(gray))

    # Keep tile if edge density or variance exceeds threshold
    keep = (edge_density >= min_edge_density) or (variance > 400.0)
    return keep, edge_density


async def call_gemini_vision_tile(tile_pil: Image.Image, tile_id: int) -> List[Dict[str, Any]]:
    """
    Calls Google Gemini 1.5 Flash Vision to extract dimension annotations and tolerances from tile image.
    Uses asyncio semaphore to respect rate limits.
    """
    api_key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
    if not api_key:
        return []

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)

        model_name = "gemini-1.5-flash"
        if "2.0" in VISION_MODEL:
            model_name = "gemini-2.0-flash"

        model = genai.GenerativeModel(
            model_name=model_name,
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.1
            }
        )

        prompt = """
You are an expert mechanical engineering Metrology & GD&T Inspection AI.
Analyze this cropped engineering drawing tile and extract EVERY dimensional callout, tolerance, radius, diameter, thread, and linear dimension.

For each dimension found, return a JSON object inside a "dimensions" array with:
- "dimensionText": exact string as printed on the drawing (e.g. "Ø 50.0 ± 0.1", "25 +0.10/-0.20", "R 12.5", "M8x1.25", "100.0")
- "nominalValue": floating point number (e.g. 50.0, 25.0, 12.5, 100.0)
- "upperTolerance": positive float offset from nominal (e.g. 0.1, 0.05, 0.0 if not specified)
- "lowerTolerance": negative/signed float offset from nominal (e.g. -0.1, -0.2, 0.0 if not specified)
- "unit": "mm" or "inch"
- "prefix": "Ø", "R", "M", "SR", or ""
- "type": "LINEAR", "DIAMETER", "RADIUS", "THREAD", "CHAMFER", or "ANGULAR"
- "bbox": [ymin, xmin, ymax, xmax] normalized to [0..1000] within this tile image where [0,0] is top-left and [1000,1000] is bottom-right.

JSON Schema format:
{
  "dimensions": [
    {
      "dimensionText": "string",
      "nominalValue": 0.0,
      "upperTolerance": 0.0,
      "lowerTolerance": 0.0,
      "unit": "mm",
      "prefix": "",
      "type": "LINEAR",
      "bbox": [ymin, xmin, ymax, xmax]
    }
  ]
}
If no dimensional callouts are visible in this tile, return: {"dimensions": []}
"""

        # Convert PIL Image to JPEG bytes
        buffered = io.BytesIO()
        tile_pil.save(buffered, format="JPEG", quality=90)
        img_bytes = buffered.getvalue()

        async with semaphore:
            # Execute with exponential backoff if rate limited
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    response = await asyncio.to_thread(
                        model.generate_content,
                        [
                            prompt,
                            {"mime_type": "image/jpeg", "data": img_bytes}
                        ]
                    )
                    break
                except Exception as ex:
                    if "429" in str(ex) and attempt < max_retries - 1:
                        await asyncio.sleep(2.0 * (attempt + 1))
                    else:
                        raise ex

            if not response or not response.text:
                return []

            parsed_data = json.loads(response.text)
            if isinstance(parsed_data, list):
                return parsed_data
            elif isinstance(parsed_data, dict):
                return parsed_data.get("dimensions", [])
            return []

    except Exception as e:
        print(f"[Vision Pipeline] Gemini extraction error on tile {tile_id}: {e}")
        return []


async def call_groq_vision_tile(tile_pil: Image.Image, tile_id: int) -> List[Dict[str, Any]]:
    """
    Fallback: Calls Groq Vision API if GROQ_API_KEY is available.
    """
    api_key = os.getenv("GROQ_API_KEY", GROQ_API_KEY)
    if not api_key:
        return []

    try:
        from groq import Groq
        import base64

        client = Groq(api_key=api_key)

        buffered = io.BytesIO()
        tile_pil.save(buffered, format="JPEG", quality=85)
        base64_image = base64.b64encode(buffered.getvalue()).decode('utf-8')

        prompt = """
Extract all 2D mechanical engineering drawing dimensions with tolerances from this image.
Return strictly valid JSON with key "dimensions":
{
  "dimensions": [
    {
      "dimensionText": "Ø 50.0 ± 0.1",
      "nominalValue": 50.0,
      "upperTolerance": 0.1,
      "lowerTolerance": -0.1,
      "unit": "mm",
      "prefix": "Ø",
      "type": "DIAMETER",
      "bbox": [ymin, xmin, ymax, xmax]
    }
  ]
}
bbox coordinates should be normalized from 0 to 1000.
"""
        async with semaphore:
            completion = await asyncio.to_thread(
                client.chat.completions.create,
                model="llama-3.2-11b-vision-preview",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
                            }
                        ]
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )

            res_text = completion.choices[0].message.content
            parsed = json.loads(res_text)
            return parsed.get("dimensions", [])
    except Exception as e:
        print(f"[Vision Pipeline] Groq extraction error on tile {tile_id}: {e}")
        return []


def fallback_vector_tile_extraction(file_path: str, page_number: int, tile: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    High-speed local vector extraction fallback for tiles when no Vision LLM key is configured.
    Scans PyMuPDF vector text blocks within the tile's normalized bounds.
    """
    try:
        doc = fitz.open(file_path)
        page = doc[page_number - 1]
        pw, ph = page.rect.width, page.rect.height

        x0_norm, y0_norm, x1_norm, y1_norm = tile["normBounds"]
        clip_rect = fitz.Rect(x0_norm * pw, y0_norm * ph, x1_norm * pw, y1_norm * ph)

        blocks = page.get_text("blocks", clip=clip_rect)
        results = []

        for b in blocks:
            # b = (x0, y0, x1, y1, text, block_no, block_type)
            text = b[4].strip()
            if not text:
                continue

            parsed = parse_dimension_regex(text)
            if parsed and parsed.get("nominalValue") is not None:
                # Convert PDF point coords back to tile local [0..1000]
                bx0, by0, bx1, by1 = b[0], b[1], b[2], b[3]
                tile_pt_w = (x1_norm - x0_norm) * pw
                tile_pt_h = (y1_norm - y0_norm) * ph

                local_ymin = max(0.0, min(1000.0, ((by0 - (y0_norm * ph)) / tile_pt_h) * 1000.0))
                local_xmin = max(0.0, min(1000.0, ((bx0 - (x0_norm * pw)) / tile_pt_w) * 1000.0))
                local_ymax = max(0.0, min(1000.0, ((by1 - (y0_norm * ph)) / tile_pt_h) * 1000.0))
                local_xmax = max(0.0, min(1000.0, ((bx1 - (x0_norm * pw)) / tile_pt_w) * 1000.0))

                parsed["bbox"] = [local_ymin, local_xmin, local_ymax, local_xmax]
                parsed["type"] = "LINEAR" if not parsed.get("prefix") else "DIAMETER" if parsed.get("prefix") in ["Ø", "D"] else "RADIUS"
                results.append(parsed)

        doc.close()
        return results
    except Exception as e:
        print(f"[Vision Pipeline] Vector fallback error: {e}")
        return []


def stitch_and_deduplicate_dimensions(
    tile_results: List[Tuple[Dict[str, Any], List[Dict[str, Any]]]]
) -> List[Dict[str, Any]]:
    """
    Stage 5 & 6: Deduplication and Global Coordinate Mapping.
    1. Translates tile local bounding boxes [0..1000] to global drawing canvas coordinates [0.0..1.0].
    2. Merges duplicate detections occurring across overlapping tile boundaries.
    """
    raw_detections = []

    for tile, dims in tile_results:
        x0_norm, y0_norm, x1_norm, y1_norm = tile["normBounds"]
        tile_w_norm = x1_norm - x0_norm
        tile_h_norm = y1_norm - y0_norm

        for d in dims:
            bbox = d.get("bbox", [500, 500, 500, 500])
            ymin_loc = bbox[0] / 1000.0
            xmin_loc = bbox[1] / 1000.0
            ymax_loc = bbox[2] / 1000.0
            xmax_loc = bbox[3] / 1000.0

            center_x_loc = (xmin_loc + xmax_loc) / 2.0
            center_y_loc = (ymin_loc + ymax_loc) / 2.0

            # Global canvas normalized coordinate
            global_x = max(0.01, min(0.99, x0_norm + (center_x_loc * tile_w_norm)))
            global_y = max(0.01, min(0.99, y0_norm + (center_y_loc * tile_h_norm)))

            raw_detections.append({
                "dimensionText": d.get("dimensionText", f"{d.get('nominalValue', '')}"),
                "nominalValue": d.get("nominalValue"),
                "upperTolerance": d.get("upperTolerance", 0.0),
                "lowerTolerance": d.get("lowerTolerance", 0.0),
                "unit": d.get("unit", "mm"),
                "prefix": d.get("prefix", ""),
                "type": d.get("type", "LINEAR"),
                "globalX": global_x,
                "globalY": global_y,
                "tileId": tile["tileId"]
            })

    # Spatial Non-Maximum Suppression / Deduplication
    deduped: List[Dict[str, Any]] = []
    spatial_threshold = 0.045  # 4.5% of canvas dimension distance

    for item in raw_detections:
        is_dup = False
        for existing in deduped:
            dist = math.hypot(item["globalX"] - existing["globalX"], item["globalY"] - existing["globalY"])
            
            # Check if spatially very close
            if dist < spatial_threshold:
                # If nominal values match or are nearly identical
                nom1 = item.get("nominalValue")
                nom2 = existing.get("nominalValue")
                if nom1 is not None and nom2 is not None and abs(nom1 - nom2) < 0.05:
                    is_dup = True
                    break
                elif dist < 0.02: # Extremely close coordinates
                    is_dup = True
                    break

        if not is_dup:
            deduped.append(item)

    # Sort logically: top-to-bottom, left-to-right
    deduped.sort(key=lambda d: (round(d["globalY"], 2), round(d["globalX"], 2)))

    # Assign sequential balloon numbers and spiral balloon position
    final_balloons = []
    for idx, item in enumerate(deduped):
        balloon_num = idx + 1

        # Leader start coordinate is right on the dimension text
        leader_start_x = item["globalX"]
        leader_start_y = item["globalY"]

        # Place balloon circle slightly offset (e.g. up and to the right)
        # to prevent obscuring the dimension text
        balloon_x = max(0.03, min(0.97, leader_start_x + 0.028))
        balloon_y = max(0.03, min(0.97, leader_start_y - 0.028))

        final_balloons.append({
            "balloonNumber": balloon_num,
            "x": round(balloon_x, 4),
            "y": round(balloon_y, 4),
            "leaderStartX": round(leader_start_x, 4),
            "leaderStartY": round(leader_start_y, 4),
            "dimensionText": item["dimensionText"],
            "nominalValue": item["nominalValue"],
            "upperTolerance": item["upperTolerance"],
            "lowerTolerance": item["lowerTolerance"],
            "unit": item["unit"],
            "prefix": item["prefix"],
            "type": item["type"]
        })

    return final_balloons


async def execute_automated_vision_pipeline(
    file_path: str,
    page_number: int = 1
) -> Dict[str, Any]:
    """
    Main Orchestrator for the Complete Automated Vision Extraction Pipeline:
    1. Macro Pass: Extract Title Block & Metadata
    2. Rasterize PDF page to 300 DPI image
    3. Slice into 3x3 overlapping grid (15% overlap)
    4. Pre-filter blank/empty tiles with OpenCV edge density
    5. Async Semaphore Vision Extraction (Gemini 1.5 Flash / Groq / Vector Fallback)
    6. Global coordinate translation and deduplication
    7. Return structured balloons ready for canvas hydration
    """
    start_time = time.time()
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Drawing file not found at: {file_path}")

    # Stage 1: Macro Pass
    macro_meta = extract_macro_metadata(file_path, page_number)

    # Stage 2: Page Rasterization & Slicing
    img_pil, img_bgr, width_px, height_px = render_pdf_page_to_image(file_path, page_number, dpi=300)
    tiles = slice_into_overlapping_grid(img_pil, grid_rows=3, grid_cols=3, overlap_pct=0.15)

    # Stage 3 & 4: Filter and Process Tiles Concurrently
    active_tiles = []
    skipped_tiles = []

    for tile in tiles:
        keep, edge_density = pre_filter_tile_edges(tile["image"])
        tile["edgeDensity"] = round(edge_density, 5)
        if keep:
            active_tiles.append(tile)
        else:
            skipped_tiles.append(tile["tileId"])

    # Determine extraction engine
    gemini_key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
    groq_key = os.getenv("GROQ_API_KEY", GROQ_API_KEY)

    async def process_single_tile(tile: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        if gemini_key:
            dims = await call_gemini_vision_tile(tile["image"], tile["tileId"])
            if not dims:
                # Fallback to vector extraction if AI returned empty on a dense tile
                dims = fallback_vector_tile_extraction(file_path, page_number, tile)
        elif groq_key:
            dims = await call_groq_vision_tile(tile["image"], tile["tileId"])
            if not dims:
                dims = fallback_vector_tile_extraction(file_path, page_number, tile)
        else:
            dims = fallback_vector_tile_extraction(file_path, page_number, tile)

        return (tile, dims)

    # Concurrently execute through Semaphore worker pool
    tasks = [process_single_tile(t) for t in active_tiles]
    tile_results = await asyncio.gather(*tasks)

    # Stage 5 & 6: Deduplication & Global Coordinate Mapping
    extracted_balloons = stitch_and_deduplicate_dimensions(tile_results)

    elapsed_time = round(time.time() - start_time, 2)

    return {
        "success": True,
        "pageNumber": page_number,
        "totalTiles": len(tiles),
        "activeTilesProcessed": len(active_tiles),
        "skippedBlankTiles": skipped_tiles,
        "extractedCount": len(extracted_balloons),
        "processingTimeSeconds": elapsed_time,
        "macroMetadata": macro_meta,
        "balloons": extracted_balloons,
        "engineUsed": "gemini-1.5-flash" if gemini_key else "groq-vision" if groq_key else "pymupdf-vector-fallback"
    }
