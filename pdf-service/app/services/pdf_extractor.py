import fitz  # PyMuPDF
import re
from typing import Dict, Any, Optional

def parse_dimension_string(text: str) -> Optional[Dict[str, Any]]:
    """
    Parses dimension text string into nominal, upper tolerance, lower tolerance, unit, and prefix.
    Examples:
        '25 ± 0.10' -> nominal=25.0, upper=0.10, lower=-0.10
        '25 +0.10/-0.20' -> nominal=25.0, upper=0.10, lower=-0.20
        'Ø25 ±0.1' -> nominal=25.0, upper=0.1, lower=-0.1, prefix='Ø'
        'R10.5 ±0.05' -> nominal=10.5, upper=0.05, lower=-0.05, prefix='R'
        '50.0' -> nominal=50.0, upper=0.0, lower=0.0
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

    # Pattern 4: Simple nominal number e.g. 25 or 25.00
    nom_match = re.search(r'^([0-9]+(?:\.[0-9]+)?)', clean_text)
    if nom_match:
        nominal = float(nom_match.group(1))
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

        # Get words inside/intersecting search_rect
        words = page.get_text("words", clip=search_rect)
        if not words:
            # Fallback: get all text blocks on page and find closest
            blocks = page.get_text("blocks")
            closest_text = ""
            min_dist = float('inf')
            for b in blocks:
                # b = (x0, y0, x1, y1, "text", block_no, block_type)
                cx = (b[0] + b[2]) / 2.0
                cy = (b[1] + b[3]) / 2.0
                dist = ((cx - pdf_x) ** 2 + (cy - pdf_y) ** 2) ** 0.5
                if dist < min_dist and dist < 100.0:
                    min_dist = dist
                    closest_text = b[4]
            raw_text = closest_text.strip()
        else:
            # Sort words by y0 then x0
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
