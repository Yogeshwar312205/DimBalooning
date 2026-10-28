"""
Analyze false-positive detections and identify problematic balloons.
Specifically investigate balloons pointing to sheet borders, grids, and title blocks.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.services.pdf_extractor import extract_all_dimensions_from_page
import fitz
import json

def analyze_pdf_detections(pdf_path: str, page_num: int = 1):
    """Analyze all detections on a page and categorize them."""
    
    if not os.path.exists(pdf_path):
        print(f"❌ File not found: {pdf_path}")
        return
    
    print(f"\n{'='*80}")
    print(f"ANALYZING: {os.path.basename(pdf_path)} - Page {page_num}")
    print(f"{'='*80}\n")
    
    # Get PDF dimensions
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    width, height = page.rect.width, page.rect.height
    print(f"Page dimensions: {width:.1f} x {height:.1f} pts\n")
    
    # Extract all text blocks for context
    blocks = page.get_text("blocks")
    print(f"Total text blocks on page: {len(blocks)}\n")
    
    # Get dimension detections
    result = extract_all_dimensions_from_page(pdf_path, page_num)
    
    if not result.get("success"):
        print(f"❌ Extraction failed: {result.get('error')}")
        doc.close()
        return
    
    items = result.get("items", [])
    print(f"Total detections: {len(items)}\n")
    
    # Categorize by location
    border_threshold = 0.05  # 5% from edges
    title_block_y = 0.85  # Typical title block starts at 85% height
    
    categories = {
        "top_border": [],
        "bottom_border": [],
        "left_border": [],
        "right_border": [],
        "title_block_area": [],
        "interior": []
    }
    
    for i, item in enumerate(items):
        balloon_num = i + 1
        x, y = item['normX'], item['normY']
        text = item['rawText']
        confidence = item.get('confidence', 0)
        
        # Categorize by position
        if y < border_threshold:
            categories["top_border"].append((balloon_num, x, y, text, confidence))
        elif y > (1 - border_threshold):
            categories["bottom_border"].append((balloon_num, x, y, text, confidence))
        elif x < border_threshold:
            categories["left_border"].append((balloon_num, x, y, text, confidence))
        elif x > (1 - border_threshold):
            categories["right_border"].append((balloon_num, x, y, text, confidence))
        elif y > title_block_y:
            categories["title_block_area"].append((balloon_num, x, y, text, confidence))
        else:
            categories["interior"].append((balloon_num, x, y, text, confidence))
    
    # Report findings
    print("📍 LOCATION ANALYSIS:\n")
    
    if categories["top_border"]:
        print(f"⚠️  TOP BORDER ({len(categories['top_border'])} detections - LIKELY FALSE POSITIVES):")
        for num, x, y, text, conf in categories["top_border"][:5]:
            print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f}) [conf: {conf:.2f}]")
        if len(categories["top_border"]) > 5:
            print(f"   ... and {len(categories['top_border']) - 5} more")
        print()
    
    if categories["bottom_border"]:
        print(f"⚠️  BOTTOM BORDER ({len(categories['bottom_border'])} detections):")
        for num, x, y, text, conf in categories["bottom_border"][:3]:
            print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f}) [conf: {conf:.2f}]")
        print()
    
    if categories["left_border"]:
        print(f"⚠️  LEFT BORDER ({len(categories['left_border'])} detections):")
        for num, x, y, text, conf in categories["left_border"][:3]:
            print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f}) [conf: {conf:.2f}]")
        print()
    
    if categories["right_border"]:
        print(f"⚠️  RIGHT BORDER ({len(categories['right_border'])} detections):")
        for num, x, y, text, conf in categories["right_border"][:3]:
            print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f}) [conf: {conf:.2f}]")
        print()
    
    if categories["title_block_area"]:
        print(f"⚠️  TITLE BLOCK AREA ({len(categories['title_block_area'])} detections - CHECK THESE):")
        for num, x, y, text, conf in categories["title_block_area"]:
            print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f}) [conf: {conf:.2f}]")
        print()
    
    print(f"✅ INTERIOR DRAWING ({len(categories['interior'])} detections - LIKELY VALID):")
    print(f"   (Showing first 5 only)")
    for num, x, y, text, conf in categories["interior"][:5]:
        print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f}) [conf: {conf:.2f}]")
    print()
    
    # Analyze text patterns
    print("📝 TEXT PATTERN ANALYSIS:\n")
    
    suspicious_patterns = {
        "single_digit": [],
        "single_letter": [],
        "grid_coord": [],
        "sheet_number": [],
        "other": []
    }
    
    for i, item in enumerate(items):
        text = item['rawText'].strip()
        
        if len(text) == 1 and text.isdigit():
            suspicious_patterns["single_digit"].append((i+1, text, item['normX'], item['normY']))
        elif len(text) == 1 and text.isalpha():
            suspicious_patterns["single_letter"].append((i+1, text, item['normX'], item['normY']))
        elif len(text) == 2 and text[0].isalpha() and text[1].isdigit():
            suspicious_patterns["grid_coord"].append((i+1, text, item['normX'], item['normY']))
        elif "SHEET" in text.upper() or "PAGE" in text.upper():
            suspicious_patterns["sheet_number"].append((i+1, text, item['normX'], item['normY']))
    
    total_suspicious = sum(len(v) for v in suspicious_patterns.values())
    
    if suspicious_patterns["single_letter"]:
        print(f"⚠️  SINGLE LETTERS ({len(suspicious_patterns['single_letter'])} found - likely grid labels):")
        for num, text, x, y in suspicious_patterns["single_letter"][:5]:
            print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f})")
        print()
    
    if suspicious_patterns["single_digit"]:
        print(f"⚠️  SINGLE DIGITS ({len(suspicious_patterns['single_digit'])} found - check context):")
        for num, text, x, y in suspicious_patterns["single_digit"][:5]:
            print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f})")
        print()
    
    if suspicious_patterns["grid_coord"]:
        print(f"⚠️  GRID COORDINATES ({len(suspicious_patterns['grid_coord'])} found - FALSE POSITIVES):")
        for num, text, x, y in suspicious_patterns["grid_coord"]:
            print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f})")
        print()
    
    if suspicious_patterns["sheet_number"]:
        print(f"⚠️  SHEET NUMBERS ({len(suspicious_patterns['sheet_number'])} found - FALSE POSITIVES):")
        for num, text, x, y in suspicious_patterns["sheet_number"]:
            print(f"   Balloon #{num}: '{text}' at ({x:.3f}, {y:.3f})")
        print()
    
    # Summary
    print(f"{'='*80}")
    print(f"SUMMARY:")
    print(f"{'='*80}")
    print(f"Total detections: {len(items)}")
    print(f"Near borders: {len(categories['top_border']) + len(categories['bottom_border']) + len(categories['left_border']) + len(categories['right_border'])}")
    print(f"In title block area: {len(categories['title_block_area'])}")
    print(f"Interior (likely valid): {len(categories['interior'])}")
    print(f"Suspicious patterns: {total_suspicious}")
    print()
    
    if total_suspicious > 0 or categories["top_border"] or categories["title_block_area"]:
        print("⚠️  FALSE POSITIVES DETECTED - Filtering improvements needed!")
    else:
        print("✅ No obvious false positives detected")
    
    doc.close()


def main():
    """Analyze the GEAR COVER PDF specifically."""
    
    # Find the GEAR COVER PDF
    upload_dir = os.path.join(os.path.dirname(__file__), '../../..', 'backend', 'uploads')
    
    gear_cover_pdf = None
    if os.path.exists(upload_dir):
        for file in os.listdir(upload_dir):
            if "GEAR COVER" in file.upper() or "GP3.010" in file:
                gear_cover_pdf = os.path.join(upload_dir, file)
                break
    
    if gear_cover_pdf:
        # Analyze Page 1
        analyze_pdf_detections(gear_cover_pdf, page_num=1)
        
        # Analyze Page 2 if it exists
        doc = fitz.open(gear_cover_pdf)
        if len(doc) > 1:
            doc.close()
            analyze_pdf_detections(gear_cover_pdf, page_num=2)
        else:
            doc.close()
    else:
        print("⚠️  GEAR COVER PDF not found")
        print(f"Searched in: {upload_dir}")


if __name__ == "__main__":
    main()
