"""
Check for missing dimensions near borders and verify tolerance extraction.
Focus on Issue 1 (border dimensions) and Issue 2 (tolerance values).
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.services.pdf_extractor import extract_all_dimensions_from_page
import fitz

def check_pdf_coverage(pdf_path, page_num=1):
    """Check which areas of the PDF have dimensions detected."""
    
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    width, height = page.rect.width, page.rect.height
    
    print("="*80)
    print(f"DIMENSION COVERAGE ANALYSIS")
    print("="*80)
    print(f"File: {os.path.basename(pdf_path)}")
    print(f"Page: {page_num}")
    print(f"Dimensions: {width:.1f} x {height:.1f} pts")
    print()
    
    # Get all text that looks like dimensions
    words = page.get_text("words")
    dimension_like_text = []
    
    for w in words:
        text = w[4].strip()
        # Simple filter: contains digit and is not too long
        if any(c.isdigit() for c in text) and len(text) < 30:
            # Check if it's dimension-like (has numbers, maybe +/-, maybe dots)
            if any(char in text for char in ['.', '+', '-', 'X', 'x']) or text.replace('.','').replace(',','').isdigit():
                wx = (w[0] + w[2]) / 2
                wy = (w[1] + w[3]) / 2
                dimension_like_text.append({
                    'text': text,
                    'x': wx / width,
                    'y': wy / height
                })
    
    print(f"Found {len(dimension_like_text)} dimension-like text items in PDF")
    
    # Get detected dimensions
    result = extract_all_dimensions_from_page(pdf_path, page_num)
    detected_count = len(result.get("items", []))
    
    print(f"Detected: {detected_count} dimensions")
    print(f"Potential missing: {len(dimension_like_text) - detected_count}")
    print()
    
    # Analyze by region
    regions = {
        'top_edge': (0, 0.05),
        'left_edge': (0, 0.05),
        'right_edge': (0.95, 1.0),
        'bottom_edge': (0.95, 1.0),
        'interior': (0.1, 0.9)
    }
    
    detected_items = result.get("items", [])
    
    print("Dimension distribution:")
    for region_name, (y_low, y_high) in [('top_edge', (0, 0.05)), ('interior', (0.1, 0.9)), ('bottom_edge', (0.9, 1.0))]:
        count = sum(1 for item in detected_items if y_low <= item['normY'] <= y_high)
        print(f"  {region_name}: {count} dimensions")
    
    # Check specifically for numbers near borders that might be dimensions
    print()
    print("Dimension-like text near borders (not detected):")
    
    detected_positions = set()
    for item in detected_items:
        detected_positions.add((round(item['normX'], 2), round(item['normY'], 2)))
    
    border_threshold = 0.08
    missing_near_borders = []
    
    for dim in dimension_like_text:
        pos_key = (round(dim['x'], 2), round(dim['y'], 2))
        if pos_key not in detected_positions:
            near_border = (dim['y'] < border_threshold or dim['y'] > (1 - border_threshold) or
                          dim['x'] < border_threshold or dim['x'] > (1 - border_threshold))
            if near_border:
                missing_near_borders.append(dim)
    
    if missing_near_borders:
        print(f"  Found {len(missing_near_borders)} potential dimensions near borders:")
        for dim in missing_near_borders[:10]:  # Show first 10
            location = []
            if dim['y'] < 0.08:
                location.append("top")
            if dim['y'] > 0.92:
                location.append("bottom")
            if dim['x'] < 0.08:
                location.append("left")
            if dim['x'] > 0.92:
                location.append("right")
            print(f"    '{dim['text']}' at ({dim['x']:.3f}, {dim['y']:.3f}) [{', '.join(location)}]")
    else:
        print("  None found - all border dimensions appear to be detected")
    
    doc.close()
    
    return missing_near_borders


def check_tolerance_values(pdf_path, page_num=1):
    """Check if tolerances are being extracted correctly."""
    
    print()
    print("="*80)
    print("TOLERANCE EXTRACTION CHECK")
    print("="*80)
    
    result = extract_all_dimensions_from_page(pdf_path, page_num)
    items = result.get("items", [])
    
    # Count dimensions with tolerances
    with_tolerance = [item for item in items if item.get('upperTolerance', 0) != 0 or item.get('lowerTolerance', 0) != 0]
    without_tolerance = [item for item in items if item.get('upperTolerance', 0) == 0 and item.get('lowerTolerance', 0) == 0]
    
    print(f"Dimensions with tolerances: {len(with_tolerance)}")
    print(f"Dimensions without tolerances: {len(without_tolerance)}")
    print()
    
    if with_tolerance:
        print("Sample dimensions WITH tolerances:")
        for item in with_tolerance[:5]:
            print(f"  '{item['rawText']}' -> nom={item['nominalValue']}, upper={item['upperTolerance']}, lower={item['lowerTolerance']}")
    
    # Check raw PDF text for tolerance patterns
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    words = page.get_text("words")
    
    tolerance_patterns_in_pdf = []
    for w in words:
        text = w[4]
        if any(pattern in text for pattern in ['+0.', '-0.', '±', '+/-']):
            tolerance_patterns_in_pdf.append(text)
    
    print()
    print(f"Tolerance patterns found in PDF text: {len(tolerance_patterns_in_pdf)}")
    if tolerance_patterns_in_pdf:
        print("  Examples:", tolerance_patterns_in_pdf[:5])
    
    # The issue: PDF might have tolerance text separate from nominal value
    # Check for fragmented text
    print()
    print("Checking for fragmented tolerance annotations...")
    
    # Look for nominal values that might have separate tolerance text nearby
    suspicious_nominals = []
    for item in without_tolerance:
        nom = item['nominalValue']
        # Check if this is a "nice" number that would typically have a tolerance
        if nom and 10 < nom < 200 and str(nom).count('.') <= 1:
            suspicious_nominals.append(item)
    
    if suspicious_nominals:
        print(f"Found {len(suspicious_nominals)} dimensions without tolerances that might need them")
        print("  (These could have tolerance text in separate PDF spans)")
        for item in suspicious_nominals[:5]:
            print(f"    '{item['rawText']}' = {item['nominalValue']} at ({item['normX']:.3f}, {item['normY']:.3f})")
    
    doc.close()


def main():
    """Run all checks."""
    
    upload_dir = os.path.join(os.path.dirname(__file__), '../../..', 'backend', 'uploads')
    
    gear_cover_pdf = None
    if os.path.exists(upload_dir):
        for file in os.listdir(upload_dir):
            if "GEAR COVER" in file.upper() or "GP3.010" in file:
                gear_cover_pdf = os.path.join(upload_dir, file)
                break
    
    if not gear_cover_pdf:
        print("ERROR: GEAR COVER PDF not found")
        return
    
    # Issue 1: Check for missing dimensions near borders
    missing_borders = check_pdf_coverage(gear_cover_pdf, 1)
    
    # Issue 2: Check tolerance extraction
    check_tolerance_values(gear_cover_pdf, 1)
    
    print()
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Issue 1 (Border dimensions): {len(missing_borders) if missing_borders else 0} potential missing")
    print("Issue 2 (Tolerances): Check output above for fragmentation issues")


if __name__ == "__main__":
    main()
