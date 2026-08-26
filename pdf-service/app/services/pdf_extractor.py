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

raw_keys = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY", "")
API_KEYS = [k.strip() for k in raw_keys.split(",") if k.strip()]
VISION_MODEL = os.getenv("VISION_MODEL", "gemini-3.6-flash")
CONCURRENCY_LIMIT = int(os.getenv("CONCURRENCY_LIMIT", "1"))

semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)


class GeminiKeyPool:
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
                print(f"❌ [Key-Pool] Error initializing client for key #{self.current_index + 1}:", e)
                return None
        return self._clients[key]

    async def rotate_key(self) -> bool:
        async with self._lock:
            if len(self.keys) <= 1:
                return False
            old_idx = self.current_index
            self.current_index = (self.current_index + 1) % len(self.keys)
            print(f"🔄 [Key-Pool Failover] Rotated from Key #{old_idx + 1} to Key #{self.current_index + 1} of {len(self.keys)}")
            return True


key_pool = GeminiKeyPool(API_KEYS)


# =========================================================================
# STAGE 1: LIGHTNING-FAST CAD VECTOR PARSER (PyMuPDF)
# =========================================================================

def clean_cad_text(raw: str) -> str:
    if not raw:
        return ""
    text = raw
    text = re.sub(r'%%c|%%C', 'Ø', text)
    text = re.sub(r'%%p|%%P', '±', text)
    text = re.sub(r'%%d|%%D', '°', text)
    text = re.sub(r'\\[A-Za-z0-9]+;?', ' ', text)
    text = re.sub(r'\{|\}', ' ', text)
    text = text.replace(',', '.').strip()
    return text


def parse_dimension_candidates(text: str) -> List[Dict[str, Any]]:
    clean_text = clean_cad_text(text)
    if not clean_text or len(clean_text) < 1:
        return []

    upper_raw = clean_text.upper()

    skip_headers = [
        "DRAWING", "TITLE", "SCALE", "AUTHOR", "CHECKED", "APPROVED",
        "COPYRIGHT", "PROJECT", "CLIENT", "ARCHITECT", "ENGINEER",
        "REVISION", "LEGEND", "MATERIAL", "DO NOT SCALE"
    ]
    if any(re.search(r'\b' + kw + r'\b', upper_raw) for kw in skip_headers):
        return []

    if re.fullmatch(r'\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}', clean_text):
        return []

    results = []

    # 1. Symmetric Tolerance (e.g. 25 ± 0.1)
    for m in re.finditer(r'([ØøRM]|DIA|RAD)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:±|\+/-|\+-)\s*([0-9]+(?:\.[0-9]+)?)', clean_text, re.I):
        prefix = (m.group(1) or '').upper()
        nominal = float(m.group(2))
        tol = float(m.group(3))
        results.append({
            "rawText": m.group(0).strip(),
            "nominalValue": nominal,
            "upperTolerance": tol,
            "lowerTolerance": -tol,
            "unit": "mm",
            "prefix": prefix
        })

    # 2. Asymmetric Tolerance (e.g. 25 +0.1/-0.2)
    for m in re.finditer(r'([ØøRM]|DIA|RAD)?\s*([0-9]+(?:\.[0-9]+)?)\s*([\+\-][0-9]+(?:\.[0-9]+)?)\s*[\/\s]\s*([\+\-][0-9]+(?:\.[0-9]+)?)', clean_text, re.I):
        prefix = (m.group(1) or '').upper()
        nominal = float(m.group(2))
        tol1 = float(m.group(3))
        tol2 = float(m.group(4))
        results.append({
            "rawText": m.group(0).strip(),
            "nominalValue": nominal,
            "upperTolerance": max(tol1, tol2),
            "lowerTolerance": min(tol1, tol2),
            "unit": "mm",
            "prefix": prefix
        })

    # 3. Imperial / Architectural (e.g. 11'0", 11'-6", 11'0"X11'6")
    for m in re.finditer(r'([0-9]+)\s*[\'’]\s*[-–]?\s*([0-9]+(?:\.[0-9]+)?)\s*[\"”]', clean_text):
        feet = float(m.group(1))
        inches = float(m.group(2))
        total_inches = (feet * 12.0) + inches
        results.append({
            "rawText": m.group(0).strip(),
            "nominalValue": round(total_inches, 2),
            "upperTolerance": 0.0,
            "lowerTolerance": 0.0,
            "unit": "inch",
            "prefix": ""
        })

    # 4. Standard Metric & Diameters / Radii
    if not results:
        for m in re.finditer(r'(?:^|[\s\(\[\{])([ØøRM]|DIA|RAD|R|Ø)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:MM|INCH|IN|\"|°)?(?:$|[\s\)\]\},])', clean_text, re.I):
            raw_match = m.group(0).strip()
            prefix = (m.group(1) or '').upper()
            try:
                nominal = float(m.group(2))
                if 0.1 <= nominal <= 99999:
                    results.append({
                        "rawText": raw_match,
                        "nominalValue": nominal,
                        "upperTolerance": 0.0,
                        "lowerTolerance": 0.0,
                        "unit": "mm",
                        "prefix": prefix
                    })
            except ValueError:
                pass

    return results


def extract_vector_dimensions(page: fitz.Page) -> List[Dict[str, Any]]:
    rect = page.rect
    width, height = rect.width, rect.height
    detected = []
    seen_coords = set()

    words = page.get_text("words")
    
    if not words or len(words) == 0:
        print("📄 [Vector Engine] 0 raw text tokens found on page.")
        return []

    print(f"🚀 [Vector Engine] Found {len(words)} text tokens -> Running fast-track parser...")

    lines_dict = {}
    for w in words:
        key = (w[5], w[6])
        if key not in lines_dict:
            lines_dict[key] = []
        lines_dict[key].append(w)

    rot_matrix = page.rotation_matrix

    for key, line_words in lines_dict.items():
        raw_line = " ".join(w[4] for w in line_words).strip()
        if not raw_line:
            continue

        candidates = parse_dimension_candidates(raw_line)
        for parsed in candidates:
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

            if norm_x < 0.005 or norm_y < 0.005 or norm_x > 0.995 or norm_y > 0.995:
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
                "dimensionText": f"{parsed.get('prefix', '')} {parsed['rawText']}".strip(),
                "nominalValue": parsed["nominalValue"],
                "upperTolerance": parsed["upperTolerance"],
                "lowerTolerance": parsed["lowerTolerance"],
                "unit": parsed["unit"],
                "prefix": parsed.get("prefix", ""),
                "isAiExtracted": False,
                "extractionMode": "VECTOR_AUTOMATIC"
            })

    print(f"🎯 [Vector Engine] Successfully parsed {len(detected)} vector dimensions in < 0.1s!")
    return detected


# =========================================================================
# STAGE 2: FAST-SCALED GEMINI VISION PIPELINE (SCANNED FALLBACK)
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
                # 20-second timeout to prevent network deadlocks
                response = await asyncio.wait_for(
                    asyncio.to_thread(_sync_gemini_call, active_client, tile_pil, prompt),
                    timeout=25.0
                )
                raw_text = response.text.strip() if response.text else ""
                if raw_text.startswith("```json"):
                    raw_text = raw_text[7:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3]
                print(f"✅ [Gemini AI] Tile {tile_id} finished successfully.")
                return json.loads(raw_text.strip()).get("dimensions", [])
            except asyncio.TimeoutError:
                print(f"⏱️ [Gemini AI] Tile {tile_id} timed out. Rotating key and retrying...")
                await key_pool.rotate_key()
            except Exception as ex:
                err_msg = str(ex)
                if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                    rotated = await key_pool.rotate_key()
                    if rotated:
                        print(f"🔄 [Vision Fallback] 429 on tile {tile_id}. Swapped API key -> retrying...")
                        await asyncio.sleep(0.5)
                        continue
                    else:
                        await asyncio.sleep(8.0)
                else:
                    print(f"⚠️ [Vision Fallback] Error on tile {tile_id}: {ex}")
                    return []
        return []


async def extract_scanned_dimensions_gemini(page: fitz.Page, force_grid: int = 0) -> List[Dict[str, Any]]:
    client = key_pool.get_client()
    if not client:
        return []

    # CLAMP RESOLUTION TO PREVENT HUGE MEMORY SPIKES ON A1/A0 ARCHITECTURAL SHEETS
    rect = page.rect
    max_side = max(rect.width, rect.height)
    target_dpi = 150.0 if max_side > 1500 else 200.0
    scale = target_dpi / 72.0

    print(f"🖼️ [Rasterizer] Rendering PDF page (Scale: {scale:.2f}x)...")
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    img_pil = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    w, h = img_pil.size
    print(f"🖼️ [Rasterizer] Rendered dimensions: {w}x{h} px")

    # Fast edge density
    small_for_canny = cv2.resize(np.array(img_pil), (800, int(800 * (h / w))))
    gray = cv2.cvtColor(small_for_canny, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    density = np.count_nonzero(edges) / float(edges.size)

    if force_grid > 0:
        grid_dim = force_grid
    else:
        grid_dim = 3 if density > 0.035 else 2

    print(f"📷 [Smart Router] Drawing Edge Density: {density:.4f} -> Slicing into {grid_dim}x{grid_dim} Grid ({grid_dim*grid_dim} AI API Calls)")

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
            tiles.append({
                "tileId": tile_id,
                "image": tile_crop,
                "normBounds": (x_min / w, y_min / h, x_max / w, y_max / h)
            })
            tile_id += 1

    print(f"🤖 [Gemini AI] Launching {len(tiles)} concurrent vision tile requests...")
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

    print(f"🎯 [Gemini AI] Finished extraction! Discovered {len(deduped)} deduplicated dimensions.")
    return deduped


# =========================================================================
# MAIN ENTRY POINT: THE SMART TRI-ENGINE ROUTER
# =========================================================================

async def extract_all_dimensions_from_page(file_path: str, page_number: int = 1, force_ai: bool = False, force_grid: int = 0) -> Dict[str, Any]:
    start_time = time.time()
    try:
        doc = fitz.open(file_path)
        if page_number < 1 or page_number > len(doc):
            return {"success": False, "error": "Invalid page number", "items": []}

        page = doc[page_number - 1]

        detected = []
        engine_used = "PYMUPDF_VECTOR_FAST_TRACK"

        # 1. Run Vector Fast-Track
        if not force_ai:
            detected = extract_vector_dimensions(page)

        # 2. If 0 items or Force AI requested -> Fallback to Gemini Vision Engine!
        if len(detected) == 0:
            print("🤖 [Smart Router] No vector text found -> Switching to Gemini Vision AI Fallback...")
            detected = await extract_scanned_dimensions_gemini(page, force_grid=force_grid)
            engine_used = f"GEMINI_VISION_AI_{VISION_MODEL}"

        doc.close()
        elapsed = round(time.time() - start_time, 2)

        print(f"✅ [Extraction Complete] Engine: {engine_used} | Total Balloons: {len(detected)} | Time: {elapsed}s\n")

        return {
            "success": True,
            "engine": engine_used,
            "processingTimeSeconds": elapsed,
            "count": len(detected),
            "items": detected
        }
    except Exception as e:
        print("❌ [Smart Router Error] extract_all_dimensions:", e)
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
        candidates = parse_dimension_candidates(raw_text)

        doc.close()
        if candidates:
            return {
                "found": True,
                **candidates[0],
                "extractionMode": "MANUAL_FALLBACK"
            }
        return {"found": False, "rawText": raw_text, "extractionMode": "MANUAL_FALLBACK"}
    except Exception as e:
        return {"found": False, "error": str(e), "extractionMode": "MANUAL_FALLBACK"}


def get_pdf_metadata(file_path: str) -> Dict[str, Any]:
    doc = fitz.open(file_path)
    pages_info = [{"pageNumber": i + 1, "width": p.rect.width, "height": p.rect.height} for i, p in enumerate(doc)]
    doc.close()
    return {"pageCount": len(pages_info), "pages": pages_info}