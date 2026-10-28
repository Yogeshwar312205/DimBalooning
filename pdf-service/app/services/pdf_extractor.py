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


def detect_drawing_boundary(page: Any, width: float, height: float) -> Dict[str, Any]:
    """
    Detects the actual drawing boundary by analyzing line drawings and paths.
    Returns the inner rectangle that contains the actual engineering drawing,
    excluding sheet borders, fold marks, and margin annotations.
    """
    # Collect all significant lines (rectangles, straight lines from drawings)
    paths = page.get_drawings()
    
    # Track horizontal and vertical lines that could form borders
    h_lines = []  # (y_coord, x_start, x_end, length)
    v_lines = []  # (x_coord, y_start, y_end, length)
    
    for path in paths:
        for item in path["items"]:
            if item[0] == "l":  # Line segment
                p1, p2 = item[1], item[2]
                x1, y1 = p1.x, p1.y
                x2, y2 = p2.x, p2.y
                
                # Horizontal line (within 3pt tolerance)
                if abs(y1 - y2) < 3:
                    y_avg = (y1 + y2) / 2
                    x_min, x_max = min(x1, x2), max(x1, x2)
                    length = x_max - x_min
                    if length > width * 0.2:  # At least 20% of page width
                        h_lines.append((y_avg, x_min, x_max, length))
                
                # Vertical line (within 3pt tolerance)
                if abs(x1 - x2) < 3:
                    x_avg = (x1 + x2) / 2
                    y_min, y_max = min(y1, y2), max(y1, y2)
                    length = y_max - y_min
                    if length > height * 0.2:  # At least 20% of page height
                        v_lines.append((x_avg, y_min, y_max, length))
    
    # Find drawing frame: typically the innermost large rectangle
    # (sheet border is outermost, fold marks are in between, drawing frame is innermost)
    
    if h_lines and v_lines:
        # Sort lines by position
        h_lines.sort(key=lambda l: l[0])  # Sort by y coordinate
        v_lines.sort(key=lambda l: l[0])  # Sort by x coordinate
        
        # Filter to find major frame lines (longer than 60% of dimension)
        major_h_lines = [l for l in h_lines if l[3] > width * 0.6]
        major_v_lines = [l for l in v_lines if l[3] > height * 0.6]
        
        if major_h_lines and major_v_lines:
            # Inner frame detection: look for lines that are NOT at the very edges
            # Skip the outermost lines (sheet borders) and take inner ones
            
            # Top border: skip first line if it's too close to top, take second
            top_candidates = [l for l in major_h_lines if 0.03 < l[0]/height < 0.15]
            top_y = top_candidates[0][0] if top_candidates else major_h_lines[0][0]
            
            # Bottom border: skip last line if too close to bottom, take second-to-last
            bottom_candidates = [l for l in major_h_lines if 0.85 < l[0]/height < 0.97]
            bottom_y = bottom_candidates[-1][0] if bottom_candidates else major_h_lines[-1][0]
            
            # Left border
            left_candidates = [l for l in major_v_lines if 0.03 < l[0]/width < 0.15]
            left_x = left_candidates[0][0] if left_candidates else major_v_lines[0][0]
            
            # Right border
            right_candidates = [l for l in major_v_lines if 0.85 < l[0]/width < 0.97]
            right_x = right_candidates[-1][0] if right_candidates else major_v_lines[-1][0]
            
            # Validate: drawing should be at least 40% of page
            if (right_x - left_x) > width * 0.4 and (bottom_y - top_y) > height * 0.4:
                return {
                    "x0": left_x / width,
                    "y0": top_y / height,
                    "x1": right_x / width,
                    "y1": bottom_y / height,
                    "confidence": 0.95,
                    "type": "detected"
                }
    
    # Fallback: use conservative margins to avoid sheet borders
    return {
        "x0": 0.08,  # 8% margin
        "y0": 0.08,
        "x1": 0.92,
        "y1": 0.88,  # Larger bottom margin for title block
        "confidence": 0.5,
        "type": "fallback"
    }


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
        # Merge all candidates into one large title block region
        all_x0 = min(c["x0"] for c in title_block_candidates)
        all_y0 = min(c["y0"] for c in title_block_candidates)
        all_x1 = max(c["x1"] for c in title_block_candidates)
        all_y1 = max(c["y1"] for c in title_block_candidates)
        
        # Get max keyword count for confidence
        max_keywords = max(c["keyword_count"] for c in title_block_candidates)
        
        # Expand region to capture full title block
        # Title blocks are typically in bottom-right, so expand more in that direction
        return {
            "x0": max(0, all_x0 - 0.08),
            "y0": max(0, all_y0 - 0.05),
            "x1": min(1, all_x1 + 0.10),  # Expand more to the right
            "y1": min(1, all_y1 + 0.08),  # Expand more downward
            "confidence": min(1.0, max_keywords / 4.0)
        }
    
    # Fallback: assume bottom-right corner (traditional position)
    # Use larger area to be safe but NOT TOO AGGRESSIVE
    return {
        "x0": 0.70,  # Only rightmost 30% (was 60%)
        "y0": 0.92,  # Only bottom 8% (was 82%)
        "x1": 1.0,
        "y1": 1.0,
        "confidence": 0.4  # Medium-low confidence fallback
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


def is_sheet_border_annotation(text: str, norm_x: float, norm_y: float, 
                                bbox_width: float, bbox_height: float) -> bool:
    """
    Detect sheet border annotations including:
    - Grid labels (single digits/letters near edges): 1, 2, 3 or A, B, C
    - Grid coordinates: A1, B2, C3
    - Fold marks: "FOLD", "FOLD LINE"
    - Sheet numbers: "SHEET 1", "PAGE 2"
    - Zone markers: "ZONE A", "ZONE A1"
    - Revision markers near borders
    """
    text_clean = text.strip()
    text_upper = text_clean.upper()
    
    # Check proximity to page edges
    near_top = norm_y < 0.05
    near_bottom = norm_y > 0.95
    near_left = norm_x < 0.05
    near_right = norm_x > 0.95
    near_any_edge = near_top or near_bottom or near_left or near_right
    
    # Pattern 1: Single digit or letter (grid labels)
    # Very common at sheet borders: 1, 2, 3, 4, 5... or A, B, C, D...
    if len(text_clean) <= 2 and text_clean.replace('.', '').replace(',', '').isalnum():
        # Single character near any edge is likely a grid label
        if len(text_clean) == 1:
            return near_any_edge
        # Two characters: could be "10", "11", "12" (grid) or "1X", "2X" (dimension)
        if text_clean.isdigit() and near_any_edge:
            return True
    
    # Pattern 2: Grid coordinates (A1, B2, C3, etc.)
    if re.match(r'^[A-Z]\d{1,2}$', text_upper):
        return True
    
    # Pattern 3: Fold marks
    fold_keywords = ["FOLD", "FOLDING"]
    if any(kw in text_upper for kw in fold_keywords):
        return True
    
    # Pattern 4: Sheet/Page metadata
    sheet_patterns = [
        r'^SHEET\s*\d+',
        r'^PAGE\s*\d+',
        r'^\d+\s*OF\s*\d+$',
        r'^SHEET\s+\d+\s+OF\s+\d+',
        r'^REV\.?\s*[A-Z0-9]$',
        r'^ZONE\s+[A-Z]\d*',
    ]
    for pattern in sheet_patterns:
        if re.match(pattern, text_upper):
            return True
    
    # Pattern 5: Very small text boxes near borders (typically annotations)
    if bbox_width < 0.02 and bbox_height < 0.02 and near_any_edge:
        return True
    
    # Pattern 6: Corner markers (single digits in corners)
    is_corner = (
        (norm_x < 0.08 and norm_y < 0.08) or  # Top-left
        (norm_x > 0.92 and norm_y < 0.08) or  # Top-right
        (norm_x < 0.08 and norm_y > 0.92) or  # Bottom-left
        (norm_x > 0.92 and norm_y > 0.92)     # Bottom-right
    )
    if is_corner and text_clean.isdigit() and len(text_clean) <= 2:
        return True
    
    return False


def is_within_drawing_boundary(norm_x: float, norm_y: float, drawing_boundary: Dict[str, Any],
                                tolerance: float = 0.03) -> bool:
    """
    Check if point is within the detected drawing boundary.
    Allows small tolerance for dimensions slightly outside the frame.
    """
    x0 = drawing_boundary["x0"] - tolerance
    y0 = drawing_boundary["y0"] - tolerance
    x1 = drawing_boundary["x1"] + tolerance
    y1 = drawing_boundary["y1"] + tolerance
    
    return (x0 <= norm_x <= x1 and y0 <= norm_y <= y1)


def is_revision_table_text(text: str, norm_x: float, norm_y: float) -> bool:
    """
    Detect revision table entries which often contain numbers.
    Revision tables are typically in upper-right or lower-right corners.
    """
    text_upper = text.strip().upper()
    
    # Check if in typical revision table location
    in_rev_area = (norm_x > 0.7 and norm_y < 0.25) or (norm_x > 0.7 and norm_y > 0.8)
    
    if not in_rev_area:
        return False
    
    # Common revision table keywords
    rev_keywords = ["REV", "REVISION", "ECN", "ECO", "CHANGE", "DATE", "BY", "DESCRIPTION"]
    
    # Check if text contains revision keywords
    if any(kw in text_upper for kw in rev_keywords):
        return True
    
    # Single revision letters/numbers in revision area
    if len(text.strip()) <= 2 and in_rev_area:
        return True
    
    return False


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
    ENHANCED: Comprehensive false-positive filtering using drawing boundaries, pattern matching,
    and spatial analysis to eliminate sheet borders, grid labels, title blocks, and metadata.
    FIXED: Merges nearby text spans to capture tolerance annotations and improves border filtering.
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
        consumed_tolerance_positions = set()  # NEW: Track tolerance fragments that were merged

        # Detect structural regions
        drawing_boundary = detect_drawing_boundary(page, width, height)
        title_block_region = detect_title_block_region(page, width, height)
        view_regions = detect_view_regions(page, width, height)
        
        # Statistics for diagnostics
        filter_stats = {
            "total_candidates": 0,
            "out_of_bounds": 0,
            "sheet_border": 0,
            "outside_drawing": 0,
            "title_block": 0,
            "revision_table": 0,
            "duplicate": 0,
            "accepted": 0
        }

        # ENHANCED: Get words and also nearby text for tolerance merging
        words = page.get_text("words")
        
        # Build a spatial index of all words for tolerance lookup
        word_positions = {}
        for w in words:
            cx = (w[0] + w[2]) / 2.0
            cy = (w[1] + w[3]) / 2.0
            word_positions[(round(cx, 1), round(cy, 1))] = w[4]
        
        # Stage 1: Vector Text Extraction via PyMuPDF (Word-level precision)
        # Group words into lines
        lines_dict = {}
        for w in words:
            key = (w[5], w[6])  # (block_no, line_no)
            if key not in lines_dict:
                lines_dict[key] = []
            lines_dict[key].append(w)

        rot_matrix = page.rotation_matrix

        for key, line_words in lines_dict.items():
            # ENHANCED: Merge line text AND check for nearby tolerance text
            clean_line = " ".join(w[4] for w in line_words).strip()
            if not clean_line:
                continue
            
            # Calculate line position
            x0 = min(w[0] for w in line_words)
            y0 = min(w[1] for w in line_words)
            x1 = max(w[2] for w in line_words)
            y1 = max(w[3] for w in line_words)
            
            b_rect = fitz.Rect(x0, y0, x1, y1)
            if page.rotation != 0:
                b_rect = b_rect * rot_matrix
            
            cx = (b_rect.x0 + b_rect.x1) / 2.0
            cy = (b_rect.y0 + b_rect.y1) / 2.0
            
            # FIXED: Parse dimension first to check if it's a valid dimension before tolerance search
            parsed = parse_dimension_string(clean_line)
            if not parsed or not parsed.get("found"):
                continue  # Skip if not a dimension
            
            # ENHANCED: Look for tolerance text nearby (vertically stacked or horizontally adjacent)
            # Common patterns:
            # 1. Nominal on one line, "+0.05 / -0.05" stacked below
            # 2. Nominal with "±0.1" adjacent
            # 3. Nominal with separate "0.05" text that represents tolerance
            tolerance_search_radius = 30.0  # points
            nearby_tolerance_candidates = []
            
            for w in words:
                wx = (w[0] + w[2]) / 2.0
                wy = (w[1] + w[3]) / 2.0
                
                # Check if nearby (within radius)
                dx = abs(wx - cx)
                dy = abs(wy - cy)
                
                # Vertically stacked (most common)
                if dx < 35 and 0 < dy < tolerance_search_radius:
                    text = w[4].strip()
                    # Check if it looks like a tolerance
                    # Pattern 1: Has +/- signs with digits
                    if any(char in text for char in ['+', '-', '±']) and any(c.isdigit() for c in text):
                        nearby_tolerance_candidates.append(('explicit', text, dy))
                    # Pattern 2: Small decimal number that could be tolerance (0.01 to 0.99)
                    # Only consider if the nominal is a "reasonable" dimension (> 1)
                    elif re.match(r'^0\.\d{1,3}$', text) and parsed.get("nominalValue", 0) > 1:
                        nearby_tolerance_candidates.append(('implicit', text, dy))
                
                # Horizontally adjacent (less common but check too)
                elif dy < 10 and 5 < dx < tolerance_search_radius:
                    text = w[4].strip()
                    if any(char in text for char in ['+', '-', '±']) and any(c.isdigit() for c in text):
                        nearby_tolerance_candidates.append(('explicit', text, dx))
                    elif re.match(r'^0\.\d{1,3}$', text) and parsed.get("nominalValue", 0) > 1:
                        nearby_tolerance_candidates.append(('implicit', text, dx))
            
            # Sort by distance (closest first)
            nearby_tolerance_candidates.sort(key=lambda x: x[2])
            
            # Try merging with tolerance text
            merged_successfully = False
            consumed_tolerance_text = None  # Track which tolerance was consumed
            consumed_tolerance_position = None  # Track position of consumed tolerance
            
            for tol_type, tol_text, dist in nearby_tolerance_candidates:
                # Try different merge patterns
                merge_attempts = []
                
                if tol_type == 'explicit':
                    # Text already has +/- signs
                    merge_attempts = [
                        f"{clean_line} {tol_text}",  # Space separated
                        f"{clean_line}{tol_text}",   # No space
                    ]
                else:
                    # Implicit tolerance - need to add ± sign
                    # Try symmetric first (most common)
                    merge_attempts = [
                        f"{clean_line} ±{tol_text}",  # Symmetric
                    ]
                
                # Test each merge attempt
                for merged_text in merge_attempts:
                    parsed_merged = parse_dimension_string(merged_text)
                    
                    if parsed_merged and parsed_merged.get("found"):
                        # Check if tolerance was actually extracted
                        if parsed_merged.get("upperTolerance", 0) != 0 or parsed_merged.get("lowerTolerance", 0) != 0:
                            # Sanity check: tolerance should be smaller than nominal
                            nom = parsed_merged.get("nominalValue", 0)
                            upper = abs(parsed_merged.get("upperTolerance", 0))
                            lower = abs(parsed_merged.get("lowerTolerance", 0))
                            max_tol = max(upper, lower)
                            
                            # Tolerance should typically be < 10% of nominal for dimensions > 5
                            # and < nominal for smaller dimensions
                            if nom > 5 and max_tol < nom * 0.2:  # Tolerance < 20% of nominal
                                clean_line = merged_text
                                parsed = parsed_merged  # Update parsed with merged version
                                merged_successfully = True
                                consumed_tolerance_text = tol_text  # Mark as consumed
                                break
                            elif nom <= 5 and max_tol < nom:  # Tolerance < nominal for small dims
                                clean_line = merged_text
                                parsed = parsed_merged  # Update parsed with merged version
                                merged_successfully = True
                                consumed_tolerance_text = tol_text  # Mark as consumed
                                break
                
                if merged_successfully:
                    break
            
            # NEW: If we successfully merged a tolerance, find and mark its position as consumed
            if merged_successfully and consumed_tolerance_text:
                for w in words:
                    if w[4].strip() == consumed_tolerance_text:
                        tol_cx = (w[0] + w[2]) / 2.0
                        tol_cy = (w[1] + w[3]) / 2.0
                        tol_norm_x = round(tol_cx / width, 4)
                        tol_norm_y = round(tol_cy / height, 4)
                        
                        # Check if this is the tolerance we merged (within search radius)
                        dx = abs(tol_cx - cx)
                        dy = abs(tol_cy - cy)
                        if (dx < 35 and dy < tolerance_search_radius) or (dy < 10 and 5 < dx < tolerance_search_radius):
                            # Mark this position as consumed
                            consumed_coord_key = (tol_norm_x, tol_norm_y)
                            consumed_tolerance_positions.add(consumed_coord_key)
                            break

            # At this point, parsed contains the dimension (either original or merged)
            if parsed and parsed.get("found"):
                filter_stats["total_candidates"] += 1
                
                norm_x = round(cx / width, 4)
                norm_y = round(cy / height, 4)
                
                bbox_width = (b_rect.x1 - b_rect.x0) / width
                bbox_height = (b_rect.y1 - b_rect.y0) / height

                # FILTER 1: Out of bounds check
                if norm_x < 0.0 or norm_y < 0.0 or norm_x > 1.0 or norm_y > 1.0:
                    filter_stats["out_of_bounds"] += 1
                    continue
                
                # NEW FILTER: Skip if this position was already consumed as a tolerance fragment
                coord_key = (norm_x, norm_y)
                if coord_key in consumed_tolerance_positions:
                    filter_stats["duplicate"] += 1  # Count as duplicate (already part of another dimension)
                    continue
                
                # FILTER 2: Sheet border annotations (grid labels, fold marks, etc.)
                # ENHANCED: Check if it's a legitimate dimension before rejecting based on position
                is_legitimate_dimension = (
                    len(clean_line) > 3 or  # Longer than simple grid label
                    any(char in clean_line for char in ['Ø', '⌀', 'R', 'X', 'x', '+', '-', '±', '.']) or  # Has dimension markers
                    parsed.get("confidence", 0) > 0.8 or  # High confidence parsing
                    parsed.get("upperTolerance", 0) != 0 or parsed.get("lowerTolerance", 0) != 0  # Has tolerances
                )
                
                if not is_legitimate_dimension:
                    if is_sheet_border_annotation(clean_line, norm_x, norm_y, bbox_width, bbox_height):
                        filter_stats["sheet_border"] += 1
                        continue
                
                # FILTER 3: Drawing boundary check (with larger tolerance for legitimate dimensions)
                if drawing_boundary["confidence"] > 0.6:
                    # Use larger tolerance for dimensions with symbols or tolerances
                    boundary_tolerance = 0.06 if is_legitimate_dimension else 0.03
                    if not is_within_drawing_boundary(norm_x, norm_y, drawing_boundary, tolerance=boundary_tolerance):
                        filter_stats["outside_drawing"] += 1
                        continue
                
                # FILTER 4: Title block region
                if is_in_title_block(norm_x, norm_y, title_block_region):
                    filter_stats["title_block"] += 1
                    continue
                
                # FILTER 5: Revision table text
                if is_revision_table_text(clean_line, norm_x, norm_y):
                    filter_stats["revision_table"] += 1
                    continue
                
                # FILTER 6: Spatial deduplication
                coord_key = (round(norm_x, 3), round(norm_y, 3))
                if coord_key in seen_coords:
                    filter_stats["duplicate"] += 1
                    continue
                seen_coords.add(coord_key)
                
                # Passed all filters - accept detection
                filter_stats["accepted"] += 1
                
                # Determine which view this dimension belongs to
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

        # Stage 2: OCR Extraction for Scanned / Raster Image PDF Drawings
        # DISABLED: OCR turned off to revert to pure vector-only mode
        # To re-enable mixed PDF support, change run_ocr to True
        ocr_detected = []
        run_ocr = False  # ← DISABLED: Set to True to enable OCR and mixed PDF support
        
        # Original behavior: Only run OCR if vector finds nothing
        if len(detected) == 0:
            run_ocr = True  # Fallback for pure scanned PDFs
            print(f"No vector dimensions found, enabling OCR fallback for scanned PDF")
        
        if run_ocr:
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
                        filter_stats["total_candidates"] += 1
                        
                        # bbox format: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
                        xs = [p[0] for p in bbox]
                        ys = [p[1] for p in bbox]
                        min_x, max_x = min(xs), max(xs)
                        min_y, max_y = min(ys), max(ys)
                        cx = sum(xs) / len(xs)
                        cy = sum(ys) / len(ys)

                        norm_x = round(float(cx) / img_w, 4)
                        norm_y = round(float(cy) / img_h, 4)
                        
                        bbox_width = (max_x - min_x) / img_w
                        bbox_height = (max_y - min_y) / img_h
                        
                        # Apply same filters as vector extraction
                        if is_sheet_border_annotation(text, norm_x, norm_y, bbox_width, bbox_height):
                            filter_stats["sheet_border"] += 1
                            continue
                        
                        if drawing_boundary["confidence"] > 0.6:
                            if not is_within_drawing_boundary(norm_x, norm_y, drawing_boundary, tolerance=0.03):
                                filter_stats["outside_drawing"] += 1
                                continue
                        
                        if is_in_title_block(norm_x, norm_y, title_block_region):
                            filter_stats["title_block"] += 1
                            continue
                        
                        if is_revision_table_text(text, norm_x, norm_y):
                            filter_stats["revision_table"] += 1
                            continue

                        coord_key = (round(norm_x, 2), round(norm_y, 2))
                        if coord_key in seen_coords:
                            filter_stats["duplicate"] += 1
                            continue
                        seen_coords.add(coord_key)
                        
                        filter_stats["accepted"] += 1
                        
                        # Determine view
                        view_id = identify_view_for_point(norm_x, norm_y, view_regions)

                        ocr_detected.append({
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
                            "confidence": parsed.get("confidence", 0.7) * prob,
                            "viewId": view_id,
                            "extractionMode": "OCR_AUTOMATIC"
                        })
        
        # Stage 3: Vector-OCR Fusion and Deduplication
        # CRITICAL NEW STAGE: Merge vector and OCR results, removing duplicates
        try:
            from .fusion import (
                fuse_vector_and_ocr_candidates,
                deduplicate_within_source
            )
        except ImportError:
            # Fallback for different execution contexts
            import sys
            import os
            current_dir = os.path.dirname(os.path.abspath(__file__))
            sys.path.insert(0, current_dir)
            from fusion import (
                fuse_vector_and_ocr_candidates,
                deduplicate_within_source
            )
        
        # First, deduplicate within each source
        vector_deduped = deduplicate_within_source(detected, source_name="VECTOR", verbose=False)
        ocr_deduped = deduplicate_within_source(ocr_detected, source_name="OCR", verbose=False)
        
        # Then, fuse vector and OCR results
        fused_results, fusion_stats = fuse_vector_and_ocr_candidates(
            vector_candidates=vector_deduped,
            ocr_candidates=ocr_deduped,
            iou_threshold=0.5,
            distance_threshold=0.02,
            text_sim_threshold=0.6,
            verbose=True  # Enable fusion diagnostics
        )
        
        # Replace detected with fused results
        detected = fused_results
        
        # Update filter stats with fusion information
        filter_stats["vector_candidates"] = len(vector_deduped)
        filter_stats["ocr_candidates"] = len(ocr_deduped)
        filter_stats["fusion_matched_pairs"] = fusion_stats.get("matched_pairs", 0)
        filter_stats["fusion_output"] = len(detected)
        
        # Log filtering and fusion statistics
        total_filtered = (filter_stats["sheet_border"] + filter_stats["outside_drawing"] + 
                         filter_stats["title_block"] + filter_stats["revision_table"] + 
                         filter_stats["duplicate"] + filter_stats["out_of_bounds"])
        
        print(f"\nPage {page_number} Extraction Summary:")
        print(f"  Total candidates: {filter_stats['total_candidates']}")
        print(f"  Accepted: {filter_stats['accepted']}")
        print(f"  Filtered: {total_filtered}")
        if total_filtered > 0:
            print(f"    - Sheet borders/grid: {filter_stats['sheet_border']}")
            print(f"    - Outside drawing: {filter_stats['outside_drawing']}")
            print(f"    - Title block: {filter_stats['title_block']}")
            print(f"    - Revision table: {filter_stats['revision_table']}")
            print(f"    - Duplicates: {filter_stats['duplicate']}")
            print(f"    - Out of bounds: {filter_stats['out_of_bounds']}")
        
        # Print fusion statistics if OCR was run
        if filter_stats.get("vector_candidates") is not None:
            print(f"\n  Fusion Statistics:")
            print(f"    - Vector candidates: {filter_stats.get('vector_candidates', 0)}")
            print(f"    - OCR candidates: {filter_stats.get('ocr_candidates', 0)}")
            print(f"    - Matched pairs (merged): {filter_stats.get('fusion_matched_pairs', 0)}")
            print(f"    - Final unique dimensions: {filter_stats.get('fusion_output', 0)}")

        return {
            "success": True,
            "count": len(detected),
            "items": detected,
            "diagnostics": {
                "drawingBoundary": drawing_boundary,
                "titleBlock": title_block_region,
                "filterStats": filter_stats
            }
        }
    except Exception as e:
        print("extract_all_dimensions_from_page error:", e)
        import traceback
        traceback.print_exc()
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
