import fitz
import os

print('=== SEARCHING FOR PDF WITH 154 ===\n')

uploads_dir = r'd:\DimBalooning\backend\uploads'
pdf_files = [f for f in os.listdir(uploads_dir) if f.endswith('.pdf')]

print(f'Scanning {len(pdf_files)} PDF files...\n')

found_pdfs = []

for pdf_file in pdf_files:
    pdf_path = os.path.join(uploads_dir, pdf_file)
    try:
        doc = fitz.open(pdf_path)
        page = doc[0]
        plain_text = page.get_text('text')
        
        if '154' in plain_text:
            found_pdfs.append(pdf_file)
            print(f'✓ FOUND 154 in: {pdf_file}')
            
            # Extract context around 154
            idx = plain_text.find('154')
            context = plain_text[max(0, idx-50):min(len(plain_text), idx+50)]
            print(f'  Context: ...{context}...')
            print()
            
            # Get exact position
            text_dict = page.get_text('dict')
            for block in text_dict['blocks']:
                if 'lines' in block:
                    for line in block['lines']:
                        for span in line['spans']:
                            if '154' in span['text']:
                                bbox = span['bbox']
                                width = bbox[2] - bbox[0]
                                height = bbox[3] - bbox[1]
                                print(f'  Exact match: {repr(span["text"])}')
                                print(f'  Position: ({bbox[0]:.1f}, {bbox[1]:.1f})')
                                print(f'  Size: {span["size"]:.1f}pt')
                                print(f'  Dimensions: width={width:.1f}, height={height:.1f}')
                                if height > width * 1.5:
                                    print(f'  *** LIKELY VERTICAL TEXT ***')
                                print()
        
        doc.close()
    except Exception as e:
        print(f'  Error reading {pdf_file}: {e}')

if not found_pdfs:
    print('\n❌ NO PDF files contain "154"')
    print('\nThis means either:')
    print('  1. The screenshot you mentioned is from a different PDF')
    print('  2. The "154" is embedded as an image or graphical element')
    print('  3. The "154" is in rotated/transformed text PyMuPDF cannot extract')
else:
    print(f'\n=== SUMMARY ===')
    print(f'Found "154" in {len(found_pdfs)} PDF(s):')
    for pdf in found_pdfs:
        print(f'  - {pdf}')
