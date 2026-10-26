#!/usr/bin/env python3
"""
Test the full dimension detection pipeline including backend filtering.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pdf-service'))

from app.services.pdf_extractor import extract_all_dimensions_from_page

pdf_path = 'backend/uploads/1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

print("="*80)
print("FULL PIPELINE TEST - GEAR COVER PDF")
print("="*80)
print()

# Step 1: PDF Extraction
print("STEP 1: PDF Extraction (Python Service)")
print("-"*80)
result = extract_all_dimensions_from_page(pdf_path, 1)

if not result['success']:
    print(f"✗ Extraction FAILED: {result.get('error')}")
    sys.exit(1)

print(f"✓ Extraction SUCCESS")
print(f"  Total detections: {result['count']}")
print()

# Step 2: Simulate Backend Filtering
print("STEP 2: Backend Filtering Simulation")
print("-"*80)

items = result['items']
total_count = len(items)

# Simulate the backend logic
if total_count > 150:
    threshold = 0.65
    filter_reason = f"Very dense (>{total_count} items)"
elif total_count > 100:
    threshold = 0.55
    filter_reason = f"Dense ({total_count} items)"
else:
    threshold = 0.0  # No filtering
    filter_reason = "Not dense enough to filter"

filtered_items = [item for item in items if item.get('confidence', 0.7) >= threshold]
filtered_count = len(filtered_items)
rejected_count = total_count - filtered_count

print(f"  Filter applied: {filter_reason}")
print(f"  Threshold: {threshold}")
print(f"  ✓ Passed filter: {filtered_count}")
print(f"  ✗ Rejected: {rejected_count}")
print()

# Step 3: Analyze what would be created
print("STEP 3: Balloon Creation Analysis")
print("-"*80)

# Count by confidence
high = sum(1 for item in filtered_items if item.get('confidence', 0) >= 0.85)
med = sum(1 for item in filtered_items if 0.6 <= item.get('confidence', 0) < 0.85)
low = sum(1 for item in filtered_items if item.get('confidence', 0) < 0.6)

print(f"  High confidence (>=0.85): {high}")
print(f"  Medium confidence (0.6-0.85): {med}")
print(f"  Low confidence (<0.6): {low}")
print()

# Count by type
types = {}
for item in filtered_items:
    dt = item.get('dimensionType', 'LINEAR')
    types[dt] = types.get(dt, 0) + 1

print("  By Type:")
for dtype, count in sorted(types.items()):
    print(f"    {dtype:15}: {count}")
print()

# Step 4: Show sample of what would be created
print("STEP 4: Sample Balloons (First 15)")
print("-"*80)
for i, item in enumerate(filtered_items[:15]):
    raw_text = item.get('rawText', '???')
    conf = item.get('confidence', 0.0)
    dim_type = item.get('dimensionType', 'LINEAR')
    nom = item.get('nominalValue', 0.0)
    
    print(f"  Balloon {i+1:2}: {raw_text:25} | Conf: {conf:.2f} | Type: {dim_type:10} | Nom: {nom:7.2f}")
print()

# Step 5: Check for compound dimensions
print("STEP 5: Compound Dimension Check")
print("-"*80)
compounds = [item for item in filtered_items 
             if 'DEEP' in item.get('rawText', '').upper() 
             or 'TAP' in item.get('rawText', '').upper()
             or ('X' in item.get('rawText', '').upper() and item.get('dimensionType') == 'DIAMETER')]

print(f"  Found {len(compounds)} compound dimensions:")
for item in compounds[:10]:
    print(f"    {item.get('rawText', '???'):30} | Conf: {item.get('confidence', 0):.2f}")
print()

# Step 6: Summary
print("="*80)
print("SUMMARY")
print("="*80)
print(f"  ✓ Python extraction: {total_count} dimensions detected")
print(f"  ✓ Backend would create: {filtered_count} balloons")
print(f"  ✓ Rejection rate: {rejected_count}/{total_count} ({100*rejected_count/total_count:.1f}%)")
print()

if filtered_count >= 100:
    status = "✓ EXCELLENT"
elif filtered_count >= 75:
    status = "✓ GOOD"
elif filtered_count >= 50:
    status = "⚠ ACCEPTABLE"
else:
    status = "✗ TOO LOW"

print(f"  Overall Status: {status}")
print(f"  Expected balloons for GEAR COVER: ~100-150 (complex 2-sheet drawing)")
print(f"  Actual result: {filtered_count} balloons")
print()

if filtered_count < 50:
    print("  ✗ REGRESSION DETECTED - Too few dimensions detected")
    sys.exit(1)
else:
    print("  ✓ REGRESSION FIXED - Detection coverage restored")
    sys.exit(0)
