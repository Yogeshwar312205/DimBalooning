"""
Check balloon assignment for all dimensions including 154
"""
import sys
sys.path.append('app')

from services.pdf_extractor import extract_all_dimensions_from_page

pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

result = extract_all_dimensions_from_page(pdf_path, page_number=1)
items = result.get('items', [])

print(f'=== BALLOON ASSIGNMENT CHECK ===\n')
print(f'Total dimensions: {len(items)}\n')

# Sort by position (top to bottom, left to right) like balloon numbering might do
sorted_items = sorted(items, key=lambda d: (d.get('normY', 0), d.get('normX', 0)))

print('Dimensions sorted by position (how balloons might be numbered):\n')
print(f'{"#":>3} {"Text":20s} {"Nominal":>8s} {"Position":15s} {"Mode":20s}')
print('=' * 75)

for i, item in enumerate(sorted_items, start=1):
    text = item.get('rawText', '')
    nominal = item.get('nominalValue', 0)
    x = item.get('normX', 0)
    y = item.get('normY', 0)
    mode = item.get('extractionMode', '')
    
    marker = ' ← 154 HERE' if nominal == 154 else ''
    
    print(f'{i:3d} {text:20s} {nominal:8.2f} ({x:5.3f}, {y:5.3f}) {mode:20s}{marker}')

print('\n' + '=' * 75)

# Find 154
index_154 = None
for i, item in enumerate(sorted_items):
    if item.get('nominalValue') == 154:
        index_154 = i + 1
        break

if index_154:
    print(f'\n✓ 154 would be assigned balloon number: {index_154}')
    print(f'\nDimensions nearby (within ±5 balloons):')
    
    start = max(0, index_154 - 6)
    end = min(len(sorted_items), index_154 + 5)
    
    for i in range(start, end):
        item = sorted_items[i]
        marker = ' ← THIS IS 154' if i == index_154 - 1 else ''
        print(f'  #{i+1:3d}: {item.get("rawText", ""):20s} (nom={item.get("nominalValue", 0):.1f}){marker}')
else:
    print('\n❌ 154 not found in sorted results')
