import sys
import fitz
sys.path.insert(0, 'app')
from services.pdf_extractor import extract_all_dimensions_from_page

pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

# Extract from all pages and combine
doc = fitz.open(pdf_path)
all_dimensions = []
for page_num in range(1, len(doc) + 1):
    page_result = extract_all_dimensions_from_page(pdf_path, page_num)
    if page_result.get('success'):
        for dim in page_result['items']:
            dim['page'] = page_num
            all_dimensions.append(dim)

result = {'dimensions': all_dimensions}

print('='*80)
print('TOLERANCE EXTRACTION TEST')
print('='*80)
print(f'Total dimensions extracted: {len(result["dimensions"])}')
print()

# Find dimensions with tolerances
with_tolerances = [d for d in result['dimensions'] if d.get('upperTolerance') != 0 or d.get('lowerTolerance') != 0]
print(f'Dimensions with tolerances: {len(with_tolerances)}')
print()

# Look for 27.5 and 37.5
target_dims = [d for d in result['dimensions'] if abs(d.get('nominalValue', 0) - 27.5) < 0.1 or abs(d.get('nominalValue', 0) - 37.5) < 0.1]
print('Target dimensions (27.5 and 37.5):')
for d in target_dims:
    nom = d.get('nominalValue', 0)
    upper = d.get('upperTolerance', 0)
    lower = d.get('lowerTolerance', 0)
    text = d.get('rawText', '')
    page = d.get('page', 0)
    x = d.get('normX', 0)
    y = d.get('normY', 0)
    print(f'  Page {page}: "{text}" at ({x:.3f}, {y:.3f})')
    print(f'    Nominal: {nom}, Upper: +{upper}, Lower: {lower}')
print()

# Show all dimensions with tolerances
print('All dimensions with tolerances:')
for d in with_tolerances:
    text = d.get('rawText', '')
    nom = d.get('nominalValue', 0)
    upper = d.get('upperTolerance', 0)
    lower = d.get('lowerTolerance', 0)
    page = d.get('page', 0)
    print(f'  Page {page}: "{text}" → {nom} +{upper}/{lower}')

print()
print('='*80)
print('RESULTS:')
print('='*80)
if any(abs(d.get('nominalValue', 0) - 27.5) < 0.1 and d.get('upperTolerance') != 0 for d in result['dimensions']):
    print('✓ PASS: 27.5 dimension has tolerances extracted')
else:
    print('✗ FAIL: 27.5 dimension missing tolerances')

if any(abs(d.get('nominalValue', 0) - 37.5) < 0.1 and d.get('upperTolerance') != 0 for d in result['dimensions']):
    print('✓ PASS: 37.5 dimension has tolerances extracted')
else:
    print('✗ FAIL: 37.5 dimension missing tolerances')

print(f'✓ Total: {len(with_tolerances)} dimensions with tolerances')
