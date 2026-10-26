#!/usr/bin/env python3
"""Diagnostic script for dimension detection regression."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pdf-service'))

from app.services.pdf_extractor import extract_all_dimensions_from_page
import json

pdf_path = 'backend/uploads/1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

print("="*80)
print("DIMENSION DETECTION DIAGNOSTIC")
print("="*80)
print(f"PDF: {pdf_path}")
print()

result = extract_all_dimensions_from_page(pdf_path, 1)

print(f"SUCCESS: {result['success']}")
print(f"COUNT: {result['count']}")
print()

if result['success'] and result['items']:
    print("FIRST 20 DETECTIONS:")
    print("-"*80)
    for i, item in enumerate(result['items'][:20]):
        raw_text = item.get('rawText', '???')
        conf = item.get('confidence', 0.0)
        dim_type = item.get('dimensionType', 'LINEAR')
        nom = item.get('nominalValue', 0.0)
        pos = f"({item['normX']:.3f}, {item['normY']:.3f})"
        
        print(f"{i+1:3}. {raw_text:25} | Conf: {conf:.2f} | Type: {dim_type:10} | Nom: {nom:7.2f} | Pos: {pos}")
    
    if len(result['items']) > 20:
        print(f"... and {len(result['items']) - 20} more")
    
    print()
    print("STATISTICS:")
    print("-"*80)
    
    # Count by confidence
    high = sum(1 for item in result['items'] if item.get('confidence', 0) >= 0.85)
    med = sum(1 for item in result['items'] if 0.6 <= item.get('confidence', 0) < 0.85)
    low = sum(1 for item in result['items'] if item.get('confidence', 0) < 0.6)
    
    print(f"High confidence (>=0.85): {high}")
    print(f"Medium confidence (0.6-0.85): {med}")
    print(f"Low confidence (<0.6): {low}")
    print()
    
    # Count by type
    types = {}
    for item in result['items']:
        dt = item.get('dimensionType', 'LINEAR')
        types[dt] = types.get(dt, 0) + 1
    
    print("By Type:")
    for dtype, count in sorted(types.items()):
        print(f"  {dtype:15}: {count}")
    
    print()
    print("CHECKING FOR COMPOUND DIMENSIONS:")
    print("-"*80)
    compounds = [item for item in result['items'] if 'X' in item.get('rawText', '').upper() or 'DEEP' in item.get('rawText', '').upper()]
    if compounds:
        for item in compounds[:10]:
            print(f"  {item.get('rawText', '???')}")
    else:
        print("  None found with 'X' or 'DEEP'")
    
    print()
    print("CHECKING FOR SIMPLE NUMBERS (potential false positives or valid):")
    print("-"*80)
    simple = [item for item in result['items'] if item.get('nominalValue', 0) < 20 and item.get('nominalValue', 0).is_integer()]
    if simple[:10]:
        for item in simple[:10]:
            print(f"  {item.get('rawText', '???'):15} | Conf: {item.get('confidence', 0):.2f} | Pos: ({item['normX']:.3f}, {item['normY']:.3f})")
else:
    print("No items detected or extraction failed")
    if 'error' in result:
        print(f"Error: {result['error']}")

print()
print("="*80)
