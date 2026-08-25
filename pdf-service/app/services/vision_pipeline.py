import os
import json
import re
import math
import asyncio
import time
from typing import List, Dict, Any, Optional, Tuple
import fitz  # PyMuPDF
import numpy as np
from PIL import Image
import cv2
from dotenv import load_dotenv

from google import genai
from google.genai import types

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
VISION_MODEL = os.getenv("VISION_MODEL", "gemini-3.6-flash")
CONCURRENCY_LIMIT = int(os.getenv("CONCURRENCY_LIMIT", "1"))

semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

# USE SYNCHRONOUS CLIENT TO PREVENT FASTAPI DEADLOCKS
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

def parse_dimension_regex(text: str) -> Optional[Dict[str, Any]]:
    clean_text = text.strip()
    if not clean_text: return None
    prefix = ""
    prefix_match = re.match(r'^([ØøRM]|SR|SØ|SQ)?\s*', clean_text, re.IGNORECASE)
    if prefix_match and prefix_match.group(1):
        prefix = prefix_match.group(1).upper()
        clean_text = clean_text[prefix_match.end():].strip()
    sym_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*(?:±|\+/-|\+-)\s*([0-9]+(?:\.[0-9]+)?)', clean_text)
    if sym_match: return {"dimensionText": text.strip(), "nominalValue": float(sym_match.group(1)), "upperTolerance": float(sym_match.group(2)), "lowerTolerance": -float(sym_match.group(2)), "unit": "mm", "prefix": prefix}
    asym_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*([\+\-][0-9]+(?:\.[0-9]+)?)\s*[\/ ]\s*([\+\-][0-9]+(?:\.[0-9]+)?)', clean_text)
    if asym_match: return {"dimensionText": text.strip(), "nominalValue": float(asym_match.group(1)), "upperTolerance": max(float(asym_match.group(2)), float(asym_match.group(3))), "lowerTolerance": min(float(asym_match.group(2)), float(asym_match.group(3))), "unit": "mm", "prefix": prefix}
    nom_match = re.search(r'^([0-9]+(?:\.[0-9]+)?)', clean_text)
    if nom_match: return {"dimensionText": text.strip(), "nominalValue": float(nom_match.group(1)), "upperTolerance": 0.0, "lowerTolerance": 0.0, "unit": "mm", "prefix": prefix}
    return None

def render_pdf_page_to_image(file_path: str, page_number: int = 1, dpi: int = 300) -> Tuple[Image.Image, np.ndarray, int, int]:
    doc = fitz.open(file_path)
    page = doc[page_number - 1]
    zoom = dpi / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    img_pil = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, 3))
    doc.close()
    return img_pil, cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR), pix.width, pix.height

def extract_macro_metadata(file_path: str, page_number: int = 1) -> Dict[str, Any]:
    doc = fitz.open(file_path)
    full_text = doc[page_number - 1].get_text("text")
    doc.close()
    pn_match = re.search(r'(?:PART|DWG)\s*(?:NO|NUMBER|#)\s*[:\-]?\s*([A-Z0-9\-_]+)', full_text, re.I)
    rev_match = re.search(r'(?:REV|VER)\.?\s*[:\-]?\s*([A-Z0-9\.\-]+)', full_text, re.I)
    return {
        "partNumber": pn_match.group(1) if pn_match else None,
        "revision": f"Rev {rev_match.group(1).upper()}" if rev_match else "Rev A",
        "unit": "inch" if re.search(r'\b(?:INCHES|INCH|IN\.)\b', full_text, re.I) else "mm"
    }

def slice_into_overlapping_grid(full_img_pil: Image.Image, grid_rows: int = 3, grid_cols: int = 3, overlap_pct: float = 0.15) -> List[Dict[str, Any]]:
    w, h = full_img_pil.size
    base_tile_w, base_tile_h = w / grid_cols, h / grid_rows
    overlap_px_x, overlap_px_y = base_tile_w * overlap_pct, base_tile_h * overlap_pct
    tiles, tile_id = [], 0
    for r in range(grid_rows):
        for c in range(grid_cols):
            x_min = max(0, int(c * base_tile_w - (overlap_px_x if c > 0 else 0)))
            x_max = min(w, int((c + 1) * base_tile_w + (overlap_px_x if c < grid_cols - 1 else 0)))
            y_min = max(0, int(r * base_tile_h - (overlap_px_y if r > 0 else 0)))
            y_max = min(h, int((r + 1) * base_tile_h + (overlap_px_y if r < grid_rows - 1 else 0)))
            tiles.append({
                "tileId": tile_id, "image": full_img_pil.crop((x_min, y_min, x_max, y_max)),
                "normBounds": (x_min / w, y_min / h, x_max / w, y_max / h)
            })
            tile_id += 1
    return tiles

def pre_filter_tile_edges(tile_crop_pil: Image.Image) -> Tuple[bool, float]:
    gray = cv2.cvtColor(np.array(tile_crop_pil), cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    density = np.count_nonzero(edges) / float(edges.size) if edges.size > 0 else 0.0
    return (density >= 0.0035) or (float(np.var(gray)) > 400.0), density

# Helper function for the background thread
def _sync_gemini_call(tile_pil, prompt):
    return ai_client.models.generate_content(
        model=VISION_MODEL,
        contents=[prompt, tile_pil],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.0
        )
    )

async def call_gemini_vision_tile(tile_pil: Image.Image, tile_id: int) -> List[Dict[str, Any]]:
    if not ai_client: return []

    prompt = """
    Extract ALL dimensional callouts, tolerances, radii, and diameters from this engineering drawing tile.
    Return strictly JSON matching this schema:
    {
      "dimensions": [
        {
          "dimensionText": "exact text e.g. Ø 50.0 ± 0.1",
          "nominalValue": 50.0,
          "upperTolerance": 0.1,
          "lowerTolerance": -0.1,
          "unit": "mm",
          "bbox": [ymin, xmin, ymax, xmax] # normalized 0 to 1000 within this tile image
        }
      ]
    }
    If none exist, return {"dimensions": []}
    """

    async with semaphore:
        # Increased to 5 attempts!
        for attempt in range(5):
            try:
                print(f"[Vision] Processing tile {tile_id} (Attempt {attempt + 1})...")
                response = await asyncio.to_thread(_sync_gemini_call, tile_pil, prompt)
                
                raw_text = response.text.strip() if response.text else ""
                if raw_text.startswith("```json"): raw_text = raw_text[7:]
                if raw_text.endswith("```"): raw_text = raw_text[:-3]
                
                print(f"[Vision] Tile {tile_id} successfully parsed.")
                return json.loads(raw_text.strip()).get("dimensions", [])
                
            except Exception as ex:
                if "429" in str(ex) and attempt < 4:
                    # Wait 30 seconds instead of 5 seconds to let Google's servers breathe!
                    print(f"[Vision] Rate limited on tile {tile_id}. Waiting 30 seconds for quota reset...")
                    await asyncio.sleep(30.0)
                else:
                    print(f"[Vision] Error on tile {tile_id}: {ex}")
                    return []
        return []

def stitch_and_deduplicate_dimensions(tile_results: List[Tuple[Dict[str, Any], List[Dict[str, Any]]]]) -> List[Dict[str, Any]]:
    raw_detections = []
    for tile, dims in tile_results:
        x0_norm, y0_norm, x1_norm, y1_norm = tile["normBounds"]
        for d in dims:
            bbox = d.get("bbox", [500, 500, 500, 500])
            cx, cy = (bbox[1] + bbox[3]) / 2000.0, (bbox[0] + bbox[2]) / 2000.0
            raw_detections.append({
                "dimensionText": d.get("dimensionText", ""),
                "nominalValue": d.get("nominalValue", 0.0),
                "upperTolerance": d.get("upperTolerance", 0.0),
                "lowerTolerance": d.get("lowerTolerance", 0.0),
                "unit": d.get("unit", "mm"),
                "globalX": max(0.01, min(0.99, x0_norm + (cx * (x1_norm - x0_norm)))),
                "globalY": max(0.01, min(0.99, y0_norm + (cy * (y1_norm - y0_norm))))
            })

    deduped = []
    for item in raw_detections:
        if not any(math.hypot(item["globalX"] - ex["globalX"], item["globalY"] - ex["globalY"]) < 0.045 and abs(item["nominalValue"] - ex["nominalValue"]) < 0.05 for ex in deduped):
            deduped.append(item)

    deduped.sort(key=lambda d: (round(d["globalY"], 2), round(d["globalX"], 2)))

    return [{
        "balloonNumber": idx + 1,
        "x": round(min(0.97, item["globalX"] + 0.028), 4),
        "y": round(max(0.03, item["globalY"] - 0.028), 4),
        "leaderStartX": round(item["globalX"], 4),
        "leaderStartY": round(item["globalY"], 4),
        "dimensionText": item["dimensionText"],
        "nominalValue": item["nominalValue"],
        "upperTolerance": item["upperTolerance"],
        "lowerTolerance": item["lowerTolerance"],
        "unit": item["unit"],
        "isAiExtracted": True
    } for idx, item in enumerate(deduped)]

async def execute_automated_vision_pipeline(file_path: str, page_number: int = 1) -> Dict[str, Any]:
    start_time = time.time()
    macro_meta = extract_macro_metadata(file_path, page_number)
    img_pil, _, _, _ = render_pdf_page_to_image(file_path, page_number, dpi=300)
    
    active_tiles, skipped_tiles = [], []
    for tile in slice_into_overlapping_grid(img_pil):
        keep, _ = pre_filter_tile_edges(tile["image"])
        if keep: active_tiles.append(tile)
        else: skipped_tiles.append(tile["tileId"])

    tasks = [call_gemini_vision_tile(t["image"], t["tileId"]) for t in active_tiles]
    all_dims = await asyncio.gather(*tasks)
    
    extracted_balloons = stitch_and_deduplicate_dimensions(list(zip(active_tiles, all_dims)))

    return {
        "success": True,
        "pageNumber": page_number,
        "skippedBlankTiles": skipped_tiles,
        "extractedCount": len(extracted_balloons),
        "processingTimeSeconds": round(time.time() - start_time, 2),
        "macroMetadata": macro_meta,
        "balloons": extracted_balloons,
    }