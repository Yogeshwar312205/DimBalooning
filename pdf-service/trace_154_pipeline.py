"""
Trace 154 through the entire extraction pipeline to find where it's lost.
"""
import sys
sys.path.append('app')

from services.pdf_extractor import extract_all_dimensions_from_page

# Use one of the GEAR COVER PDFs
pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

print('=== TRACING 154 THROUGH EXTRACTION PIPELINE ===\n')
print(f'PDF: {pdf_path.split("/")[-1]}\n')

# Run the full extraction
result = extract_all_dimensions_from_page(pdf_path, page_number=1)

print('\n=== EXTRACTION RESULT ===')
print(f'Total dimensions extracted: {len(result["dimensions"])}')

# Check if 154 is in the results
found_154 = False
for i, dim in enumerate(result['dimensions']):
    if '154' in str(dim.get('nominal_value', '')) or '154' in str(dim.get('text', '')):
        found_154 = True
        print(f'\n✓ FOUND 154 in results at index {i}:')
        print(f'  Text: {dim.get("text")}')
        print(f'  Nominal: {dim.get("nominal_value")}')
        print(f'  Position: ({dim.get("x"):.4f}, {dim.get("y"):.4f})')
        print(f'  Tolerances: +{dim.get("upper_tolerance")} / -{dim.get("lower_tolerance")}')

if not found_154:
    print('\n❌ 154 NOT FOUND in final extraction results')
    print('\nSearching for 154 in raw text...')
    
    # Re-run with debug output
    import fitz
    doc = fitz.open(pdf_path)
    page = doc[0]
    width, height = page.rect.width, page.rect.height
    
    text_dict = page.get_text('dict')
    for block in text_dict['blocks']:
        if 'lines' in block:
            for line in block['lines']:
                for span in line['spans']:
                    if '154' in span['text']:
                        bbox = span['bbox']
                        norm_x = (bbox[0] + bbox[2]) / 2 / width
                        norm_y = (bbox[1] + bbox[3]) / 2 / height
                        
                        print(f'\n  Raw text span: {repr(span["text"])}')
                        print(f'  Raw position: ({bbox[0]:.1f}, {bbox[1]:.1f})')
                        print(f'  Normalized: ({norm_x:.4f}, {norm_y:.4f})')
                        print(f'  Size: {span["size"]:.1f}pt')
                        
                        # Check against filters
                        print('\n  Checking against filters:')
                        
                        # Check if it's a plain number
                        text = span['text'].strip()
                        if text.isdigit():
                            print(f'    ✓ Is pure digit')
                        
                        # Check value range
                        try:
                            val = float(text)
                            print(f'    ✓ Value: {val}')
                            if val >= 1000:
                                print(f'    ⚠ Value >= 1000 (might be filtered as sheet metadata)')
                        except:
                            pass
                        
                        # Check position (drawing boundary)
                        if norm_x < 0.08 or norm_x > 0.92 or norm_y < 0.08 or norm_y > 0.92:
                            print(f'    ⚠ Outside drawing boundary (margins)')
                        
                        if norm_y > 0.85:
                            print(f'    ⚠ In title block region (y > 0.85)')
    
    doc.close()

print('\n\n=== ANALYSIS COMPLETE ===')
