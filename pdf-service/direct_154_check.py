"""
Direct check: Does 154 pass through all filters?
"""
import fitz
import re

pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
doc = fitz.open(pdf_path)
page = doc[0]
width, height = page.rect.width, page.rect.height

print(f'=== DIRECT 154 CHECK ===')
print(f'Page size: {width:.1f} x {height:.1f} pts\n')

text_dict = page.get_text('dict')

# Find 154
for block in text_dict['blocks']:
    if 'lines' in block:
        for line in block['lines']:
            for span in line['spans']:
                if '154' == span['text'].strip():
                    bbox = span['bbox']
                    norm_x = (bbox[0] + bbox[2]) / 2 / width
                    norm_y = (bbox[1] + bbox[3]) / 2 / height
                    
                    print(f'✓ FOUND: {repr(span["text"])}')
                    print(f'  Raw position: ({bbox[0]:.1f}, {bbox[1]:.1f})')
                    print(f'  Normalized: ({norm_x:.4f}, {norm_y:.4f})')
                    print(f'  Font size: {span["size"]:.1f}pt')
                    print()
                    
                    # Filter checks
                    print('FILTER CHECKS:')
                    
                    # 1. Is it a number?
                    text = span['text'].strip()
                    if text.isdigit():
                        print(f'  ✓ Is numeric: {text}')
                        value = int(text)
                        print(f'  ✓ Value: {value}')
                    
                    # 2. Drawing boundary check
                    print(f'\n  Drawing boundary check:')
                    print(f'    Normalized position: x={norm_x:.4f}, y={norm_y:.4f}')
                    
                    # Default conservative margins
                    if norm_x < 0.08:
                        print(f'    ❌ FILTERED: x < 0.08 (left margin)')
                    elif norm_x > 0.92:
                        print(f'    ❌ FILTERED: x > 0.92 (right margin)')
                    elif norm_y < 0.08:
                        print(f'    ❌ FILTERED: y < 0.08 (top margin)')
                    elif norm_y > 0.92:
                        print(f'    ❌ FILTERED: y > 0.92 (bottom margin)')
                    else:
                        print(f'    ✓ PASSES boundary check')
                    
                    # 3. Title block check
                    if norm_y > 0.85:
                        print(f'\n  ⚠ WARNING: y > 0.85 (title block region)')
                    
                    # 4. Value range check
                    if value >= 1000:
                        print(f'\n  ❌ FILTERED: value >= 1000 (sheet metadata filter)')
                    elif value >= 500:
                        print(f'\n  ⚠ WARNING: value >= 500 (unusually large dimension)')
                    else:
                        print(f'\n  ✓ PASSES value range check')
                    
                    # 5. Check against dimension regex
                    print(f'\n  Regex pattern check:')
                    
                    # From parse_dimension_string
                    patterns = [
                        r'^\d+\.?\d*$',  # Plain number
                        r'[\u00D8\u2300\u00F8Ø]\s*[\d\.]+',  # Diameter
                        r'R\s*[\d\.]+',  # Radius
                    ]
                    
                    for i, pattern in enumerate(patterns):
                        if re.search(pattern, text, re.IGNORECASE):
                            print(f'    ✓ Matches pattern {i+1}: {pattern}')
                    
                    # 6. Context check - look for nearby text
                    print(f'\n  Nearby text (within 50pts):')
                    cx, cy = (bbox[0] + bbox[2])/2, (bbox[1] + bbox[3])/2
                    
                    nearby = []
                    for b in text_dict['blocks']:
                        if 'lines' in b:
                            for l in b['lines']:
                                for s in l['spans']:
                                    sx = (s['bbox'][0] + s['bbox'][2])/2
                                    sy = (s['bbox'][1] + s['bbox'][3])/2
                                    dist = ((sx-cx)**2 + (sy-cy)**2)**0.5
                                    if 0 < dist < 50:
                                        nearby.append({
                                            'text': s['text'].strip(),
                                            'dist': dist,
                                            'pos': (sx, sy)
                                        })
                    
                    nearby.sort(key=lambda x: x['dist'])
                    for item in nearby[:5]:
                        print(f'    {item["text"]:20s} @ dist={item["dist"]:.1f}')

doc.close()
