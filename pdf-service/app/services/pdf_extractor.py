import os
import re
import json
import math
import asyncio
import io
import time
from typing import Dict, Any, Optional, List, Tuple
import fitz  # PyMuPDF
import numpy as np
from PIL import Image
import cv2
from dotenv import load_dotenv

load_dotenv()

# Parse single or comma-separated API keys
raw_keys = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY", "")
API_KEYS = [k.strip() for k in raw_keys.split(",") if k.strip()]
VISION_MODEL = os.getenv("VISION_MODEL", "gemini-3.6-flash")
CONCURRENCY_LIMIT = int(os.getenv("CONCURRENCY_LIMIT", "1"))

semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)


class GeminiKeyPool:
    """
    Manages a pool of Google GenAI API keys with automatic failover rotation on 429s.
    """
    def __init__(self, keys: List[str]):
        self.keys = keys
        self.current_index = 0
        self._clients: Dict[str, Any] = {}
        self._lock = asyncio.Lock()

    def get_client(self):
        if not self.keys:
            return None
        key = self.keys[self.current_index]
        if key not in self._clients:
            try:
                from google import genai
                self._clients[key] = genai.Client(api_key=key)
            except Exception as e:
                print(f"[Key-Pool] Error initializing client for key #{self.current_index + 1}:", e)
                return None
        return self._clients[key]

    async def rotate_key(self) -> bool:
        async with self._lock:
            if len(self.keys) <= 1:
                return False
            old_idx = self.current_index
            self.current_index = (self.current_index + 1) % len(self.keys)
            print(f"[Key-Pool Failover] Rotated from Key #{old_idx + 1} to Key #{self.current_index + 1} of {len(self.keys)}")
            return True


key_pool = GeminiKeyPool(API_KEYS)


# =========================================================================
# STAGE 1: REGEX & CAD KEYWORD FILTERING (VECTOR ENGINE)
# =========================================================================

def parse_dimension_string(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None

    clean_text = text.replace(',', '.').strip()
    if not clean_text:
        return None

    upper_raw = clean_text.upper()

    skip_keywords = [
        "ECN", "DATE", "DRAWING", "VERSION", "MODEL", "PAGE", "SHEET", "REV", "ISO", "ART", "PART", 
        "SCALE", "AUTHOR", "CHECKED", "DOC", "TITLE", "COPYRIGHT", "DOKUMENT", "TERRACE", "BEAM", 
        "SLAB", "LAYOUT", "LEVEL", "SECTION", "ELEVATION", "SCHEDULE", "NOTES", "LEGEND", "STRUCTURE", 
        "DETAILS", "CONSTRUCTION", "THICKNESS", "STAIRCASE", "RISER", "TREAD", "PLINTH", "EXPOSURE", 
        "CONDITION", "GRADE", "CONCRETE", "STEEL", "BRICK", "COLUMN", "PROJECT", "CLIENT", "ARCHITECT",
        "ENGINEER", "REVISION", "NOTE", "NORTH", "BELOW", "WALL", "HEIGHT", "THK", "PCC", "FLOORING",
        "INTERNAL", "EXTERNAL", "FRAME", "FRAMED", "COBA", "BAT", "FINISH", "DOG", "LEGGED", "TYPE"
    ]
    if any(kw in upper_raw for kw in skip_keywords):
        return None

    if len(clean_text.split()) > 3:
        return None

    if re.search(r'\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}', clean_text):
        return None

    if re.match(r'^(B|S|C|BR|RB|MLB|C-)\d*$', upper_raw):
        return None

    clean_text = re.sub(r'^\d+[\.\)](?!\d)\s*', '', clean_text).strip()
    if not clean_text:
        return None

    prefix = ""
    prefix_match = re.match(r'^([ØøRM]|SR|SØ|SQ)?\s*', clean_text, re.IGNORECASE)
    if prefix_match and prefix_match.group(1):
        prefix = prefix_match.group(1).upper()
        clean_text = clean_text[prefix_match.end():].strip()

    # Pattern 0: Assignment e.g. "HEIGHT = 2.77M"
    assign_match = re.search(r'[=:]\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z"\'°]+)?', clean_text)
    if assign_match:
        nominal = float(assign_match.group(1))
        unit = assign_match.group(2).lower() if assign_match.group(2) else "mm"
        if 0 < nominal <= 9999:
            return {
                "found": True,
                "rawText": text.strip(),
                "nominalValue": nominal,
                "upperTolerance": 0.0,
                "lowerTolerance": 0.0,
                "unit": unit,
                "prefix": prefix,
                "extractionMode": "VECTOR_AUTOMATIC"
            }

    # Pattern 1: Symmetric tolerance e.g. 25 ± 0.1
    sym_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*(?:±|\+/-|\+-)\s*([0-9]+(?:\.[0-9]+)?)', clean_text)
    if sym_match:
        nominal = float(sym_match.group(1))
        tol = float(sym_match.group(2))
        return {
            "found": True,
            "rawText": text.strip(),
            "nominalValue": nominal,
            "upperTolerance": tol,
            "lowerTolerance": -tol,
            "unit": "mm",
            "prefix": prefix,
            "extractionMode": "VECTOR_AUTOMATIC"
        }

    # Pattern 2: Asymmetric tolerance e.g. 25 +0.1/-0.2
    asym_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*([\+\-][0-9]+(?:\.[0-9]+)?)\s*[\/ ]\s*([\+\-][0-9]+(?:\.[0-9]+)?)', clean_text)
    if asym_match:
        tol1 = float(asym_match.group(2))
        tol2 = float(asym_match.group(3))
        return {
            "found": True,
            "rawText": text.strip(),
            "nominalValue": float(asym_match.group(1)),
            "upperTolerance": max(tol1, tol2),
            "lowerTolerance": min(tol1, tol2),
            "unit": "mm",
            "prefix": prefix,
            "extractionMode": "VECTOR_AUTOMATIC"
        }

    # Pattern 3: Single signed tolerance e.g. 25 +0.1
    single_tol_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*([\+\-][0-9]+(?:\.[0-9]+)?)', clean_text)
    if single_tol_match:
        tol = float(single_tol_match.group(2))
        return {
            "found": True,
            "rawText": text.strip(),
            "nominalValue": float(single_tol_match.group(1)),
            "upperTolerance": tol if tol > 0 else 0.0,
            "lowerTolerance": tol if tol < 0 else 0.0,
            "unit": "mm",
            "prefix": prefix,
            "extractionMode": "VECTOR_AUTOMATIC"
        }

    # Pattern 4: Simple nominal number
    nom_match = re.search(r'^([0-9]+(?:\.[0-9]+)?)', clean_text)
    if nom_match:
        nominal = float(nom_match.group(1))
        if nominal.is_integer() and nominal < 10 and not re.search(r'(mm|m|cm|in|\"|\'|°)', clean_text, re.IGNORECASE):
            return None
        if nominal > 9999 or nominal == 0:
            return None

        return {
            "found": True,
            "rawText": text.strip(),
            "nominalValue": nominal,
            "upperTolerance": 0.0,
            "lowerTolerance": 0.0,
            "unit": "mm",
            "prefix": prefix,
            "extractionMode": "VECTOR_AUTOMATIC"
        }

    return None


def extract_vector_dimensions(page: fitz.Page) -> List[Dict[str, Any]]:
    rect = page.rect
    width, height = rect.width, rect.height
    detected = []
    seen_coords = set()

    words = page.get_text("words")
    if not words:
        return []

    lines_dict = {}
    for w in words:
        key = (w[5], w[6])
        if key not in lines_dict:
            lines_dict[key] = []
        lines_dict[key].append(w)

    rot_matrix = page.rotation_matrix

    for key, line_words in lines_dict.items():
        clean_line = " ".join(w[4] for w in line_words).strip()
        if not clean_line:
            continue

        parsed = parse_dimension_string(clean_line)
        if parsed and parsed.get("found"):
            x0 = min(w[0] for w in line_words)
            y0 = min(w[1] for w in line_words)
            x1 = max(w[2] for w in line_words)
            y1 = max(w[3] for w in line_words)

            b_rect = fitz.Rect(x0, y0, x1, y1)
            if page.rotation != 0:
                b_rect = b_rect * rot_matrix

            cx = (b_rect.x0 + b_rect.x1) / 2.0
            cy = (b_rect.y0 + b_rect.y1) / 2.0
            norm_x = round(cx / width, 4)
            norm_y = round(cy / height, 4)

            if norm_x < 0.0 or norm_y < 0.0 or norm_x > 1.0 or norm_y > 1.0:
                continue

            coord_key = (round(norm_x, 3), round(norm_y, 3))
            if coord_key in seen_coords:
                continue
            seen_coords.add(coord_key)

            detected.append({
                "normX": norm_x,
                "normY": norm_y,
                "bbox": {
                    "x0": round(b_rect.x0 / width, 4),
                    "y0": round(b_rect.y0 / height, 4),
                    "x1": round(b_rect.x1 / width, 4),
                    "y1": round(b_rect.y1 / height, 4)
                },
                "rawText": parsed["rawText"],
                "dimensionText": parsed["rawText"],
                "nominalValue": parsed["nominalValue"],
                "upperTolerance": parsed["upperTolerance"],
                "lowerTolerance": parsed["lowerTolerance"],
                "unit": parsed["unit"],
                "prefix": parsed.get("prefix", ""),
                "isAiExtracted": False,
                "extractionMode": "VECTOR_AUTOMATIC"
            })

    return detected


# =========================================================================
# STAGE 2: DYNAMIC DENSITY-BASED GEMINI VISION PIPELINE WITH FAILOVER POOL
# =========================================================================

def _sync_gemini_call(client, tile_pil: Image.Image, prompt: str):
    from google.genai import types
    return client.models.generate_content(
        model=VISION_MODEL,
        contents=[prompt, tile_pil],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.0
        )
    )


async def call_gemini_vision_tile(tile_pil: Image.Image, tile_id: int) -> List[Dict[str, Any]]:
    client = key_pool.get_client()
    if not client:
        print(f"[Vision Fallback] No valid Gemini API client configured for tile {tile_id}")
        return []

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
          "bbox": [ymin, xmin, ymax, xmax]
        }
      ]
    }
    If none exist, return {"dimensions": []}
    """

    async with semaphore:
        max_attempts = max(3, len(key_pool.keys) * 2)
        for attempt in range(max_attempts):
            try:
                active_client = key_pool.get_client()
                response = await asyncio.to_thread(_sync_gemini_call, active_client, tile_pil, prompt)
                raw_text = response.text.strip() if response.text else ""
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                return json.loads(raw_text.strip()).get("dimensions", [])
            except Exception as ex:
                err_msg = str(ex)
                if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                    rotated = await key_pool.rotate_key()
                    if rotated:
                        print(f"[Vision Fallback] 429 encountered on tile {tile_id}. Instantly retrying with next key in pool...")
                        await asyncio.sleep(0.5)
                        continue
                    else:
                        print(f"[Vision Fallback] All keys exhausted on tile {tile_id}. Backing off 10s...")
                        await asyncio.sleep(10.0)
                else:
                    print(f"[Vision Fallback] Error on tile {tile_id}: {ex}")
                    return []
        return []


async def extract_scanned_dimensions_gemini(page: fitz.Page) -> List[Dict[str, Any]]:
    client = key_pool.get_client()
    if not client:
        return []

    # 1. High-DPI Render
    zoom = 300 / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    img_pil = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    w, h = img_pil.size

    # 2. Complexity / Edge Density Score (OpenCV Canny)
    gray = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    density = np.count_nonzero(edges) / float(edges.size)

    grid_dim = 3 if density > 0.035 else 2
    print(f"[Smart Router] Drawing Edge Density: {density:.4f} -> Slicing into {grid_dim}x{grid_dim} Grid")

    base_w, base_h = w / grid_dim, h / grid_dim
    overlap_x, overlap_y = base_w * 0.15, base_h * 0.15
    tiles = []
    tile_id = 0

    for r in range(grid_dim):
        for c in range(grid_dim):
            x_min = max(0, int(c * base_w - (overlap_x if c > 0 else 0)))
            x_max = min(w, int((c + 1) * base_w + (overlap_x if c < grid_dim - 1 else 0)))
            y_min = max(0, int(r * base_h - (overlap_y if r > 0 else 0)))
            y_max = min(h, int((r + 1) * base_h + (overlap_y if r < grid_dim - 1 else 0)))

            tile_crop = img_pil.crop((x_min, y_min, x_max, y_max))
            t_gray = cv2.cvtColor(np.array(tile_crop), cv2.COLOR_RGB2GRAY)
            t_edges = cv2.Canny(t_gray, 50, 150)
            if (np.count_nonzero(t_edges) / float(t_edges.size) >= 0.0035) or (float(np.var(t_gray)) > 400.0):
                tiles.append({
                    "tileId": tile_id,
                    "image": tile_crop,
                    "normBounds": (x_min / w, y_min / h, x_max / w, y_max / h)
                })
            tile_id += 1

    tasks = [call_gemini_vision_tile(t["image"], t["tileId"]) for t in tiles]
    all_dims = await asyncio.gather(*tasks)

    raw_detections = []
    for tile, dims in zip(tiles, all_dims):
        x0_norm, y0_norm, x1_norm, y1_norm = tile["normBounds"]
        for d in dims:
            bbox = d.get("bbox", [500, 500, 500, 500])
            ymin, xmin, ymax, xmax = bbox[0]/1000.0, bbox[1]/1000.0, bbox[2]/1000.0, bbox[3]/1000.0
            cx, cy = (xmin + xmax) / 2.0, (ymin + ymax) / 2.0
            
            global_x = round(max(0.01, min(0.99, x0_norm + (cx * (x1_norm - x0_norm)))), 4)
            global_y = round(max(0.01, min(0.99, y0_norm + (cy * (y1_norm - y0_norm)))), 4)

            raw_detections.append({
                "normX": global_x,
                "normY": global_y,
                "bbox": {
                    "x0": round(x0_norm + (xmin * (x1_norm - x0_norm)), 4),
                    "y0": round(y0_norm + (ymin * (y1_norm - y0_norm)), 4),
                    "x1": round(x0_norm + (xmax * (x1_norm - x0_norm)), 4),
                    "y1": round(y0_norm + (ymax * (y1_norm - y0_norm)), 4)
                },
                "rawText": d.get("dimensionText", ""),
                "dimensionText": d.get("dimensionText", ""),
                "nominalValue": d.get("nominalValue", 0.0),
                "upperTolerance": d.get("upperTolerance", 0.0),
                "lowerTolerance": d.get("lowerTolerance", 0.0),
                "unit": d.get("unit", "mm"),
                "prefix": "",
                "isAiExtracted": True,
                "extractionMode": "GEMINI_VISION_AI"
            })

    # Deduplicate within 4.5% distance threshold
    deduped = []
    for item in raw_detections:
        if not any(math.hypot(item["normX"] - ex["normX"], item["normY"] - ex["normY"]) < 0.045 and abs(item["nominalValue"] - ex["nominalValue"]) < 0.05 for ex in deduped):
            deduped.append(item)

    return deduped


# =========================================================================
# MAIN ENTRY POINT
# =========================================================================

async def extract_all_dimensions_from_page(file_path: str, page_number: int = 1) -> Dict[str, Any]:
    start_time = time.time()
    try:
        doc = fitz.open(file_path)
        if page_number < 1 or page_number > len(doc):
            return {"success": False, "error": "Invalid page number", "items": []}

        page = doc[page_number - 1]

        # 1. Try Vector Engine First (Instant, $0)
        detected = extract_vector_dimensions(page)
        engine_used = "PYMUPDF_VECTOR_FAST_TRACK"

        # 2. If Scanned/Flat PDF, Fallback to Vision AI Engine
        if len(detected) == 0:
            print("[Smart Router] No vector text found. Switching to Gemini Vision AI Fallback...")
            detected = await extract_scanned_dimensions_gemini(page)
            engine_used = f"GEMINI_VISION_AI_{VISION_MODEL}"

        doc.close()
        elapsed = round(time.time() - start_time, 2)

        return {
            "success": True,
            "engine": engine_used,
            "processingTimeSeconds": elapsed,
            "count": len(detected),
            "items": detected
        }
    except Exception as e:
        print("[Smart Router] extract_all_dimensions error:", e)
        return {"success": False, "error": str(e), "items": []}


def extract_text_at_coordinate(file_path: str, page_number: int, norm_x: float, norm_y: float) -> Dict[str, Any]:
    try:
        doc = fitz.open(file_path)
        page = doc[page_number - 1]
        rect = page.rect
        pdf_x = norm_x * rect.width
        pdf_y = norm_y * rect.height

        search_radius = 40.0
        search_rect = fitz.Rect(
            max(0, pdf_x - search_radius),
            max(0, pdf_y - search_radius),
            min(rect.width, pdf_x + search_radius),
            min(rect.height, pdf_y + search_radius)
        )

        words = page.get_text("words", clip=search_rect)
        if not words:
            return {"found": False, "extractionMode": "MANUAL_FALLBACK"}

        words.sort(key=lambda w: (w[1], w[0]))
        raw_text = " ".join([w[4] for w in words]).strip()
        parsed = parse_dimension_string(raw_text)

        doc.close()
        if parsed:
            return parsed
        return {"found": False, "rawText": raw_text, "extractionMode": "MANUAL_FALLBACK"}
    except Exception as e:
        return {"found": False, "error": str(e), "extractionMode": "MANUAL_FALLBACK"}


def get_pdf_metadata(file_path: str) -> Dict[str, Any]:
    doc = fitz.open(file_path)
    pages_info = [{"pageNumber": i + 1, "width": p.rect.width, "height": p.rect.height} for i, p in enumerate(doc)]
    doc.close()
    return {"pageCount": len(pages_info), "pages": pages_info}