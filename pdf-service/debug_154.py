import fitz
import sys

# Open the PDF that's being tested
pdf_path = r'd:\DimBalooning\backend\uploads\1787685065439-107797995-Random_Component.pdf'
doc = fitz.open(pdf_path)
page = doc[0]

print('=== RAW TEXT EXTRACTION ===')
text_dict = page.get_text('dict')
blocks = text_dict['blocks']

# Search for '154' in all text blocks
found_154 = False
all_texts = []

for block in blocks:
    if 'lines' in block:
        for line in block['lines']:
            for span in line['spans']:
                text = span['text'].strip()
                all_texts.append(text)
                
                if '154' in text:
                    found_154 = True
                    print(f'\nFOUND 154:')
                    print(f'  Text: {repr(text)}')
                    print(f'  Bbox: {span["bbox"]}')
                    print(f'  Size: {span["size"]}')
                    print(f'  Flags: {span["flags"]}')
                    print(f'  Origin: {span["origin"]}')
                    
                    # Check text direction
                    dir_vec = (span['bbox'][2] - span['bbox'][0], span['bbox'][3] - span['bbox'][1])
                    print(f'  Direction vector: {dir_vec}')
                    
                    # Check if rotated
                    width = span['bbox'][2] - span['bbox'][0]
                    height = span['bbox'][3] - span['bbox'][1]
                    print(f'  Width: {width:.2f}, Height: {height:.2f}')
                    
                    if height > width * 2:
                        print('  *** VERTICAL TEXT DETECTED ***')

if not found_154:
    print('\n❌ 154 NOT FOUND in raw PyMuPDF extraction')
    print('\nSearching for nearby text (around 20.5 and 18):')
    
    for block in blocks:
        if 'lines' in block:
            for line in block['lines']:
                for span in line['spans']:
                    text = span['text'].strip()
                    if any(val in text for val in ['20.5', '18', '15']):
                        bbox = span['bbox']
                        print(f'\n  Found: {repr(text)}')
                        print(f'    Position: ({bbox[0]:.1f}, {bbox[1]:.1f})')
                        print(f'    Bbox: {bbox}')
                        
                        # Check dimensions
                        w = bbox[2] - bbox[0]
                        h = bbox[3] - bbox[1]
                        print(f'    Width: {w:.2f}, Height: {h:.2f}')
                        if h > w * 2:
                            print(f'    *** VERTICAL ***')
else:
    print('\n✓ 154 EXISTS in PyMuPDF raw extraction')

print(f'\n=== TOTAL BLOCKS: {len(blocks)} ===')
print(f'=== TOTAL TEXT SPANS: {len(all_texts)} ===')

# Check if 154 appears as individual characters
print('\n=== Checking for split characters (1, 5, 4) ===')
for block in blocks:
    if 'lines' in block:
        for line in block['lines']:
            spans_text = [s['text'].strip() for s in line['spans']]
            line_text = ''.join(spans_text)
            if '154' in line_text or ('1' in spans_text and '5' in spans_text and '4' in spans_text):
                print(f'\nPossible 154 from multiple spans:')
                for i, span in enumerate(line['spans']):
                    print(f'  Span {i}: {repr(span["text"])} @ {span["bbox"]}')

doc.close()
