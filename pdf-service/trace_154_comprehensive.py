import fitz
import json

pdf_path = r'd:\DimBalooning\backend\uploads\1787685065439-107797995-Random_Component.pdf'
doc = fitz.open(pdf_path)
page = doc[0]

print('=== COMPREHENSIVE 154 TRACE ===\n')

# Method 1: Check with dict first
print('METHOD 1: dict extraction (standard)')
found_in_dict = False
text_dict = page.get_text('dict')
for block in text_dict['blocks']:
    if 'lines' in block:
        for line in block['lines']:
            for span in line['spans']:
                text = span['text'].strip()
                if '154' in text or ('1' in text and len(text) <= 3):
                    found_in_dict = True
                    bbox = span['bbox']
                    bbox_str = f"({bbox[0]:.1f}, {bbox[1]:.1f}, {bbox[2]:.1f}, {bbox[3]:.1f})"
                    print(f'  Found: {repr(text)} @ {bbox_str}')

if not found_in_dict:
    print('  ❌ 154 NOT found in dict')

# Method 2: Check with text option
print('\nMETHOD 2: plain text extraction')
plain_text = page.get_text('text')
if '154' in plain_text:
    print('  ✓ 154 found in plain text')
    idx = plain_text.find('154')
    context = plain_text[max(0,idx-30):idx+30]
    print(f'  Context: {repr(context)}')
else:
    print('  ❌ 154 NOT in plain text')

# Method 3: Search for all 3-digit numbers
print('\nMETHOD 3: All 3-digit numbers in PDF')
three_digit_nums = []
for block in text_dict['blocks']:
    if 'lines' in block:
        for line in block['lines']:
            for span in line['spans']:
                text = span['text'].strip()
                if text.isdigit() and len(text) == 3:
                    three_digit_nums.append({
                        'text': text,
                        'bbox': span['bbox'],
                        'size': span['size']
                    })

print(f'  Found {len(three_digit_nums)} three-digit numbers:')
for item in three_digit_nums:
    bbox = item['bbox']
    print(f'    {item["text"]} @ ({bbox[0]:.1f}, {bbox[1]:.1f}) size={item["size"]:.1f}')

# Method 4: Check for text in specific regions near where 154 should be
print('\nMETHOD 4: Region-based search near 20.5 and 18')
positions_of_interest = []
for block in text_dict['blocks']:
    if 'lines' in block:
        for line in block['lines']:
            for span in line['spans']:
                if '20.5' in span['text'] or span['text'].strip() == '18':
                    positions_of_interest.append({
                        'text': span['text'],
                        'bbox': span['bbox']
                    })
                    bbox = span['bbox']
                    print(f'  Reference: {repr(span["text"])} @ ({bbox[0]:.1f}, {bbox[1]:.1f})')

# Search nearby regions
if positions_of_interest:
    print('\n  Looking for numeric text near these positions...')
    for ref in positions_of_interest:
        ref_bbox = ref['bbox']
        ref_x, ref_y = (ref_bbox[0] + ref_bbox[2])/2, (ref_bbox[1] + ref_bbox[3])/2
        
        nearby_nums = []
        for block in text_dict['blocks']:
            if 'lines' in block:
                for line in block['lines']:
                    for span in line['spans']:
                        sx, sy = (span['bbox'][0] + span['bbox'][2])/2, (span['bbox'][1] + span['bbox'][3])/2
                        dist = ((sx-ref_x)**2 + (sy-ref_y)**2)**0.5
                        text = span['text'].strip()
                        if dist < 100 and text and (text.isdigit() or text.replace('.','').isdigit()):
                            nearby_nums.append({
                                'text': text,
                                'dist': dist,
                                'bbox': span['bbox']
                            })
        
        if nearby_nums:
            nearby_nums.sort(key=lambda x: x['dist'])
            print(f'\n  Near {repr(ref["text"])}:')
            for item in nearby_nums[:10]:  # Top 10 closest
                bbox = item['bbox']
                print(f'    {repr(item["text"])} @ dist={item["dist"]:.1f} pos=({bbox[0]:.1f}, {bbox[1]:.1f})')

# Method 5: Check if 154 exists vertically (character by character)
print('\nMETHOD 5: Checking for vertical text patterns')
for block in text_dict['blocks']:
    if 'lines' in block:
        for line in block['lines']:
            # Collect all spans in this line
            spans = line['spans']
            if len(spans) >= 3:
                # Check if consecutive single-char spans form "154"
                for i in range(len(spans) - 2):
                    s1, s2, s3 = spans[i], spans[i+1], spans[i+2]
                    if s1['text'] == '1' and s2['text'] == '5' and s3['text'] == '4':
                        print('  ✓ FOUND 154 as separate characters!')
                        print(f'    Span 1: "1" @ {s1["bbox"]}')
                        print(f'    Span 2: "5" @ {s2["bbox"]}')
                        print(f'    Span 3: "4" @ {s3["bbox"]}')

# Method 6: Check XObject forms and annotations
print('\nMETHOD 6: Checking XObject forms and annotations')
xobjects = page.get_images()
print(f'  XObject images: {len(xobjects)}')

annots = page.annots()
annot_count = 0
if annots:
    for annot in annots:
        annot_count += 1
print(f'  Annotations: {annot_count}')

doc.close()

print('\n=== TRACE COMPLETE ===')
