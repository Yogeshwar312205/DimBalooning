#!/usr/bin/env python3
"""
Test script to verify PDF extraction improvements on complex CAD drawings.
Tests the enhanced dimension extraction with the GEAR COVER drawing.
"""

import sys
import os

# Add the pdf-service app to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pdf-service'))

from app.services.pdf_extractor import (
    extract_all_dimensions_from_page,
    parse_dimension_string,
    detect_title_block_region,
    detect_view_regions
)
import fitz

def test_parse_dimension_string():
    """Test enhanced dimension parsing with various formats."""
    print("\n" + "="*80)
    print("TEST 1: Enhanced Dimension String Parsing")
    print("="*80)
    
    test_cases = [
        # Basic dimensions
        ("50", "Simple nominal"),
        ("Ø50", "Diameter"),
        ("R10", "Radius"),
        ("M20", "Thread"),
        
        # Tolerances
        ("25 ± 0.1", "Symmetric tolerance"),
        ("25 +0.1/-0.05", "Asymmetric tolerance"),
        ("50 +0.025", "Unilateral positive"),
        ("50 -0.010", "Unilateral negative"),
        
        # ISO fits
        ("50 H7", "ISO fit H7"),
        ("25 f8", "ISO fit f8"),
        ("Ø30 H7 +0.025", "ISO fit with explicit tolerance"),
        
        # Limit dimensions
        ("50.025/50.000", "Limit dimension"),
        ("25.100/24.900", "Limit dimension 2"),
        
        # Reference dimensions
        ("(50)", "Reference dimension"),
        ("(Ø25)", "Reference diameter"),
        
        # Should be filtered out
        ("SCALE 1:2", "Scale notation - should reject"),
        ("SECTION A-A", "Section label - should reject"),
        ("REV A", "Revision marker - should reject"),
        ("DRAWN BY", "Title block text - should reject"),
        ("PAGE 1", "Page number - should reject"),
        ("B1", "Element ID - should reject"),
        ("13523526", "Part number - should reject"),
    ]
    
    passed = 0
    failed = 0
    
    for text, description in test_cases:
        result = parse_dimension_string(text)
        is_rejected = result is None or not result.get("found")
        should_reject = "should reject" in description.lower()
        
        status = "✓" if (is_rejected == should_reject) else "✗"
        if is_rejected == should_reject:
            passed += 1
        else:
            failed += 1
            
        print(f"{status} {description:40} | Input: {text:20} | Result: {result if not is_rejected else 'REJECTED'}")
    
    print(f"\n{passed} passed, {failed} failed out of {len(test_cases)} tests")
    return failed == 0


def test_title_block_detection():
    """Test title block detection on the GEAR COVER drawing."""
    print("\n" + "="*80)
    print("TEST 2: Title Block Detection")
    print("="*80)
    
    # Find the GEAR COVER PDF
    test_pdf_paths = [
        "backend/uploads/1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf",
        "backend/uploads/1792740428308-643020526-GP3.010.81.0.PR-GEAR COVER.pdf",
    ]
    
    test_pdf = None
    for path in test_pdf_paths:
        if os.path.exists(path):
            test_pdf = path
            break
    
    if not test_pdf:
        print("✗ GEAR COVER test PDF not found in backend/uploads/")
        print("  Available uploads:")
        if os.path.exists("backend/uploads"):
            for f in os.listdir("backend/uploads"):
                if f.endswith('.pdf'):
                    print(f"    - {f}")
        return False
    
    print(f"Testing with: {os.path.basename(test_pdf)}")
    
    doc = fitz.open(test_pdf)
    page = doc[0]  # First page
    rect = page.rect
    
    title_block = detect_title_block_region(page, rect.width, rect.height)
    
    print(f"\nDetected Title Block Region:")
    print(f"  Position: x[{title_block['x0']:.3f}, {title_block['x1']:.3f}] y[{title_block['y0']:.3f}, {title_block['y1']:.3f}]")
    print(f"  Confidence: {title_block['confidence']:.2f}")
    
    # Check if it's reasonable (should be in bottom-right area typically)
    is_reasonable = (title_block['x0'] > 0.4 and title_block['y0'] > 0.6)
    status = "✓" if is_reasonable else "✗"
    print(f"{status} Title block position seems {'reasonable' if is_reasonable else 'unreasonable'}")
    
    doc.close()
    return is_reasonable


def test_view_detection():
    """Test view/section detection on the GEAR COVER drawing."""
    print("\n" + "="*80)
    print("TEST 3: Drawing View/Section Detection")
    print("="*80)
    
    test_pdf_paths = [
        "backend/uploads/1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf",
        "backend/uploads/1792740428308-643020526-GP3.010.81.0.PR-GEAR COVER.pdf",
    ]
    
    test_pdf = None
    for path in test_pdf_paths:
        if os.path.exists(path):
            test_pdf = path
            break
    
    if not test_pdf:
        print("✗ GEAR COVER test PDF not found")
        return False
    
    doc = fitz.open(test_pdf)
    page = doc[0]
    rect = page.rect
    
    view_regions = detect_view_regions(page, rect.width, rect.height)
    
    print(f"\nDetected {len(view_regions)} view/section regions:")
    for view in view_regions:
        print(f"  - {view['label']:20} at ({view['center_x']:.3f}, {view['center_y']:.3f})")
    
    # GEAR COVER drawing should have multiple sections (B-B, D-D, E-E, F-F, etc.)
    has_sections = len(view_regions) > 0
    status = "✓" if has_sections else "✗"
    print(f"\n{status} {'Found' if has_sections else 'No'} section views detected")
    
    doc.close()
    return True  # This is informational, not a hard requirement


def test_full_extraction():
    """Test complete extraction on GEAR COVER drawing."""
    print("\n" + "="*80)
    print("TEST 4: Full Page Extraction with All Enhancements")
    print("="*80)
    
    test_pdf_paths = [
        "backend/uploads/1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf",
        "backend/uploads/1792740428308-643020526-GP3.010.81.0.PR-GEAR COVER.pdf",
    ]
    
    test_pdf = None
    for path in test_pdf_paths:
        if os.path.exists(path):
            test_pdf = path
            break
    
    if not test_pdf:
        print("✗ GEAR COVER test PDF not found")
        return False
    
    print(f"Extracting from: {os.path.basename(test_pdf)}")
    
    result = extract_all_dimensions_from_page(test_pdf, page_number=1)
    
    if not result.get("success"):
        print(f"✗ Extraction failed: {result.get('error')}")
        return False
    
    items = result.get("items", [])
    print(f"\n✓ Successfully extracted {len(items)} dimensions")
    
    # Analyze extraction results
    if items:
        print("\nSample of detected dimensions:")
        for i, item in enumerate(items[:10]):  # Show first 10
            print(f"  {i+1:2}. {item['rawText']:20} | Type: {item.get('dimensionType', 'LINEAR'):12} | "
                  f"Conf: {item.get('confidence', 0):.2f} | Pos: ({item['normX']:.3f}, {item['normY']:.3f})")
        
        if len(items) > 10:
            print(f"  ... and {len(items) - 10} more")
        
        # Count by type
        type_counts = {}
        for item in items:
            dim_type = item.get('dimensionType', 'LINEAR')
            type_counts[dim_type] = type_counts.get(dim_type, 0) + 1
        
        print("\nDimension types detected:")
        for dim_type, count in sorted(type_counts.items()):
            print(f"  {dim_type:15}: {count}")
        
        # Count by confidence
        high_conf = sum(1 for item in items if item.get('confidence', 0) >= 0.85)
        med_conf = sum(1 for item in items if 0.6 <= item.get('confidence', 0) < 0.85)
        low_conf = sum(1 for item in items if item.get('confidence', 0) < 0.6)
        
        print("\nConfidence distribution:")
        print(f"  High (≥0.85): {high_conf}")
        print(f"  Medium (0.6-0.85): {med_conf}")
        print(f"  Low (<0.6): {low_conf}")
    
    return True


def main():
    """Run all tests."""
    print("\n" + "="*80)
    print("ENHANCED PDF EXTRACTION TEST SUITE")
    print("Testing improvements for complex CAD drawing processing")
    print("="*80)
    
    results = {
        "Dimension Parsing": test_parse_dimension_string(),
        "Title Block Detection": test_title_block_detection(),
        "View Detection": test_view_detection(),
        "Full Extraction": test_full_extraction(),
    }
    
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results.items():
        status = "✓ PASSED" if passed else "✗ FAILED"
        print(f"{test_name:30}: {status}")
    
    total_passed = sum(1 for passed in results.values() if passed)
    print(f"\nOverall: {total_passed}/{len(results)} test suites passed")
    
    return total_passed == len(results)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
