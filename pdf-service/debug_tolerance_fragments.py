"""
Debug script to analyze tolerance fragment issue in PDF extraction.

Problem: 0.15 and 0.2 are detected as independent dimensions
Expected: They should be part of 27.5 ±0.15 and 37.5 ±0.2
"""

import sys
sys.path.insert(0, 'app')

import fitz
from services.pdf_extractor import extract_all_dimensions_from_page

pdf_path = r'd:\DimBalooning\backend\uploads\1793176065717-54491294-GP3.010.81.0.PR-GEAR COVER.pdf'

print("="*80)
print("TOLERANCE FRAGMENT DEBUG ANALYSIS")
print("="*80)

# Step 1: Examine raw PDF text spans around the problem area
doc = fitz.open(pdf_path)
page = doc[0]
width = page.rect.width
height = page.rect.height

print(f"\nPDF Page Dimensions: {width} x {height}")

# Get all words with positions
words = page.get_text("words")

# Find the problem dimensions: 27.5, 0.15, 37.5, 0.2
target_values = ['27.5', '0.15', '37.5', '0.2', '±0.15', '±0.2']
problem_words = []

for w in words:
    text = w[4].strip()
    if text in target_values or '27.5' in text or '37.5' in text:
        cx = (w[0] + w[2]) / 2.0
        cy = (w[1] + w[3]) / 2.0
        norm_x = cx / width
        norm_y = cy / height
        problem_words.append({
            'text': text,
            'x0': w[0], 'y0': w[1], 'x1': w[2], 'y1': w[3],
            'cx': cx, 'cy': cy,
            'norm_x': norm_x, 'norm_y': norm_y,
            'block': w[5], 'line': w[6]
        })

print(f"\n{'='*80}")
print(f"RAW PDF TEXT SPANS (Target Region)")
print(f"{'='*80}\n")

# Sort by position
problem_words.sort(key=lambda w: (w['norm_y'], w['norm_x']))

for i, w in enumerate(problem_words):
    print(f"{i+1}. Text: '{w['text']}'")
    print(f"   Position: ({w['cx']:.1f}, {w['cy']:.1f}) = normalized ({w['norm_x']:.4f}, {w['norm_y']:.4f})")
    print(f"   BBox: ({w['x0']:.1f}, {w['y0']:.1f}) to ({w['x1']:.1f}, {w['y1']:.1f})")
    print(f"   Block/Line: {w['block']}/{w['line']}")
    print()

# Step 2: Check spatial relationships
print(f"{'='*80}")
print(f"SPATIAL ANALYSIS")
print(f"{'='*80}\n")

# Find 27.5 and nearby 0.15
word_27_5 = [w for w in problem_words if w['text'] == '27.5']
word_0_15 = [w for w in problem_words if w['text'] in ['0.15', '±0.15']]

if word_27_5 and word_0_15:
    w1 = word_27_5[0]
    print(f"27.5 found at ({w1['norm_x']:.4f}, {w1['norm_y']:.4f})")
    
    for w2 in word_0_15:
        dx = abs(w1['cx'] - w2['cx'])
        dy = abs(w1['cy'] - w2['cy'])
        dist = (dx**2 + dy**2)**0.5
        
        print(f"  Distance to '{w2['text']}': dx={dx:.1f}pt, dy={dy:.1f}pt, dist={dist:.1f}pt")
        print(f"    Same line? {w1['line'] == w2['line']}")
        print(f"    Vertically stacked? dx<35 and 0<dy<30: {dx<35 and 0<dy<30}")
        print(f"    Horizontally adjacent? dy<10 and 5<dx<30: {dy<10 and 5<dx<30}")

print()

# Find 37.5 and nearby 0.2
word_37_5 = [w for w in problem_words if w['text'] == '37.5']
word_0_2 = [w for w in problem_words if w['text'] in ['0.2', '±0.2']]

if word_37_5 and word_0_2:
    w1 = word_37_5[0]
    print(f"37.5 found at ({w1['norm_x']:.4f}, {w1['norm_y']:.4f})")
    
    for w2 in word_0_2:
        dx = abs(w1['cx'] - w2['cx'])
        dy = abs(w1['cy'] - w2['cy'])
        dist = (dx**2 + dy**2)**0.5
        
        print(f"  Distance to '{w2['text']}': dx={dx:.1f}pt, dy={dy:.1f}pt, dist={dist:.1f}pt")
        print(f"    Same line? {w1['line'] == w2['line']}")
        print(f"    Vertically stacked? dx<35 and 0<dy<30: {dx<35 and 0<dy<30}")
        print(f"    Horizontally adjacent? dy<10 and 5<dx<30: {dy<10 and 5<dx<30}")

print()

# Step 3: Current extraction results
print(f"{'='*80}")
print(f"CURRENT EXTRACTION RESULTS")
print(f"{'='*80}\n")

result = extract_all_dimensions_from_page(pdf_path, 1)

if result.get('success'):
    items = result.get('items', [])
    
    # Find items in the problem region (y between 0.11 and 0.15, x < 0.1)
    problem_region = [
        item for item in items
        if 0.06 < item.get('normX', 0) < 0.09 and 0.11 < item.get('normY', 0) < 0.15
    ]
    
    print(f"Dimensions detected in problem region: {len(problem_region)}")
    print()
    
    for i, item in enumerate(problem_region, 1):
        text = item.get('rawText', '')
        nom = item.get('nominalValue', 0)
        upper = item.get('upperTolerance', 0)
        lower = item.get('lowerTolerance', 0)
        mode = item.get('extractionMode', 'UNKNOWN')
        
        print(f"Balloon {i}: '{text}'")
        print(f"  Position: ({item.get('normX', 0):.4f}, {item.get('normY', 0):.4f})")
        print(f"  Nominal: {nom}, Upper: +{upper}, Lower: {lower}")
        print(f"  Mode: {mode}")
        print()
    
    # Check if standalone 0.15 and 0.2 were detected
    standalone_0_15 = [item for item in items if item.get('rawText', '') == '0.15' and item.get('nominalValue', 0) == 0.15]
    standalone_0_2 = [item for item in items if item.get('rawText', '') == '0.2' and item.get('nominalValue', 0) == 0.2]
    
    print(f"{'='*80}")
    print(f"PROBLEM DETECTION")
    print(f"{'='*80}\n")
    
    if standalone_0_15:
        print(f"❌ PROBLEM: Standalone '0.15' detected as independent dimension")
        for item in standalone_0_15:
            print(f"   Position: ({item.get('normX', 0):.4f}, {item.get('normY', 0):.4f})")
    
    if standalone_0_2:
        print(f"❌ PROBLEM: Standalone '0.2' detected as independent dimension")
        for item in standalone_0_2:
            print(f"   Position: ({item.get('normX', 0):.4f}, {item.get('normY', 0):.4f})")
    
    # Check if merged versions exist
    merged_27_5 = [item for item in items if '27.5' in item.get('rawText', '') and abs(item.get('nominalValue', 0) - 27.5) < 0.1]
    merged_37_5 = [item for item in items if '37.5' in item.get('rawText', '') and abs(item.get('nominalValue', 0) - 37.5) < 0.1]
    
    print()
    if merged_27_5:
        item = merged_27_5[0]
        if item.get('upperTolerance', 0) != 0:
            print(f"✓ GOOD: '27.5 ±0.15' detected as complete dimension")
        else:
            print(f"⚠️  WARNING: '27.5' found but without tolerance")
    
    if merged_37_5:
        item = merged_37_5[0]
        if item.get('upperTolerance', 0) != 0:
            print(f"✓ GOOD: '37.5 ±0.2' detected as complete dimension")
        else:
            print(f"⚠️  WARNING: '37.5' found but without tolerance")

print()
print(f"{'='*80}")
print(f"ANALYSIS COMPLETE")
print(f"{'='*80}")

doc.close()
