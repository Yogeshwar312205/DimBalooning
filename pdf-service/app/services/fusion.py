"""
Vector-OCR Fusion and Deduplication Module

This module implements a dedicated fusion layer to merge vector and OCR extraction candidates,
preventing duplicate balloons on mixed PDFs while preserving all unique annotations.

Author: Senior Engineering Team
Date: October 2026
"""

from typing import List, Dict, Any, Tuple, Optional
import math


def calculate_iou(bbox1: Dict[str, float], bbox2: Dict[str, float]) -> float:
    """
    Calculate Intersection over Union (IoU) between two bounding boxes.
    
    Args:
        bbox1, bbox2: Dicts with keys {x0, y0, x1, y1} in normalized coordinates [0, 1]
    
    Returns:
        IoU score between 0.0 and 1.0
    """
    # Extract coordinates
    x1_min, y1_min = bbox1.get('x0', 0), bbox1.get('y0', 0)
    x1_max, y1_max = bbox1.get('x1', 0), bbox1.get('y1', 0)
    x2_min, y2_min = bbox2.get('x0', 0), bbox2.get('y0', 0)
    x2_max, y2_max = bbox2.get('x1', 0), bbox2.get('y1', 0)
    
    # Calculate intersection
    inter_x_min = max(x1_min, x2_min)
    inter_y_min = max(y1_min, y2_min)
    inter_x_max = min(x1_max, x2_max)
    inter_y_max = min(y1_max, y2_max)
    
    inter_width = max(0.0, inter_x_max - inter_x_min)
    inter_height = max(0.0, inter_y_max - inter_y_min)
    inter_area = inter_width * inter_height
    
    # Calculate union
    area1 = (x1_max - x1_min) * (y1_max - y1_min)
    area2 = (x2_max - x2_min) * (y2_max - y2_min)
    union_area = area1 + area2 - inter_area
    
    if union_area < 1e-8:
        return 0.0
    
    return inter_area / union_area


def calculate_center_distance(bbox1: Dict[str, float], bbox2: Dict[str, float]) -> float:
    """
    Calculate normalized Euclidean distance between bbox centers.
    
    Returns:
        Distance in normalized coordinates (0.0 = same center, sqrt(2) = opposite corners)
    """
    cx1 = (bbox1.get('x0', 0) + bbox1.get('x1', 0)) / 2.0
    cy1 = (bbox1.get('y0', 0) + bbox1.get('y1', 0)) / 2.0
    cx2 = (bbox2.get('x0', 0) + bbox2.get('x1', 0)) / 2.0
    cy2 = (bbox2.get('y0', 0) + bbox2.get('y1', 0)) / 2.0
    
    return math.sqrt((cx1 - cx2)**2 + (cy1 - cy2)**2)


def calculate_text_similarity(text1: str, text2: str) -> float:
    """
    Calculate text similarity score using normalized edit distance.
    
    Returns:
        Similarity score between 0.0 (completely different) and 1.0 (identical)
    """
    if not text1 or not text2:
        return 0.0
    
    # Normalize: strip, lowercase, remove spaces
    t1 = text1.strip().lower().replace(' ', '')
    t2 = text2.strip().lower().replace(' ', '')
    
    if t1 == t2:
        return 1.0
    
    # Simple character set overlap
    set1 = set(t1)
    set2 = set(t2)
    
    if not set1 or not set2:
        return 0.0
    
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    
    return intersection / union if union > 0 else 0.0


def are_candidates_duplicate(
    cand1: Dict[str, Any], 
    cand2: Dict[str, Any],
    iou_threshold: float = 0.5,
    distance_threshold: float = 0.02,
    text_sim_threshold: float = 0.6
) -> Tuple[bool, float, str]:
    """
    Determine if two dimension candidates represent the same physical annotation.
    
    Matching Strategy:
    - Strong match: High IoU (>0.5) OR close centers + similar text
    - Weak match: Moderate IoU (>0.3) + text similarity
    - No match: Different locations and text
    
    Args:
        cand1, cand2: Dimension candidates with bbox, normX, normY, rawText, nominalValue
        iou_threshold: IoU threshold for spatial matching (default 0.5)
        distance_threshold: Center distance threshold (default 0.02 = 2% of page)
        text_sim_threshold: Text similarity threshold (default 0.6)
    
    Returns:
        Tuple of (is_duplicate: bool, confidence: float, reason: str)
    """
    # Extract bounding boxes
    bbox1 = cand1.get('bbox', {
        'x0': cand1.get('normX', 0) - 0.01,
        'y0': cand1.get('normY', 0) - 0.01,
        'x1': cand1.get('normX', 0) + 0.01,
        'y1': cand1.get('normY', 0) + 0.01
    })
    bbox2 = cand2.get('bbox', {
        'x0': cand2.get('normX', 0) - 0.01,
        'y0': cand2.get('normY', 0) - 0.01,
        'x1': cand2.get('normX', 0) + 0.01,
        'y1': cand2.get('normY', 0) + 0.01
    })
    
    # Calculate spatial metrics
    iou = calculate_iou(bbox1, bbox2)
    center_dist = calculate_center_distance(bbox1, bbox2)
    
    # Calculate text similarity
    text1 = cand1.get('rawText', '')
    text2 = cand2.get('rawText', '')
    text_sim = calculate_text_similarity(text1, text2)
    
    # Calculate nominal value similarity (if both present)
    nom1 = cand1.get('nominalValue')
    nom2 = cand2.get('nominalValue')
    nominal_match = False
    if nom1 is not None and nom2 is not None:
        # Consider match if within 0.1% or 0.001 absolute difference
        diff = abs(nom1 - nom2)
        tolerance = max(0.001, abs(nom1) * 0.001)
        nominal_match = diff < tolerance
    
    # Decision logic with multiple signals
    
    # RULE 1: High IoU = strong spatial overlap
    if iou > iou_threshold:
        if text_sim > 0.4 or nominal_match:
            return (True, 0.95, f"high_iou_{iou:.2f}_text_{text_sim:.2f}")
        elif iou > 0.7:  # Very high overlap, even if text differs (OCR errors)
            return (True, 0.85, f"very_high_iou_{iou:.2f}")
    
    # RULE 2: Close centers + similar text
    if center_dist < distance_threshold:
        if text_sim > text_sim_threshold or nominal_match:
            return (True, 0.90, f"close_centers_{center_dist:.3f}_text_{text_sim:.2f}")
    
    # RULE 3: Moderate IoU + text similarity (catch OCR variations)
    if iou > 0.3 and text_sim > 0.7:
        return (True, 0.80, f"moderate_iou_{iou:.2f}_good_text_{text_sim:.2f}")
    
    # RULE 4: Same nominal value + close proximity
    if nominal_match and center_dist < 0.04:
        return (True, 0.75, f"same_nominal_{nom1}_close_{center_dist:.3f}")
    
    # NOT a duplicate
    return (False, 0.0, f"no_match_iou_{iou:.2f}_dist_{center_dist:.3f}_text_{text_sim:.2f}")


def merge_candidates(
    vector_cand: Dict[str, Any], 
    ocr_cand: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Merge a matched vector and OCR candidate into a single fused result.
    
    Strategy:
    - Prefer vector text if available (more reliable)
    - Prefer vector coordinates (more precise)
    - Prefer vector tolerances if present
    - Keep OCR as fallback
    - Preserve both confidence scores
    - Mark as FUSED for tracking
    
    Args:
        vector_cand: Candidate from vector extraction
        ocr_cand: Candidate from OCR extraction
    
    Returns:
        Merged candidate dictionary
    """
    # Start with vector as base (generally more reliable)
    merged = vector_cand.copy()
    
    # Prefer vector text, but use OCR if vector is empty
    if not merged.get('rawText') and ocr_cand.get('rawText'):
        merged['rawText'] = ocr_cand['rawText']
    
    # Prefer vector tolerances, but use OCR if vector has none
    if merged.get('upperTolerance', 0) == 0 and merged.get('lowerTolerance', 0) == 0:
        if ocr_cand.get('upperTolerance', 0) != 0 or ocr_cand.get('lowerTolerance', 0) != 0:
            merged['upperTolerance'] = ocr_cand.get('upperTolerance', 0)
            merged['lowerTolerance'] = ocr_cand.get('lowerTolerance', 0)
    
    # If nominal values differ slightly, prefer vector
    vector_nom = vector_cand.get('nominalValue')
    ocr_nom = ocr_cand.get('nominalValue')
    if vector_nom is None and ocr_nom is not None:
        merged['nominalValue'] = ocr_nom
    
    # Blend confidence scores (weighted toward vector)
    vector_conf = vector_cand.get('confidence', 0.7)
    ocr_conf = ocr_cand.get('confidence', 0.7)
    merged['confidence'] = 0.7 * vector_conf + 0.3 * ocr_conf
    
    # Track fusion provenance
    merged['extractionMode'] = 'FUSED_VECTOR_OCR'
    merged['fusionDetails'] = {
        'vectorConfidence': vector_conf,
        'ocrConfidence': ocr_conf,
        'vectorText': vector_cand.get('rawText', ''),
        'ocrText': ocr_cand.get('rawText', ''),
        'method': 'spatial_text_matching'
    }
    
    return merged


def fuse_vector_and_ocr_candidates(
    vector_candidates: List[Dict[str, Any]],
    ocr_candidates: List[Dict[str, Any]],
    iou_threshold: float = 0.5,
    distance_threshold: float = 0.02,
    text_sim_threshold: float = 0.6,
    verbose: bool = False
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Main fusion function: Merge vector and OCR candidates, removing duplicates.
    
    Algorithm:
    1. Create bipartite matching between vector and OCR candidates
    2. Use spatial overlap (IoU), center distance, text similarity, and nominal value matching
    3. Merge matched pairs, keeping unmatched candidates from both sources
    4. Return deduplicated list with fusion statistics
    
    Args:
        vector_candidates: List of candidates from vector extraction
        ocr_candidates: List of candidates from OCR extraction
        iou_threshold: IoU threshold for spatial matching
        distance_threshold: Center distance threshold
        text_sim_threshold: Text similarity threshold
        verbose: Print fusion diagnostics
    
    Returns:
        Tuple of (fused_candidates: List, fusion_stats: Dict)
    """
    if verbose:
        print(f"\n{'='*80}")
        print(f"FUSION: Starting with {len(vector_candidates)} vector + {len(ocr_candidates)} OCR candidates")
        print(f"{'='*80}\n")
    
    # Track which candidates have been matched
    matched_vector_indices = set()
    matched_ocr_indices = set()
    
    fused_results = []
    fusion_stats = {
        'input_vector': len(vector_candidates),
        'input_ocr': len(ocr_candidates),
        'matched_pairs': 0,
        'unmatched_vector': 0,
        'unmatched_ocr': 0,
        'output_total': 0,
        'duplicate_matches': []
    }
    
    # Step 1: Find matches between vector and OCR candidates
    for v_idx, v_cand in enumerate(vector_candidates):
        best_match_idx = None
        best_match_confidence = 0.0
        best_match_reason = ""
        
        # Compare this vector candidate against all OCR candidates
        for o_idx, o_cand in enumerate(ocr_candidates):
            if o_idx in matched_ocr_indices:
                continue  # Already matched
            
            is_dup, confidence, reason = are_candidates_duplicate(
                v_cand, o_cand,
                iou_threshold=iou_threshold,
                distance_threshold=distance_threshold,
                text_sim_threshold=text_sim_threshold
            )
            
            if is_dup and confidence > best_match_confidence:
                best_match_idx = o_idx
                best_match_confidence = confidence
                best_match_reason = reason
        
        # If found a match, merge them
        if best_match_idx is not None:
            o_cand = ocr_candidates[best_match_idx]
            merged = merge_candidates(v_cand, o_cand)
            fused_results.append(merged)
            
            matched_vector_indices.add(v_idx)
            matched_ocr_indices.add(best_match_idx)
            fusion_stats['matched_pairs'] += 1
            
            if verbose:
                print(f"MATCH #{fusion_stats['matched_pairs']}: "
                      f"Vector '{v_cand.get('rawText', '')}' @ ({v_cand.get('normX', 0):.3f}, {v_cand.get('normY', 0):.3f}) "
                      f"<-> OCR '{o_cand.get('rawText', '')}' @ ({o_cand.get('normX', 0):.3f}, {o_cand.get('normY', 0):.3f})")
                print(f"       Confidence: {best_match_confidence:.2f}, Reason: {best_match_reason}")
            
            fusion_stats['duplicate_matches'].append({
                'vectorText': v_cand.get('rawText', ''),
                'ocrText': o_cand.get('rawText', ''),
                'confidence': best_match_confidence,
                'reason': best_match_reason
            })
    
    # Step 2: Add unmatched vector candidates (unique to vector)
    for v_idx, v_cand in enumerate(vector_candidates):
        if v_idx not in matched_vector_indices:
            fused_results.append(v_cand)
            fusion_stats['unmatched_vector'] += 1
            
            if verbose:
                print(f"UNIQUE VECTOR: '{v_cand.get('rawText', '')}' @ "
                      f"({v_cand.get('normX', 0):.3f}, {v_cand.get('normY', 0):.3f})")
    
    # Step 3: Add unmatched OCR candidates (unique to OCR)
    for o_idx, o_cand in enumerate(ocr_candidates):
        if o_idx not in matched_ocr_indices:
            fused_results.append(o_cand)
            fusion_stats['unmatched_ocr'] += 1
            
            if verbose:
                print(f"UNIQUE OCR: '{o_cand.get('rawText', '')}' @ "
                      f"({o_cand.get('normX', 0):.3f}, {o_cand.get('normY', 0):.3f})")
    
    fusion_stats['output_total'] = len(fused_results)
    
    if verbose:
        print(f"\n{'='*80}")
        print(f"FUSION COMPLETE:")
        print(f"  Input: {fusion_stats['input_vector']} vector + {fusion_stats['input_ocr']} OCR = "
              f"{fusion_stats['input_vector'] + fusion_stats['input_ocr']} total")
        print(f"  Matched pairs (merged): {fusion_stats['matched_pairs']}")
        print(f"  Unique vector: {fusion_stats['unmatched_vector']}")
        print(f"  Unique OCR: {fusion_stats['unmatched_ocr']}")
        print(f"  Output: {fusion_stats['output_total']} unique dimensions")
        
        reduction = fusion_stats['input_vector'] + fusion_stats['input_ocr'] - fusion_stats['output_total']
        if reduction > 0:
            print(f"  ✓ Eliminated {reduction} duplicates ({reduction/(fusion_stats['input_vector'] + fusion_stats['input_ocr'])*100:.1f}%)")
        print(f"{'='*80}\n")
    
    return fused_results, fusion_stats


def deduplicate_within_source(
    candidates: List[Dict[str, Any]],
    source_name: str = "candidates",
    distance_threshold: float = 0.015,
    verbose: bool = False
) -> List[Dict[str, Any]]:
    """
    Remove duplicates within a single source (vector-only or OCR-only).
    
    This catches cases where the same dimension is extracted multiple times
    from the same source due to text fragmentation or overlapping regions.
    
    Args:
        candidates: List of dimension candidates
        source_name: Name for logging
        distance_threshold: Spatial proximity threshold (default 0.015 = 1.5% of page)
        verbose: Print deduplication diagnostics
    
    Returns:
        Deduplicated list of candidates
    """
    if len(candidates) <= 1:
        return candidates
    
    # Sort by position for efficient spatial search
    sorted_candidates = sorted(candidates, key=lambda c: (c.get('normY', 0), c.get('normX', 0)))
    
    keep = []
    skip_indices = set()
    
    for i, cand1 in enumerate(sorted_candidates):
        if i in skip_indices:
            continue
        
        # Check against nearby candidates
        for j in range(i + 1, len(sorted_candidates)):
            if j in skip_indices:
                continue
            
            cand2 = sorted_candidates[j]
            
            # Quick y-distance check (if too far vertically, no point checking)
            y_dist = abs(cand1.get('normY', 0) - cand2.get('normY', 0))
            if y_dist > distance_threshold * 2:
                break  # Sorted by Y, so all remaining are too far
            
            # Check if duplicate
            is_dup, confidence, reason = are_candidates_duplicate(
                cand1, cand2,
                iou_threshold=0.4,  # Slightly lower for same-source dedup
                distance_threshold=distance_threshold,
                text_sim_threshold=0.7
            )
            
            if is_dup:
                # Keep the one with higher confidence
                conf1 = cand1.get('confidence', 0.7)
                conf2 = cand2.get('confidence', 0.7)
                
                if conf1 >= conf2:
                    skip_indices.add(j)
                    if verbose:
                        print(f"  {source_name} DEDUP: Removing '{cand2.get('rawText', '')}' "
                              f"(duplicate of '{cand1.get('rawText', '')}') - {reason}")
                else:
                    skip_indices.add(i)
                    if verbose:
                        print(f"  {source_name} DEDUP: Removing '{cand1.get('rawText', '')}' "
                              f"(duplicate of '{cand2.get('rawText', '')}') - {reason}")
                    break  # Skip to next i
        
        if i not in skip_indices:
            keep.append(cand1)
    
    if verbose and len(skip_indices) > 0:
        print(f"  {source_name}: Removed {len(skip_indices)} internal duplicates "
              f"({len(candidates)} → {len(keep)})")
    
    return keep
