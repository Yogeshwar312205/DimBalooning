#!/usr/bin/env python3
"""Analyze confidence distribution and identify what needs boosting."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pdf-service'))

from app.services.pdf_extractor import extract_all_dimensions_from_page

pdf_path = 'backend/uploads/1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
result = extract_all_dimensions_from_page(pdf_path, 1)

print("CONFIDENCE ANALYSIS")
print("="*80)

# Group by confidence level
by_confidence = {}
for item in result['items']:
    conf = item.get('confidence', 0.7)
    if conf not in by_confidence:
        by_confidence[conf] = []
    by_confidence[conf].append(item)

for conf in sorted(by_confidence.keys(), reverse=True):
    items = by_confidence[conf]
    print(f"\nConfidence {conf:.2f}: {len(items)} items")
    print("-"*80)
    for item in items[:15]:  # Show first 15
        print(f"  {item.get('rawText', '???'):30} | Type: {item.get('dimensionType', '?'):10}")
    if len(items) > 15:
        print(f"  ... and {len(items) - 15} more")

print("\n" + "="*80)
print("WITH BACKEND FILTER (confidence >= 0.55 for >100 items):")
print("="*80)

threshold = 0.55
filtered = [item for item in result['items'] if item.get('confidence', 0.7) >= threshold]
print(f"Would pass: {len(filtered)} / {len(result['items'])}")
print(f"Would be filtered: {len(result['items']) - len(filtered)}")

