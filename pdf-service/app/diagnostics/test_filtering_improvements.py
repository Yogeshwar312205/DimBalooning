"""
Test script to verify false-positive filtering improvements.
Simple output without unicode characters for Windows compatibility.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.services.pdf_extractor import extract_all_dimensions_from_page
import fitz

def test_gear_cover_pdf():
    """Test on the GEAR COVER PDF."""
    
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
    
    print("="*80)
    print("FALSE-POSITIVE FILTERING TEST")
    print("="*80)
    print(f"File: {os.path.basename(gear_cover_pdf)}")
    print()
    
    doc = fitz.open(gear_cover_pdf)
    total_pages = len(doc)
    doc.close()
    
    all_detections = []
    
    for page_num in range(1, total_pages + 1):
        print(f"--- Page {page_num} ---")
        
        result = extract_all_dimensions_from_page(gear_cover_pdf, page_num)
        
        if result.get("success"):
            items = result.get("items", [])
            diagnostics = result.get("diagnostics", {})
            stats = diagnostics.get("filterStats", {})
            
            print(f"Detections: {len(items)}")
            print(f"Filtered out: {stats.get('total_candidates', 0) - len(items)}")
            print(f"  - Sheet borders/grid labels: {stats.get('sheet_border', 0)}")
            print(f"  - Title block: {stats.get('title_block', 0)}")
            print(f"  - Revision table: {stats.get('revision_table', 0)}")
            print(f"  - Outside drawing: {stats.get('outside_drawing', 0)}")
            print()
            
            # Check for border detections
            border_count = 0
            for item in items:
                x, y = item['normX'], item['normY']
                if y < 0.05 or y > 0.95 or x < 0.05 or x > 0.95:
                    border_count += 1
            
            if border_count > 0:
                print(f"WARNING: {border_count} detections still near borders")
            else:
                print("SUCCESS: No detections on sheet borders")
            print()
            
            all_detections.extend(items)
        else:
            print(f"ERROR: {result.get('error')}")
    
    print("="*80)
    print("OVERALL SUMMARY")
    print("="*80)
    print(f"Total pages processed: {total_pages}")
    print(f"Total valid detections: {len(all_detections)}")
    print()
    
    # Check specific problematic balloons from original report
    print("Checking original problem balloons:")
    page1_items = extract_all_dimensions_from_page(gear_cover_pdf, 1).get("items", [])
    
    # Check if grid labels "10", "11", "12" are filtered
    grid_labels_found = []
    for i, item in enumerate(page1_items[:20]):  # Check first 20 balloons
        text = item['rawText']
        y = item['normY']
        if text in ["10", "11", "12"] and (y < 0.05 or y > 0.95):
            grid_labels_found.append((i+1, text, y))
    
    if grid_labels_found:
        print(f"FAIL: Grid labels still detected: {grid_labels_found}")
    else:
        print("PASS: Grid labels (10, 11, 12) successfully filtered")
    
    # Check title block area (y > 0.85)
    title_block_items = [item for item in page1_items if item['normY'] > 0.85]
    print(f"Title block area detections: {len(title_block_items)}")
    
    if len(title_block_items) > 2:
        print(f"WARNING: {len(title_block_items)} detections still in title block area")
    else:
        print("PASS: Title block area mostly clean")
    
    print()
    print("Test complete!")


if __name__ == "__main__":
    test_gear_cover_pdf()
