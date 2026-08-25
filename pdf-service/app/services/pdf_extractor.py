import fitz  # PyMuPDF
import re
from typing import Dict, Any, Optional

_ocr_reader = None

def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        try:
            import easyocr
            _ocr_reader = easyocr.Reader(['en'], gpu=False)
        except Exception as e:
            print("EasyOCR initialization failed:", e)
            _ocr_reader = False
    return _ocr_reader if _ocr_reader is not False else None


def parse_dimension_string(text: str) -> Optional[Dict[str, Any]]:
    """
    Parses dimension text string into nominal, upper tolerance, lower tolerance, unit, and prefix.
    Filters out metadata text, general notes, item numbers, beam/column labels, and non-dimension CAD text.
    """
    if not text:
        return None

    clean_text = text.replace(',', '.').strip()
    if not clean_text:
        return None

    upper_raw = clean_text.upper()

    # Skip general note titles, text specifications & CAD non-dimension keywords
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

    # Ignore multi-word text blocks (sentences/notes)
    if len(clean_text.split()) > 3:
        return None

    # Ignore dates like 13.10.2023 or 22/11/2022
    if re.search(r'\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}', clean_text):
        return None

    # Ignore CAD element IDs like B1, B4, B8, B12, S1, S2, S3, C-01, C-09, BR2, BR4, RB, MLB
    if re.match(r'^(B|S|C|BR|RB|MLB|C-)\d*$', upper_raw):
        return None

    # Strip list item prefixes like "1. ", "4. ", "10) ", "3. " at start of text (excluding decimals like 3.67)
    clean_text = re.sub(r'^\d+[\.\)](?!\d)\s*', '', clean_text).strip()
    if not clean_text:
        return None

    # Detect prefix (Ø, R, M, etc.)
    prefix = ""
    prefix_match = re.match(r'^([ØøRM]|SR|SØ|SQ)?\s*', clean_text, re.IGNORECASE)
    if prefix_match and prefix_match.group(1):
        prefix = prefix_match.group(1).upper()
        clean_text = clean_text[prefix_match.end():].strip()

    # Pattern 0: Explicit assignment e.g. "HEIGHT = 2.77M" or "THICKNESS = 230MM" or "RISER = 170MM"
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
                "extractionMode": "AUTOMATIC"
            }

    # Pattern 1: Symmetric tolerance e.g., 25 ± 0.1 or 25±0.10
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
            "extractionMode": "AUTOMATIC"
        }

    # Pattern 2: Asymmetric tolerance e.g., 25 +0.1/-0.2 or 25 +0.10 -0.20
    asym_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*([\+\-][0-9]+(?:\.[0-9]+)?)\s*[\/ ]\s*([\+\-][0-9]+(?:\.[0-9]+)?)', clean_text)
    if asym_match:
        nominal = float(asym_match.group(1))
        tol1 = float(asym_match.group(2))
        tol2 = float(asym_match.group(3))
        upper_tol = max(tol1, tol2)
        lower_tol = min(tol1, tol2)
        return {
            "found": True,
            "rawText": text.strip(),
            "nominalValue": nominal,
            "upperTolerance": upper_tol,
            "lowerTolerance": lower_tol,
            "unit": "mm",
            "prefix": prefix,
            "extractionMode": "AUTOMATIC"
        }

    # Pattern 3: Single signed tolerance e.g. 25 +0.1 or 25 -0.2
    single_tol_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*([\+\-][0-9]+(?:\.[0-9]+)?)', clean_text)
    if single_tol_match:
        nominal = float(single_tol_match.group(1))
        tol = float(single_tol_match.group(2))
        upper_tol = tol if tol > 0 else 0.0
        lower_tol = tol if tol < 0 else 0.0
        return {
            "found": True,
            "rawText": text.strip(),
            "nominalValue": nominal,
            "upperTolerance": upper_tol,
            "lowerTolerance": lower_tol,
            "unit": "mm",
            "prefix": prefix,
            "extractionMode": "AUTOMATIC"
        }

    # Pattern 4: Simple nominal number e.g. 25 or 25.00 or 116.18 or 3.67
    nom_match = re.search(r'^([0-9]+(?:\.[0-9]+)?)', clean_text)
    if nom_match:
        nominal = float(nom_match.group(1))
        # Filter single-digit whole numbers without decimals (e.g. "1", "2", "3", "4", "5", "6", "7", "8", "9")
        # unless accompanied by units or decimals, to avoid ballooning general list item numbers or beam indices
        if nominal.is_integer() and nominal < 10 and not re.search(r'(mm|m|cm|in|\"|\'|°)', clean_text, re.IGNORECASE):
            return None

        # Ignore huge numbers like part numbers (e.g. 13523526)
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
            "extractionMode": "AUTOMATIC"
        }

    return None


def extract_text_at_coordinate(file_path: str, page_number: int, norm_x: float, norm_y: float) -> Dict[str, Any]:
    """
    Extracts text near normalized coordinates (norm_x, norm_y) from PDF.
    norm_x and norm_y are between 0.0 and 1.0.
    page_number is 1-indexed.
    """
    try:
        doc = fitz.open(file_path)
        if page_number < 1 or page_number > len(doc):
            return {"found": False, "message": "Invalid page number"}

        page = doc[page_number - 1]
        rect = page.rect
        pdf_x = norm_x * rect.width
        pdf_y = norm_y * rect.height

        # Define search box around (pdf_x, pdf_y) with radius of 40 points
        search_radius = 40.0
        search_rect = fitz.Rect(
            max(0, pdf_x - search_radius),
            max(0, pdf_y - search_radius),
            min(rect.width, pdf_x + search_radius),
            min(rect.height, pdf_y + search_radius)
        )

        words = page.get_text("words", clip=search_rect)
        if not words:
            blocks = page.get_text("blocks")
            closest_text = ""
            min_dist = float('inf')
            for b in blocks:
                cx = (b[0] + b[2]) / 2.0
                cy = (b[1] + b[3]) / 2.0
                dist = ((cx - pdf_x) ** 2 + (cy - pdf_y) ** 2) ** 0.5
                if dist < min_dist and dist < 100.0:
                    min_dist = dist
                    closest_text = b[4]
            raw_text = closest_text.strip()
        else:
            words.sort(key=lambda w: (w[1], w[0]))
            raw_text = " ".join([w[4] for w in words])

        if raw_text:
            parsed = parse_dimension_string(raw_text)
            if parsed:
                return parsed

        return {
            "found": False,
            "rawText": raw_text,
            "extractionMode": "MANUAL_FALLBACK",
            "message": "Could not automatically parse dimension tolerance format. Switching to manual entry."
        }
    except Exception as e:
        return {
            "found": False,
            "extractionMode": "MANUAL_FALLBACK",
            "error": str(e)
        }


def extract_all_dimensions_from_page(file_path: str, page_number: int = 1) -> Dict[str, Any]:
    """
    Scans entire PDF page and automatically finds all dimension callouts with tolerances.
    Uses Hybrid approach: PyMuPDF vector blocks + EasyOCR fallback for scanned/image drawings.
    """
    try:
        doc = fitz.open(file_path)
        if page_number < 1 or page_number > len(doc):
            return {"success": False, "error": "Invalid page number", "items": []}

        page = doc[page_number - 1]
        rect = page.rect
        width = rect.width
        height = rect.height

        detected = []
        seen_coords = set()

        # 1. Stage 1: Vector Text Extraction via PyMuPDF
        blocks = page.get_text("blocks")
        for b in blocks:
            text = b[4].strip()
            if not text:
                continue

            lines = text.split('\n')
            for line in lines:
                clean_line = line.strip()
                if not clean_line:
                    continue

                parsed = parse_dimension_string(clean_line)
                if parsed and parsed.get("found"):
                    x0, y0, x1, y1 = b[0], b[1], b[2], b[3]
                    cx = (x0 + x1) / 2.0
                    cy = (y0 + y1) / 2.0
                    norm_x = round(cx / width, 4)
                    norm_y = round(cy / height, 4)

                    coord_key = (round(norm_x, 2), round(norm_y, 2))
                    if coord_key in seen_coords:
                        continue
                    seen_coords.add(coord_key)

                    detected.append({
                        "normX": norm_x,
                        "normY": norm_y,
                        "rawText": parsed["rawText"],
                        "nominalValue": parsed["nominalValue"],
                        "upperTolerance": parsed["upperTolerance"],
                        "lowerTolerance": parsed["lowerTolerance"],
                        "unit": parsed["unit"],
                        "prefix": parsed.get("prefix", ""),
                        "extractionMode": "VECTOR_AUTOMATIC"
                    })

        # 2. Stage 2: OCR Fallback for Scanned / Raster Image PDF Drawings
        if len(detected) == 0:
            reader = get_ocr_reader()
            if reader:
                pix = page.get_pixmap(dpi=120)
                try:
                    from PIL import Image
                    import io
                    pil_img = Image.open(io.BytesIO(pix.tobytes("png")))
                    w, h = pil_img.size
                    max_dim = 1100
                    if max(w, h) > max_dim:
                        scale = max_dim / float(max(w, h))
                        new_w, new_h = int(w * scale), int(h * scale)
                        pil_img = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)

                    buf = io.BytesIO()
                    pil_img.save(buf, format="PNG")
                    img_bytes = buf.getvalue()
                    img_w, img_h = pil_img.size
                except Exception as img_err:
                    print("Image resize fallback error:", img_err)
                    img_bytes = pix.tobytes("png")
                    img_w, img_h = pix.width, pix.height

                ocr_results = reader.readtext(img_bytes)

                for bbox, text, prob in ocr_results:
                    if prob < 0.3 or not text or not any(char.isdigit() for char in text):
                        continue

                    parsed = parse_dimension_string(text)
                    if parsed and parsed.get("found"):
                        # bbox format: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
                        xs = [p[0] for p in bbox]
                        ys = [p[1] for p in bbox]
                        cx = sum(xs) / len(xs)
                        cy = sum(ys) / len(ys)

                        norm_x = round(float(cx) / img_w, 4)
                        norm_y = round(float(cy) / img_h, 4)

                        # Skip title block area & bottom revision table
                        if (norm_x > 0.70 and norm_y > 0.75) or norm_y > 0.85:
                            continue

                        coord_key = (round(norm_x, 2), round(norm_y, 2))
                        if coord_key in seen_coords:
                            continue
                        seen_coords.add(coord_key)

                        detected.append({
                            "normX": norm_x,
                            "normY": norm_y,
                            "rawText": parsed["rawText"],
                            "nominalValue": parsed["nominalValue"],
                            "upperTolerance": parsed["upperTolerance"],
                            "lowerTolerance": parsed["lowerTolerance"],
                            "unit": parsed["unit"],
                            "prefix": parsed.get("prefix", ""),
                            "extractionMode": "OCR_AUTOMATIC"
                        })

        return {
            "success": True,
            "count": len(detected),
            "items": detected
        }
    except Exception as e:
        print("extract_all_dimensions_from_page error:", e)
        return {"success": False, "error": str(e), "items": []}


def get_pdf_metadata(file_path: str) -> Dict[str, Any]:
    """
    Extracts metadata and page dimensions for a PDF file.
    """
    doc = fitz.open(file_path)
    pages_info = []
    for i, page in enumerate(doc):
        r = page.rect
        pages_info.append({
            "pageNumber": i + 1,
            "width": r.width,
            "height": r.height,
        })
    return {
        "pageCount": len(doc),
        "pages": pages_info
    }
