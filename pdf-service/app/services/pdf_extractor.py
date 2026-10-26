import fitz  # PyMuPDF
import re
from typing import Dict, Any, Optional, List

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


def detect_title_block_region(page: Any, width: float, height: float) -> Dict[str, Any]:
    """
    Detects title block region using text density analysis and common keywords.
    Returns normalized boundary coordinates.
    """
    # Common title block keywords (case-insensitive)
    title_keywords = [
        "TITLE", "DWG", "DRAWING", "PART", "MATERIAL", "SCALE", "DATE", "DRAWN", 
        "CHECKED", "APPROVED", "REVISION", "REV", "SHEET", "PAGE", "PROJECT", 
        "CLIENT", "DESIGNED", "ENGINEER", "ARCHITECT", "FILE", "DWG NO", "PART NO"
    ]
    
    # Analyze text blocks
    blocks = page.get_text("blocks")
    title_block_candidates = []
    
    for b in blocks:
        if len(b) < 5:
            continue
        x0, y0, x1, y1 = b[0], b[1], b[2], b[3]
        text = b[4] if len(b) > 4 else ""
        
        # Normalize coordinates
        norm_x = (x0 + x1) / (2 * width)
        norm_y = (y0 + y1) / (2 * height)
        
        # Check if text contains title block keywords
        text_upper = text.upper()
        keyword_count = sum(1 for kw in title_keywords if kw in text_upper)
        
        if keyword_count >= 2:  # At least 2 keywords suggest title block
            title_block_candidates.append({
                "x0": x0 / width,
                "y0": y0 / height,
                "x1": x1 / width,
                "y1": y1 / height,
                "keyword_count": keyword_count
            })
    
    # If we found candidates, determine bounding region
    if title_block_candidates:
        # Sort by keyword density and take the most likely region
        title_block_candidates.sort(key=lambda c: c["keyword_count"], reverse=True)
        best = title_block_candidates[0]
        
        # Expand region slightly to capture full title block
        return {
            "x0": max(0, best["x0"] - 0.05),
            "y0": max(0, best["y0"] - 0.05),
            "x1": min(1, best["x1"] + 0.05),
            "y1": min(1, best["y1"] + 0.05),
            "confidence": min(1.0, best["keyword_count"] / 5.0)
        }
    
    # Fallback: assume bottom-right corner (traditional position)
    return {
        "x0": 0.65,
        "y0": 0.85,
        "x1": 1.0,
        "y1": 1.0,
        "confidence": 0.3  # Low confidence fallback
    }


def detect_view_regions(page: Any, width: float, height: float) -> List[Dict[str, Any]]:
    """
    Detects drawing view regions by identifying section labels and detail callouts.
    Returns list of view regions with IDs.
    """
    view_regions = []
    blocks = page.get_text("blocks")
    
    # Patterns for section labels: "SECTION A-A", "VIEW B-B", "DETAIL C", etc.
    section_pattern = re.compile(r'(SECTION|VIEW|DETAIL|DET\.?|SEC\.?)\s*([A-Z](?:-[A-Z])?)', re.IGNORECASE)
    
    for b in blocks:
        if len(b) < 5:
            continue
        text = b[4] if len(b) > 4 else ""
        match = section_pattern.search(text)
        
        if match:
            view_type = match.group(1).upper()
            view_label = match.group(2).upper()
            
            # Store view region (rough approximation - real implementation would be more sophisticated)
            x0, y0, x1, y1 = b[0], b[1], b[2], b[3]
            view_regions.append({
                "id": f"{view_type}_{view_label}",
                "label": f"{view_type} {view_label}",
                "type": view_type,
                "center_x": ((x0 + x1) / 2) / width,
                "center_y": ((y0 + y1) / 2) / height
            })
    
    return view_regions


def is_in_title_block(norm_x: float, norm_y: float, title_block: Dict[str, Any]) -> bool:
    """Check if point is within title block region."""
    return (title_block["x0"] <= norm_x <= title_block["x1"] and 
            title_block["y0"] <= norm_y <= title_block["y1"])


def identify_view_for_point(norm_x: float, norm_y: float, view_regions: List[Dict[str, Any]]) -> Optional[str]:
    """
    Identify which view a dimension point belongs to based on proximity to view labels.
    Returns view ID or None for main drawing.
    """
    if not view_regions:
        return None
    
    # Find closest view label
    min_dist = float('inf')
    closest_view = None
    
    for view in view_regions:
        dist = ((norm_x - view["center_x"]) ** 2 + (norm_y - view["center_y"]) ** 2) ** 0.5
        if dist < min_dist and dist < 0.3:  # Within 30% of page size
            min_dist = dist
            closest_view = view["id"]
    
    return closest_view


def parse_dimension_string(text: str) -> Optional[Dict[str, Any]]:
    """
    Parses dimension text string into nominal, upper tolerance, lower tolerance, unit, and prefix.
    Filters out metadata text, general notes, item numbers, beam/column labels, and non-dimension CAD text.
    Returns classification metadata including confidence and dimension type.
    """
    if not text:
        return None

    clean_text = text.replace(',', '.').strip()
    if not clean_text:
        return None

    upper_raw = clean_text.upper()

    # ENHANCED: Expanded metadata and non-dimension keyword filtering
    skip_keywords = [
        "ECN", "DATE", "DRAWING", "VERSION", "MODEL", "PAGE", "SHEET", "REV", "ISO", "ART", "PART", 
        "SCALE", "AUTHOR", "CHECKED", "DOC", "TITLE", "COPYRIGHT", "DOKUMENT", "TERRACE", "BEAM", 
        "SLAB", "LAYOUT", "LEVEL", "SECTION", "ELEVATION", "SCHEDULE", "NOTES", "LEGEND", "STRUCTURE", 
        "DETAILS", "CONSTRUCTION", "THICKNESS", "STAIRCASE", "RISER", "TREAD", "PLINTH", "EXPOSURE", 
        "CONDITION", "GRADE", "CONCRETE", "STEEL", "BRICK", "COLUMN", "PROJECT", "CLIENT", "ARCHITECT",
        "ENGINEER", "REVISION", "NOTE", "NORTH", "BELOW", "WALL", "HEIGHT", "THK", "PCC", "FLOORING",
        "INTERNAL", "EXTERNAL", "FRAME", "FRAMED", "COBA", "BAT", "FINISH", "DOG", "LEGGED", "TYPE",
        # ADDED: Common title block and annotation keywords
        "DESIGNED", "DRAWN", "APPROVED", "MATERIAL", "FINISH", "TREATMENT", "QUANTITY", "QTY", 
        "ITEM", "REF", "DESCRIPTION", "WEIGHT", "MASS", "SPECIFICATION", "STANDARD", "TOLERANCE",
        "UNLESS", "OTHERWISE", "SPECIFIED", "GENERAL", "ANGULAR", "DIMENSION", "INTERPRET", "THIRD",
        "ANGLE", "PROJECTION", "UNITS", "MILLIMETERS", "INCHES", "SURFACE", "ROUGHNESS", "FILE",
        "PROPERTY", "COMPANY", "ADDRESS", "PHONE", "EMAIL", "STATUS", "REVISION", "CHANGE"
    ]
    if any(kw in upper_raw for kw in skip_keywords):
        return None

    # ENHANCED: Ignore multi-word text blocks (sentences/notes) - increased threshold
    if len(clean_text.split()) > 5:
        return None

    # Ignore dates like 13.10.2023 or 22/11/2022
    if re.search(r'\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}', clean_text):
        return None

    # ENHANCED: Expanded CAD element ID filtering
    # Includes section labels (SECTION A-A, VIEW B-B, DETAIL C)
    if re.match(r'^(SECTION|VIEW|DETAIL|DET\.?|SEC\.?)\s*[A-Z]', upper_raw):
        return None
    
    # Element IDs like B1, B4, B8, B12, S1, S2, S3, C-01, C-09, BR2, BR4, RB, MLB
    if re.match(r'^[A-Z]{1,3}-?\d+$', upper_raw) and len(upper_raw) <= 6:
        return None

    # ADDED: Filter revision markers (REV A, REV. B, R1, R2, etc.)
    if re.match(r'^(REV\.?|R\.?)\s*[A-Z0-9]$', upper_raw):
        return None

    # Strip list item prefixes like "1. ", "4. ", "10) ", "3. " at start of text (excluding decimals like 3.67)
    clean_text = re.sub(r'^\d+[\.\)](?!\d)\s*', '', clean_text).strip()
    if not clean_text:
        return None
    
    # ADDED: Filter common drawing scale notations (1:1, 1:2, 2:1, SCALE 1:5, etc.)
    if re.match(r'^(SCALE\s*)?(\d+:\d+|\d+/\d+)$', upper_raw):
        return None

    # ENHANCED: Detect prefix (Ø, R, M, etc.) with more symbol variations
    prefix = ""
    dimension_type = "LINEAR"  # Default type
    
    # Handle diameter symbols: Ø, ⌀, DIA, dia., φ, PHI
    if re.match(r'^([ØøΦφ⌀]|DIA\.?|PHI)\s*', clean_text, re.IGNORECASE):
        prefix = "Ø"
        dimension_type = "DIAMETER"
        clean_text = re.sub(r'^([ØøΦφ⌀]|DIA\.?|PHI)\s*', '', clean_text, flags=re.IGNORECASE).strip()
    # Handle radius: R, RAD, rad.
    elif re.match(r'^(R|RAD\.?)\s*([0-9])', clean_text, re.IGNORECASE):  # Must be followed by digit
        prefix = "R"
        dimension_type = "RADIUS"
        clean_text = re.sub(r'^(R|RAD\.?)\s*', '', clean_text, flags=re.IGNORECASE).strip()
    # Handle thread: M followed by digit
    elif re.match(r'^M\s*([0-9])', clean_text):
        prefix = "M"
        dimension_type = "THREAD"
        clean_text = re.sub(r'^M\s*', '', clean_text).strip()
    # Handle square: SQ, □
    elif re.match(r'^(SQ|□)\s*', clean_text, re.IGNORECASE):
        prefix = "SQ"
        dimension_type = "SQUARE"
        clean_text = re.sub(r'^(SQ|□)\s*', '', clean_text, flags=re.IGNORECASE).strip()
    # Handle spherical diameter/radius
    elif re.match(r'^(SR|SØ|S[ØΦφ])\s*', clean_text, re.IGNORECASE):
        prefix_match = re.match(r'^(S[RØΦφ⌀])\s*', clean_text, re.IGNORECASE)
        prefix = prefix_match.group(1).upper() if prefix_match else "SR"
        dimension_type = "SPHERICAL"
        clean_text = re.sub(r'^(SR|SØ|S[ØΦφ⌀])\s*', '', clean_text, flags=re.IGNORECASE).strip()
    
    # ADDED: Detect reference dimensions (in parentheses) - mark but don't filter
    is_reference = False
    ref_match = re.match(r'^\((.+)\)$', clean_text)
    if ref_match:
        is_reference = True
        clean_text = ref_match.group(1).strip()
        # Re-check for prefix inside parentheses
        if re.match(r'^([ØøΦφ⌀]|DIA\.?)\s*', clean_text, re.IGNORECASE):
            prefix = "Ø"
            dimension_type = "DIAMETER"
            clean_text = re.sub(r'^([ØøΦφ⌀]|DIA\.?)\s*', '', clean_text, flags=re.IGNORECASE).strip()
        elif re.match(r'^(R|RAD\.?)\s*([0-9])', clean_text, re.IGNORECASE):
            prefix = "R"
            dimension_type = "RADIUS"
            clean_text = re.sub(r'^(R|RAD\.?)\s*', '', clean_text, flags=re.IGNORECASE).strip()

    # ADDED: Pattern 0.5: ISO Tolerance Fits (e.g., 50 H7, 25 f8, Ø30 H7 +0.025, M20 h6)
    fit_match = re.search(r'([0-9]+(?:\.[0-9]+)?)\s*([A-HJKMNPRSTUVXYZa-hjkmnprstuvxyz]\d+)\s*([\+\-][0-9]+(?:\.[0-9]+)?(?:\s*[\/\s]\s*[\+\-][0-9]+(?:\.[0-9]+)?)?)?', clean_text)
    if fit_match:
        nominal = float(fit_match.group(1))
        fit_class = fit_match.group(2)  # e.g., "H7", "f8", "h6"
        explicit_tol = fit_match.group(3)  # Optional explicit tolerance after fit class
        
        # Parse explicit tolerance if provided
        upper_tol = 0.0
        lower_tol = 0.0
        if explicit_tol:
            tol_match = re.search(r'([\+\-][0-9]+(?:\.[0-9]+)?)\s*[\/\s]?\s*([\+\-][0-9]+(?:\.[0-9]+)?)?', explicit_tol)
            if tol_match:
                tol1 = float(tol_match.group(1))
                tol2 = float(tol_match.group(2)) if tol_match.group(2) else -tol1
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
            "dimensionType": dimension_type,
            "fitClass": fit_class,
            "isReference": is_reference,
            "confidence": 0.9,  # High confidence for ISO fits
            "extractionMode": "AUTOMATIC"
        }

    # ADDED: Pattern 0.6: Limit Dimensions (e.g., 50.025/50.000, 25.1/24.9)
    # Must have decimal points to distinguish from scales like 1/2
    limit_match = re.search(r'([0-9]+\.[0-9]+)\s*/\s*([0-9]+\.[0-9]+)', clean_text)
    if limit_match:
        limit1 = float(limit_match.group(1))
        limit2 = float(limit_match.group(2))
        upper_limit = max(limit1, limit2)
        lower_limit = min(limit1, limit2)
        nominal = (upper_limit + lower_limit) / 2.0
        upper_tol = upper_limit - nominal
        lower_tol = lower_limit - nominal
        
        if 0 < nominal <= 9999:
            return {
                "found": True,
                "rawText": text.strip(),
                "nominalValue": nominal,
                "upperTolerance": upper_tol,
                "lowerTolerance": lower_tol,
                "unit": "mm",
                "prefix": prefix,
                "dimensionType": dimension_type,
                "isReference": is_reference,
                "isLimitDimension": True,
                "confidence": 0.95,
                "extractionMode": "AUTOMATIC"
            }

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
                "dimensionType": "NOTE",  # Explicit assignments are usually notes
                "isReference": is_reference,
                "confidence": 0.5,  # Lower confidence - might be note, not inspection dimension
                "extractionMode": "AUTOMATIC"
            }

    # Pattern 1: Symmetric tolerance e.g., 25 ± 0.1 or 25±0.10 or 25 +/- 0.1
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
            "dimensionType": dimension_type,
            "isReference": is_reference,
            "confidence": 0.95,  # High confidence for symmetric tolerances
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
            "dimensionType": dimension_type,
            "isReference": is_reference,
            "confidence": 0.95,  # High confidence for explicit asymmetric tolerances
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
            "dimensionType": dimension_type,
            "isReference": is_reference,
            "confidence": 0.85,  # Good confidence for single tolerance
            "extractionMode": "AUTOMATIC"
        }

    # Pattern 4: Simple nominal number e.g. 25 or 25.00 or 116.18 or 3.67
    # ENHANCED: Check for compound dimensions (diameter/radius with depth, chamfer, thread, etc.)
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

        # ADDED: Boost confidence for compound specifications with contextual keywords
        confidence = 0.6  # Base confidence for simple number
        
        # Check for compound dimension indicators
        compound_indicators = [
            'DEEP', 'DP', 'DEPTH',  # Depth specifications
            'TAP', 'THRU', 'THROUGH',  # Thread/hole specifications  
            'CHAM', 'CHAMFER',  # Chamfer specifications
            'MM', 'CM', 'IN',  # Explicit units
            'X', '×',  # Multiplication/compound (e.g., ⌀50 X 10 DEEP)
        ]
        
        remaining_text = clean_text[nom_match.end():].upper()
        has_compound = any(indicator in remaining_text for indicator in compound_indicators)
        
        # Boost confidence for dimensional specifications with context
        if has_compound or prefix:  # Has diameter/radius prefix or compound indicators
            confidence = 0.9  # High confidence - this is clearly a dimension spec
        elif re.search(r'(mm|m|cm|in|\"|\'|°)', clean_text, re.IGNORECASE):
            confidence = 0.8  # Medium-high - has unit specification
        elif dimension_type != "LINEAR":  # Has type prefix but nothing else
            confidence = 0.75  # Medium - diameter/radius/thread without additional context

        return {
            "found": True,
            "rawText": text.strip(),
            "nominalValue": nominal,
            "upperTolerance": 0.0,
            "lowerTolerance": 0.0,
            "unit": "mm",
            "prefix": prefix,
            "dimensionType": dimension_type,
            "isReference": is_reference,
            "confidence": confidence,
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
    ENHANCED: Includes title block detection, spatial filtering, and confidence scoring.
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

        # ADDED: Detect title block region using heuristics
        title_block_region = detect_title_block_region(page, width, height)
        
        # ADDED: Detect drawing view boundaries (section labels, detail circles, etc.)
        view_regions = detect_view_regions(page, width, height)

        # 1. Stage 1: Vector Text Extraction via PyMuPDF (Word-level precision)
        words = page.get_text("words")
        lines_dict = {}
        for w in words:
            key = (w[5], w[6])  # (block_no, line_no)
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

                # Skip out-of-bounds text items (e.g. margin annotations) individually
                if norm_x < 0.0 or norm_y < 0.0 or norm_x > 1.0 or norm_y > 1.0:
                    continue
                
                # ADDED: Skip title block region
                if is_in_title_block(norm_x, norm_y, title_block_region):
                    continue

                coord_key = (round(norm_x, 3), round(norm_y, 3))
                if coord_key in seen_coords:
                    continue
                seen_coords.add(coord_key)
                
                # ADDED: Determine which view this dimension belongs to
                view_id = identify_view_for_point(norm_x, norm_y, view_regions)

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
                    "nominalValue": parsed["nominalValue"],
                    "upperTolerance": parsed["upperTolerance"],
                    "lowerTolerance": parsed["lowerTolerance"],
                    "unit": parsed["unit"],
                    "prefix": parsed.get("prefix", ""),
                    "dimensionType": parsed.get("dimensionType", "LINEAR"),
                    "isReference": parsed.get("isReference", False),
                    "confidence": parsed.get("confidence", 0.7),
                    "viewId": view_id,
                    "extractionMode": "VECTOR_AUTOMATIC"
                })

        # 2. Stage 2: OCR Extraction for Scanned / Raster Image PDF Drawings (Fallback only if 0 vector items)
        if len(detected) == 0:
            reader = get_ocr_reader()
            if reader:
                pix = page.get_pixmap(dpi=150)
                try:
                    from PIL import Image
                    import io
                    pil_img = Image.open(io.BytesIO(pix.tobytes("png")))
                    w, h = pil_img.size
                    max_dim = 1800
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
                    if prob < 0.20 or not text or not any(char.isdigit() for char in text):
                        continue

                    parsed = parse_dimension_string(text)
                    if parsed and parsed.get("found"):
                        # bbox format: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
                        xs = [p[0] for p in bbox]
                        ys = [p[1] for p in bbox]
                        min_x, max_x = min(xs), max(xs)
                        min_y, max_y = min(ys), max(ys)
                        cx = sum(xs) / len(xs)
                        cy = sum(ys) / len(ys)

                        norm_x = round(float(cx) / img_w, 4)
                        norm_y = round(float(cy) / img_h, 4)

                        # ENHANCED: Use detected title block instead of hard-coded position
                        if is_in_title_block(norm_x, norm_y, title_block_region):
                            continue

                        coord_key = (round(norm_x, 2), round(norm_y, 2))
                        if coord_key in seen_coords:
                            continue
                        seen_coords.add(coord_key)
                        
                        # Determine view
                        view_id = identify_view_for_point(norm_x, norm_y, view_regions)

                        detected.append({
                            "normX": norm_x,
                            "normY": norm_y,
                            "bbox": {
                                "x0": round(float(min_x) / img_w, 4),
                                "y0": round(float(min_y) / img_h, 4),
                                "x1": round(float(max_x) / img_w, 4),
                                "y1": round(float(max_y) / img_h, 4)
                            },
                            "rawText": parsed["rawText"],
                            "nominalValue": parsed["nominalValue"],
                            "upperTolerance": parsed["upperTolerance"],
                            "lowerTolerance": parsed["lowerTolerance"],
                            "unit": parsed["unit"],
                            "prefix": parsed.get("prefix", ""),
                            "dimensionType": parsed.get("dimensionType", "LINEAR"),
                            "isReference": parsed.get("isReference", False),
                            "confidence": parsed.get("confidence", 0.7) * prob,  # Combine parsing and OCR confidence
                            "viewId": view_id,
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
