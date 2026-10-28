"""
Test Vector-OCR Fusion Layer

This script validates the fusion logic with synthetic test cases.
"""

import sys
sys.path.insert(0, 'app')

from services.fusion import (
    calculate_iou,
    calculate_center_distance,
    calculate_text_similarity,
    are_candidates_duplicate,
    merge_candidates,
    fuse_vector_and_ocr_candidates
)

def test_iou():
    """Test IoU calculation"""
    print("="*80)
    print("TEST 1: IoU Calculation")
    print("="*80)
    
    # Perfect overlap
    bbox1 = {'x0': 0.1, 'y0': 0.2, 'x1': 0.15, 'y1': 0.25}
    bbox2 = {'x0': 0.1, 'y0': 0.2, 'x1': 0.15, 'y1': 0.25}
    iou = calculate_iou(bbox1, bbox2)
    assert abs(iou - 1.0) < 0.01, f"Perfect overlap should be 1.0, got {iou}"
    print(f"✓ Perfect overlap: IoU = {iou:.3f}")
    
    # Partial overlap
    bbox1 = {'x0': 0.1, 'y0': 0.2, 'x1': 0.2, 'y1': 0.3}
    bbox2 = {'x0': 0.15, 'y0': 0.25, 'x1': 0.25, 'y1': 0.35}
    iou = calculate_iou(bbox1, bbox2)
    print(f"✓ Partial overlap: IoU = {iou:.3f}")
    
    # No overlap
    bbox1 = {'x0': 0.1, 'y0': 0.2, 'x1': 0.2, 'y1': 0.3}
    bbox2 = {'x0': 0.5, 'y0': 0.6, 'x1': 0.6, 'y1': 0.7}
    iou = calculate_iou(bbox1, bbox2)
    assert iou == 0.0, f"No overlap should be 0.0, got {iou}"
    print(f"✓ No overlap: IoU = {iou:.3f}")
    
    print()

def test_text_similarity():
    """Test text similarity calculation"""
    print("="*80)
    print("TEST 2: Text Similarity")
    print("="*80)
    
    # Identical text
    sim = calculate_text_similarity("25.5 ±0.1", "25.5 ±0.1")
    assert sim == 1.0, f"Identical text should be 1.0, got {sim}"
    print(f"✓ Identical: '25.5 ±0.1' vs '25.5 ±0.1' = {sim:.3f}")
    
    # OCR variations
    sim = calculate_text_similarity("25.5", "25.S")  # S misread as 5
    print(f"✓ OCR variation: '25.5' vs '25.S' = {sim:.3f}")
    
    # Similar dimensions
    sim = calculate_text_similarity("Ø50", "50")
    print(f"✓ Similar: 'Ø50' vs '50' = {sim:.3f}")
    
    # Different text
    sim = calculate_text_similarity("25.5", "100.2")
    print(f"✓ Different: '25.5' vs '100.2' = {sim:.3f}")
    
    print()

def test_duplicate_detection():
    """Test duplicate detection logic"""
    print("="*80)
    print("TEST 3: Duplicate Detection")
    print("="*80)
    
    # Test Case 1: High IoU overlap (same dimension detected by both)
    vector_cand = {
        'normX': 0.5, 'normY': 0.3,
        'bbox': {'x0': 0.48, 'y0': 0.29, 'x1': 0.52, 'y1': 0.31},
        'rawText': '25.5 ±0.1',
        'nominalValue': 25.5,
        'upperTolerance': 0.1,
        'lowerTolerance': -0.1,
        'confidence': 0.95
    }
    
    ocr_cand = {
        'normX': 0.501, 'normY': 0.301,
        'bbox': {'x0': 0.481, 'y0': 0.291, 'x1': 0.521, 'y1': 0.311},
        'rawText': '25.5',
        'nominalValue': 25.5,
        'upperTolerance': 0.0,
        'lowerTolerance': 0.0,
        'confidence': 0.75
    }
    
    is_dup, conf, reason = are_candidates_duplicate(vector_cand, ocr_cand)
    print(f"Test Case 1 - High IoU overlap:")
    print(f"  Vector: '{vector_cand['rawText']}' @ ({vector_cand['normX']:.3f}, {vector_cand['normY']:.3f})")
    print(f"  OCR:    '{ocr_cand['rawText']}' @ ({ocr_cand['normX']:.3f}, {ocr_cand['normY']:.3f})")
    print(f"  Result: is_duplicate={is_dup}, confidence={conf:.2f}, reason={reason}")
    assert is_dup, "High IoU should detect duplicate"
    print(f"  ✓ PASS\n")
    
    # Test Case 2: Different locations (not duplicates)
    ocr_cand2 = {
        'normX': 0.8, 'normY': 0.7,
        'bbox': {'x0': 0.78, 'y0': 0.69, 'x1': 0.82, 'y1': 0.71},
        'rawText': '25.5',
        'nominalValue': 25.5,
        'upperTolerance': 0.0,
        'lowerTolerance': 0.0,
        'confidence': 0.75
    }
    
    is_dup, conf, reason = are_candidates_duplicate(vector_cand, ocr_cand2)
    print(f"Test Case 2 - Different locations (same value):")
    print(f"  Vector: '{vector_cand['rawText']}' @ ({vector_cand['normX']:.3f}, {vector_cand['normY']:.3f})")
    print(f"  OCR:    '{ocr_cand2['rawText']}' @ ({ocr_cand2['normX']:.3f}, {ocr_cand2['normY']:.3f})")
    print(f"  Result: is_duplicate={is_dup}, confidence={conf:.2f}, reason={reason}")
    assert not is_dup, "Different locations should NOT be duplicates"
    print(f"  ✓ PASS\n")
    
    # Test Case 3: Close centers, similar text
    ocr_cand3 = {
        'normX': 0.505, 'normY': 0.305,
        'bbox': {'x0': 0.495, 'y0': 0.295, 'x1': 0.515, 'y1': 0.315},
        'rawText': '25.S',  # OCR misread 5 as S
        'nominalValue': None,
        'upperTolerance': 0.0,
        'lowerTolerance': 0.0,
        'confidence': 0.65
    }
    
    is_dup, conf, reason = are_candidates_duplicate(vector_cand, ocr_cand3)
    print(f"Test Case 3 - Close centers, OCR variation:")
    print(f"  Vector: '{vector_cand['rawText']}' @ ({vector_cand['normX']:.3f}, {vector_cand['normY']:.3f})")
    print(f"  OCR:    '{ocr_cand3['rawText']}' @ ({ocr_cand3['normX']:.3f}, {ocr_cand3['normY']:.3f})")
    print(f"  Result: is_duplicate={is_dup}, confidence={conf:.2f}, reason={reason}")
    # Should still match due to close proximity
    print(f"  ✓ Result: {'DUPLICATE' if is_dup else 'UNIQUE'}\n")
    
    print()

def test_merge_logic():
    """Test candidate merging"""
    print("="*80)
    print("TEST 4: Candidate Merging")
    print("="*80)
    
    vector_cand = {
        'normX': 0.5, 'normY': 0.3,
        'bbox': {'x0': 0.48, 'y0': 0.29, 'x1': 0.52, 'y1': 0.31},
        'rawText': '25.5',
        'nominalValue': 25.5,
        'upperTolerance': 0.0,
        'lowerTolerance': 0.0,
        'confidence': 0.95,
        'extractionMode': 'VECTOR'
    }
    
    ocr_cand = {
        'normX': 0.501, 'normY': 0.301,
        'bbox': {'x0': 0.481, 'y0': 0.291, 'x1': 0.521, 'y1': 0.311},
        'rawText': '25.5 ±0.1',
        'nominalValue': 25.5,
        'upperTolerance': 0.1,
        'lowerTolerance': -0.1,
        'confidence': 0.75,
        'extractionMode': 'OCR'
    }
    
    merged = merge_candidates(vector_cand, ocr_cand)
    
    print(f"Vector: '{vector_cand['rawText']}', tol={vector_cand['upperTolerance']}/{vector_cand['lowerTolerance']}")
    print(f"OCR:    '{ocr_cand['rawText']}', tol={ocr_cand['upperTolerance']}/{ocr_cand['lowerTolerance']}")
    print(f"Merged: '{merged['rawText']}', tol={merged['upperTolerance']}/{merged['lowerTolerance']}")
    print(f"  Mode: {merged['extractionMode']}")
    print(f"  Confidence: {merged['confidence']:.3f}")
    
    # Verify OCR tolerance was used (vector had none)
    assert merged['upperTolerance'] == 0.1, "Should use OCR tolerance when vector has none"
    print(f"  ✓ PASS: Merged tolerances correctly\n")
    
    print()

def test_full_fusion():
    """Test complete fusion pipeline"""
    print("="*80)
    print("TEST 5: Full Fusion Pipeline")
    print("="*80)
    
    # Simulate a mixed PDF scenario
    vector_candidates = [
        {
            'normX': 0.2, 'normY': 0.3,
            'bbox': {'x0': 0.18, 'y0': 0.29, 'x1': 0.22, 'y1': 0.31},
            'rawText': 'Ø50',
            'nominalValue': 50.0,
            'upperTolerance': 0.0,
            'lowerTolerance': 0.0,
            'confidence': 0.90,
            'extractionMode': 'VECTOR'
        },
        {
            'normX': 0.5, 'normY': 0.5,
            'bbox': {'x0': 0.48, 'y0': 0.49, 'x1': 0.52, 'y1': 0.51},
            'rawText': '25.5',
            'nominalValue': 25.5,
            'upperTolerance': 0.0,
            'lowerTolerance': 0.0,
            'confidence': 0.95,
            'extractionMode': 'VECTOR'
        },
        {
            'normX': 0.7, 'normY': 0.7,
            'bbox': {'x0': 0.68, 'y0': 0.69, 'x1': 0.72, 'y1': 0.71},
            'rawText': '100.0',
            'nominalValue': 100.0,
            'upperTolerance': 0.0,
            'lowerTolerance': 0.0,
            'confidence': 0.92,
            'extractionMode': 'VECTOR'
        }
    ]
    
    ocr_candidates = [
        {
            'normX': 0.201, 'normY': 0.301,
            'bbox': {'x0': 0.181, 'y0': 0.291, 'x1': 0.221, 'y1': 0.311},
            'rawText': '50',
            'nominalValue': 50.0,
            'upperTolerance': 0.0,
            'lowerTolerance': 0.0,
            'confidence': 0.80,
            'extractionMode': 'OCR'
        },
        {
            'normX': 0.501, 'normY': 0.501,
            'bbox': {'x0': 0.481, 'y0': 0.491, 'x1': 0.521, 'y1': 0.511},
            'rawText': '25.5 ±0.1',
            'nominalValue': 25.5,
            'upperTolerance': 0.1,
            'lowerTolerance': -0.1,
            'confidence': 0.75,
            'extractionMode': 'OCR'
        },
        {
            'normX': 0.35, 'normY': 0.45,
            'bbox': {'x0': 0.33, 'y0': 0.44, 'x1': 0.37, 'y1': 0.46},
            'rawText': '12.7',
            'nominalValue': 12.7,
            'upperTolerance': 0.0,
            'lowerTolerance': 0.0,
            'confidence': 0.85,
            'extractionMode': 'OCR'
        }
    ]
    
    print(f"Input: {len(vector_candidates)} vector + {len(ocr_candidates)} OCR = {len(vector_candidates) + len(ocr_candidates)} total")
    
    fused, stats = fuse_vector_and_ocr_candidates(
        vector_candidates,
        ocr_candidates,
        verbose=True
    )
    
    print(f"\n{'='*80}")
    print(f"FUSION TEST RESULTS:")
    print(f"{'='*80}")
    print(f"Expected: 4 unique dimensions (2 matched pairs + 1 unique vector + 1 unique OCR)")
    print(f"Actual:   {len(fused)} unique dimensions")
    print(f"  - Matched pairs: {stats['matched_pairs']}")
    print(f"  - Unique vector: {stats['unmatched_vector']}")
    print(f"  - Unique OCR:    {stats['unmatched_ocr']}")
    
    # Verify results
    assert len(fused) == 4, f"Expected 4 unique dimensions, got {len(fused)}"
    assert stats['matched_pairs'] == 2, f"Expected 2 matched pairs, got {stats['matched_pairs']}"
    assert stats['unmatched_vector'] == 1, f"Expected 1 unique vector, got {stats['unmatched_vector']}"
    assert stats['unmatched_ocr'] == 1, f"Expected 1 unique OCR, got {stats['unmatched_ocr']}"
    
    print(f"\n✓ ALL TESTS PASSED\n")
    
    # Print fused dimensions
    print(f"Fused Dimensions:")
    for i, dim in enumerate(fused, 1):
        mode = dim.get('extractionMode', 'UNKNOWN')
        text = dim.get('rawText', '')
        nominal = dim.get('nominalValue', 0)
        tol_upper = dim.get('upperTolerance', 0)
        tol_lower = dim.get('lowerTolerance', 0)
        print(f"  {i}. '{text}' = {nominal} +{tol_upper}/{tol_lower} [{mode}]")
    
    print()

if __name__ == '__main__':
    print("\n" + "="*80)
    print("VECTOR-OCR FUSION LAYER TEST SUITE")
    print("="*80 + "\n")
    
    test_iou()
    test_text_similarity()
    test_duplicate_detection()
    test_merge_logic()
    test_full_fusion()
    
    print("="*80)
    print("✓ ALL FUSION TESTS PASSED")
    print("="*80)
