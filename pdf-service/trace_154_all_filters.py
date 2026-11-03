"""
Detailed trace of 154 through ALL filters
"""
import sys
sys.path.append('app')

import fitz
import re
from services.pdf_extractor import (
    parse_dimension_string,
    detect_drawing_boundary,
    detect_title_block_region,
    detect_view_regions,
    is_sheet_border_annotation,
    is_within_drawing_boundary,
    is_in_title_block,
    is_revision_table_text
)

pdf_path = r'd:\DimBalooning\pdf-service\app\services\pdf_extractor.py' 
pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

doc = fitz.open(pdf_path)
page = doc[0]
width = page.rect.width
height = page.rect.height

print('=== DETAILED 154 FILTER TRACE ===\n')
print(f'Page size: {width:.1f} x {height:.1f} pts\n')

# Get regions
drawing_boundary = detect_drawing_boundary(page, width, height)
title_block_region = detect_title_block_region(page, width, height)
view_regions = detect_view_regions(page, width, height)

# Get words
words = page.get_text("words")

print(f'Total words on page: {len(words)}\n')

# Find 154 in words
found_154_word = None
for w in words:
    if w[4].strip() == '154':
        found_154_word = w
        break

if not found_154_word:
    print('❌ ERROR: 154 not found in page.get_text("words")')
    print('   This is the extraction method used by the system!')
    print('\n   Checking if 154 exists in get_text("dict"):')
    
    text_dict = page.get_text('dict')
    for block in text_dict['blocks']:
        if 'lines' in block:
            for line in block['lines']:
                for span in line['spans']:
                    if '154' in span['text']:
                        print(f'   ✓ Found in dict: {repr(span["text"])}')
                        print(f'     Position: {span["bbox"]}')
    
    print('\n   Checking words extraction details:')
    print(f'   Total words extracted: {len(words)}')
    print('   Sample words near position (737, 1380):')
    for w in words:
        cx = (w[0] + w[2]) / 2
        cy = (w[1] + w[3]) / 2
        if 700 < cx < 800 and 1350 < cy < 1410:
            print(f'     {w[4]:20s} @ ({cx:.1f}, {cy:.1f})')
    
    doc.close()
    sys.exit(1)

# Found it!
x0, y0, x1, y1, text, block_no, line_no, word_no = found_154_word
cx = (x0 + x1) / 2
cy = (y0 + y1) / 2
norm_x = round(cx / width, 4)
norm_y = round(cy / height, 4)

print(f'✓ FOUND 154 in words at:')
print(f'  Raw: ({x0:.1f}, {y0:.1f}, {x1:.1f}, {y1:.1f})')
print(f'  Center: ({cx:.1f}, {cy:.1f})')
print(f'  Normalized: ({norm_x:.4f}, {norm_y:.4f})')
print(f'  Block/Line/Word: {block_no}/{line_no}/{word_no}')
print()

# Parse the dimension
parsed = parse_dimension_string('154')
print('PARSE CHECK:')
if parsed and parsed.get("found"):
    print(f'  ✓ PASSES parse_dimension_string')
    print(f'    Nominal: {parsed.get("nominalValue")}')
    print(f'    Upper tol: {parsed.get("upperTolerance")}')
    print(f'    Lower tol: {parsed.get("lowerTolerance")}')
    print(f'    Unit: {parsed.get("unit")}')
    print(f'    Confidence: {parsed.get("confidence")}')
else:
    print(f'  ❌ FAILS parse_dimension_string')
    if parsed:
        print(f'    Result: {parsed}')
    print('  ** THIS IS WHERE IT IS FILTERED OUT **')
    doc.close()
    sys.exit(0)

print()

# Check each filter
print('FILTER CHECKS:\n')

# Filter 1: Out of bounds
print('1. OUT OF BOUNDS CHECK:')
if norm_x < 0.0 or norm_y < 0.0 or norm_x > 1.0 or norm_y > 1.0:
    print('   ❌ FILTERED: Out of bounds')
else:
    print('   ✓ PASSES')

# Filter 2: Legitimate dimension check
print('\n2. LEGITIMATE DIMENSION CHECK:')
clean_line = '154'
is_legitimate_dimension = (
    len(clean_line) > 3 or
    any(char in clean_line for char in ['Ø', '⌀', 'R', 'X', 'x', '+', '-', '±', '.']) or
    parsed.get("confidence", 0) > 0.8 or
    parsed.get("upperTolerance", 0) != 0 or parsed.get("lowerTolerance", 0) != 0
)
print(f'   Length > 3: {len(clean_line) > 3} (len={len(clean_line)})')
print(f'   Has markers: {any(char in clean_line for char in ["Ø", "⌀", "R", "X", "x", "+", "-", "±", "."])}')
print(f'   High confidence: {parsed.get("confidence", 0) > 0.8} (conf={parsed.get("confidence", 0)})')
print(f'   Has tolerances: {parsed.get("upperTolerance", 0) != 0 or parsed.get("lowerTolerance", 0) != 0}')
print(f'   Result: {"LEGITIMATE" if is_legitimate_dimension else "NOT LEGITIMATE"}')

# Filter 2a: Sheet border annotation
print('\n2a. SHEET BORDER ANNOTATION CHECK:')
bbox_width = (x1 - x0) / width
bbox_height = (y1 - y0) / height
if not is_legitimate_dimension:
    if is_sheet_border_annotation(clean_line, norm_x, norm_y, bbox_width, bbox_height):
        print('   ❌ FILTERED: Identified as sheet border annotation')
    else:
        print('   ✓ PASSES: Not a sheet border annotation')
else:
    print('   ✓ SKIPPED: Already marked as legitimate dimension')

# Filter 3: Drawing boundary
print('\n3. DRAWING BOUNDARY CHECK:')
print(f'   Boundary: x=[{drawing_boundary["x0"]:.4f}, {drawing_boundary["x1"]:.4f}], y=[{drawing_boundary["y0"]:.4f}, {drawing_boundary["y1"]:.4f}]')
print(f'   Confidence: {drawing_boundary["confidence"]:.2f}')
if drawing_boundary["confidence"] > 0.6:
    boundary_tolerance = 0.06 if is_legitimate_dimension else 0.03
    print(f'   Tolerance: {boundary_tolerance:.3f}')
    if not is_within_drawing_boundary(norm_x, norm_y, drawing_boundary, tolerance=boundary_tolerance):
        print('   ❌ FILTERED: Outside drawing boundary')
    else:
        print('   ✓ PASSES: Within drawing boundary')
else:
    print('   ✓ SKIPPED: Low confidence boundary detection')

# Filter 4: Title block
print('\n4. TITLE BLOCK CHECK:')
print(f'   Title block: x=[{title_block_region["x0"]:.4f}, {title_block_region["x1"]:.4f}], y=[{title_block_region["y0"]:.4f}, {title_block_region["y1"]:.4f}]')
if is_in_title_block(norm_x, norm_y, title_block_region):
    print('   ❌ FILTERED: Inside title block')
else:
    print('   ✓ PASSES: Not in title block')

# Filter 5: Revision table
print('\n5. REVISION TABLE CHECK:')
if is_revision_table_text(clean_line, norm_x, norm_y):
    print('   ❌ FILTERED: Identified as revision table text')
else:
    print('   ✓ PASSES: Not revision table text')

print('\n\n=== CONCLUSION ===')
print('If all checks above show ✓ PASSES, then 154 should be detected.')
print('If any check shows ❌ FILTERED, that\'s where it\'s being removed.')

doc.close()
