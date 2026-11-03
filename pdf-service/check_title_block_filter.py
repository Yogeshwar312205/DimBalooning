"""
Check if 154 is being filtered by title block detection
"""
import sys
sys.path.append('app')

import fitz
from services.pdf_extractor import detect_title_block_region, detect_drawing_boundary, is_in_title_block

pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
doc = fitz.open(pdf_path)
page = doc[0]
width, height = page.rect.width, page.rect.height

print('=== TITLE BLOCK FILTER CHECK FOR 154 ===\n')
print(f'Page size: {width:.1f} x {height:.1f} pts\n')

# Detect title block
title_block = detect_title_block_region(page, width, height)
print('Title block region:')
print(f'  x: {title_block["x0"]:.4f} to {title_block["x1"]:.4f}')
print(f'  y: {title_block["y0"]:.4f} to {title_block["y1"]:.4f}')
print(f'  Confidence: {title_block["confidence"]:.2f}')
print()

# Detect drawing boundary
drawing_boundary = detect_drawing_boundary(page, width, height)
print('Drawing boundary:')
print(f'  x: {drawing_boundary["x0"]:.4f} to {drawing_boundary["x1"]:.4f}')
print(f'  y: {drawing_boundary["y0"]:.4f} to {drawing_boundary["y1"]:.4f}')
print(f'  Type: {drawing_boundary["type"]}')
print()

# Find 154
text_dict = page.get_text('dict')
for block in text_dict['blocks']:
    if 'lines' in block:
        for line in block['lines']:
            for span in line['spans']:
                if '154' == span['text'].strip():
                    bbox = span['bbox']
                    norm_x = (bbox[0] + bbox[2]) / 2 / width
                    norm_y = (bbox[1] + bbox[3]) / 2 / height
                    
                    print(f'154 Position: ({norm_x:.4f}, {norm_y:.4f})')
                    print()
                    
                    # Check title block
                    if is_in_title_block(norm_x, norm_y, title_block):
                        print('❌ FILTERED: 154 IS in title block region')
                        print(f'   Title block y range: {title_block["y0"]:.4f} to {title_block["y1"]:.4f}')
                        print(f'   154 y position: {norm_y:.4f}')
                    else:
                        print('✓ PASSES: 154 is NOT in title block')
                    
                    print()
                    
                    # Check drawing boundary
                    if drawing_boundary['y0'] <= norm_y <= drawing_boundary['y1'] and drawing_boundary['x0'] <= norm_x <= drawing_boundary['x1']:
                        print('✓ PASSES: 154 is within drawing boundary')
                    else:
                        print('❌ FILTERED: 154 is OUTSIDE drawing boundary')
                        print(f'   Drawing boundary y range: {drawing_boundary["y0"]:.4f} to {drawing_boundary["y1"]:.4f}')
                        print(f'   154 y position: {norm_y:.4f}')
                    
                    print()
                    
                    # Get nearby text to understand context
                    print('Nearby text (closest 10):')
                    cx = (bbox[0] + bbox[2])/2
                    cy = (bbox[1] + bbox[3])/2
                    
                    nearby = []
                    for b in text_dict['blocks']:
                        if 'lines' in b:
                            for l in b['lines']:
                                for s in l['spans']:
                                    sx = (s['bbox'][0] + s['bbox'][2])/2
                                    sy = (s['bbox'][1] + s['bbox'][3])/2
                                    dist = ((sx-cx)**2 + (sy-cy)**2)**0.5
                                    if 0 < dist < 100:
                                        snorm_x = sx / width
                                        snorm_y = sy / height
                                        in_title = is_in_title_block(snorm_x, snorm_y, title_block)
                                        nearby.append({
                                            'text': s['text'].strip(),
                                            'dist': dist,
                                            'in_title': in_title
                                        })
                    
                    nearby.sort(key=lambda x: x['dist'])
                    for i, item in enumerate(nearby[:10]):
                        tb_marker = ' [IN TITLE BLOCK]' if item['in_title'] else ''
                        print(f'  {i+1}. {item["text"]:20s} @ dist={item["dist"]:.1f}{tb_marker}')

doc.close()
