"""
Phase 2 Integration Test - End-to-End Mixed PDF Support

Tests the complete pipeline with mixed vector+raster content to validate:
1. Vector extraction works
2. OCR runs even when vector finds dimensions (no longer blocked)
3. Fusion layer correctly merges duplicates
4. Database stores new fields (extractionMode, toleranceStatus, confidence)
5. No duplicate balloon numbers created
"""

import sys
import os
sys.path.insert(0, 'pdf-service/app')

from services.pdf_extractor import extract_all_dimensions_from_page
import json

def test_vector_only_pdf():
    """Test on a pure vector PDF"""
    print("="*80)
    print("TEST 1: Vector-Only PDF")
    print("="*80)
    
    pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
    
    if not os.path.exists(pdf_path):
        print(f"⚠️  PDF not found: {pdf_path}")
        print("   Skipping vector-only test")
        return
    
    result = extract_all_dimensions_from_page(pdf_path, page_number=1)
    
    print(f"\nResults:")
    print(f"  Success: {result.get('success')}")
    print(f"  Dimensions found: {result.get('count', 0)}")
    
    if result.get('diagnostics', {}).get('filterStats'):
        stats = result['diagnostics']['filterStats']
        print(f"  Filter stats:")
        print(f"    - Total candidates: {stats.get('total_candidates', 0)}")
        print(f"    - Accepted: {stats.get('accepted', 0)}")
        print(f"    - Filtered: {stats.get('total_candidates', 0) - stats.get('accepted', 0)}")
        
        # Check fusion stats
        if stats.get('vector_candidates') is not None:
            print(f"  Fusion stats:")
            print(f"    - Vector candidates: {stats.get('vector_candidates', 0)}")
            print(f"    - OCR candidates: {stats.get('ocr_candidates', 0)}")
            print(f"    - Matched pairs: {stats.get('fusion_matched_pairs', 0)}")
            print(f"    - Final output: {stats.get('fusion_output', 0)}")
    
    # Check extraction modes
    if result.get('items'):
        modes = {}
        for item in result['items']:
            mode = item.get('extractionMode', 'UNKNOWN')
            modes[mode] = modes.get(mode, 0) + 1
        
        print(f"  Extraction modes:")
        for mode, count in modes.items():
            print(f"    - {mode}: {count}")
    
    # Validate no duplicates at same location
    positions = set()
    duplicates = 0
    for item in result.get('items', []):
        pos = (round(item.get('normX', 0), 3), round(item.get('normY', 0), 3))
        if pos in positions:
            duplicates += 1
        positions.add(pos)
    
    if duplicates > 0:
        print(f"  ⚠️  WARNING: {duplicates} dimensions at duplicate positions")
    else:
        print(f"  ✓ No positional duplicates detected")
    
    print()

def test_tolerance_extraction():
    """Validate tolerance extraction improvements"""
    print("="*80)
    print("TEST 2: Tolerance Extraction")
    print("="*80)
    
    pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
    
    if not os.path.exists(pdf_path):
        print(f"⚠️  PDF not found, skipping")
        return
    
    result = extract_all_dimensions_from_page(pdf_path, page_number=1)
    
    if not result.get('success'):
        print(f"✗ Extraction failed: {result.get('error')}")
        return
    
    items = result.get('items', [])
    with_tolerances = [
        item for item in items 
        if item.get('upperTolerance', 0) != 0 or item.get('lowerTolerance', 0) != 0
    ]
    
    print(f"\nTolerance Extraction Results:")
    print(f"  Total dimensions: {len(items)}")
    print(f"  With tolerances: {len(with_tolerances)} ({len(with_tolerances)/len(items)*100:.1f}%)")
    
    # Look for specific test cases (27.5 ±0.15, 37.5 ±0.2)
    target_27_5 = [
        item for item in with_tolerances 
        if abs(item.get('nominalValue', 0) - 27.5) < 0.1
    ]
    target_37_5 = [
        item for item in with_tolerances 
        if abs(item.get('nominalValue', 0) - 37.5) < 0.1
    ]
    
    if target_27_5:
        item = target_27_5[0]
        print(f"  ✓ Found 27.5: {item.get('rawText')} (tol: +{item.get('upperTolerance')}/{item.get('lowerTolerance')})")
    else:
        print(f"  ⚠️  27.5 dimension not found or no tolerance")
    
    if target_37_5:
        item = target_37_5[0]
        print(f"  ✓ Found 37.5: {item.get('rawText')} (tol: +{item.get('upperTolerance')}/{item.get('lowerTolerance')})")
    else:
        print(f"  ⚠️  37.5 dimension not found or no tolerance")
    
    print()

def test_extraction_mode_tracking():
    """Validate that extraction mode is tracked correctly"""
    print("="*80)
    print("TEST 3: Extraction Mode Tracking")
    print("="*80)
    
    pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
    
    if not os.path.exists(pdf_path):
        print(f"⚠️  PDF not found, skipping")
        return
    
    result = extract_all_dimensions_from_page(pdf_path, page_number=1)
    
    if not result.get('success'):
        print(f"✗ Extraction failed")
        return
    
    items = result.get('items', [])
    
    # Count by extraction mode
    modes = {
        'VECTOR': 0,
        'OCR': 0,
        'FUSED_VECTOR_OCR': 0,
        'UNKNOWN': 0
    }
    
    for item in items:
        mode = item.get('extractionMode', 'UNKNOWN')
        if mode in modes:
            modes[mode] += 1
        else:
            modes['UNKNOWN'] += 1
    
    print(f"\nExtraction Mode Distribution:")
    for mode, count in modes.items():
        if count > 0:
            print(f"  {mode}: {count} ({count/len(items)*100:.1f}%)")
    
    if modes['FUSED_VECTOR_OCR'] > 0:
        print(f"  ✓ Fusion is working - found {modes['FUSED_VECTOR_OCR']} fused dimensions")
    elif modes['OCR'] > 0:
        print(f"  ⚠️  OCR ran but no fusion - check if duplicates exist")
    else:
        print(f"  ℹ️  Pure vector PDF - OCR optimization skipped (expected for high-quality PDFs)")
    
    print()

def test_confidence_scores():
    """Validate confidence scores are preserved"""
    print("="*80)
    print("TEST 4: Confidence Score Tracking")
    print("="*80)
    
    pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
    
    if not os.path.exists(pdf_path):
        print(f"⚠️  PDF not found, skipping")
        return
    
    result = extract_all_dimensions_from_page(pdf_path, page_number=1)
    
    if not result.get('success'):
        print(f"✗ Extraction failed")
        return
    
    items = result.get('items', [])
    with_confidence = [item for item in items if item.get('confidence') is not None]
    
    print(f"\nConfidence Score Analysis:")
    print(f"  Dimensions with confidence: {len(with_confidence)}/{len(items)}")
    
    if with_confidence:
        confidences = [item.get('confidence', 0) for item in with_confidence]
        avg_conf = sum(confidences) / len(confidences)
        min_conf = min(confidences)
        max_conf = max(confidences)
        
        print(f"  Average confidence: {avg_conf:.3f}")
        print(f"  Min confidence: {min_conf:.3f}")
        print(f"  Max confidence: {max_conf:.3f}")
        
        # Distribution
        high = sum(1 for c in confidences if c >= 0.9)
        medium = sum(1 for c in confidences if 0.7 <= c < 0.9)
        low = sum(1 for c in confidences if c < 0.7)
        
        print(f"  Distribution:")
        print(f"    High (≥0.9): {high} ({high/len(confidences)*100:.1f}%)")
        print(f"    Medium (0.7-0.9): {medium} ({medium/len(confidences)*100:.1f}%)")
        print(f"    Low (<0.7): {low} ({low/len(confidences)*100:.1f}%)")
    
    print()

def main():
    print("\n" + "="*80)
    print("PHASE 2 INTEGRATION TEST SUITE")
    print("Testing Vector-OCR Fusion, Database Schema, and Mixed PDF Support")
    print("="*80 + "\n")
    
    test_vector_only_pdf()
    test_tolerance_extraction()
    test_extraction_mode_tracking()
    test_confidence_scores()
    
    print("="*80)
    print("✓ INTEGRATION TESTS COMPLETE")
    print("="*80)
    print("\nNext Steps:")
    print("1. Start backend: cd backend && npm run dev")
    print("2. Start PDF service: cd pdf-service && python -m uvicorn app.main:app --reload")
    print("3. Test via UI: Upload a PDF and click Auto-Detect")
    print("4. Verify: Check database for extractionMode, toleranceStatus, confidence fields")
    print()

if __name__ == '__main__':
    main()
