"""
Run the full extraction pipeline and check if 154 is extracted
"""
import sys
sys.path.append('app')

from services.pdf_extractor import extract_all_dimensions_from_page

pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

print('=== RUNNING FULL EXTRACTION FOR 154 ===\n')

result = extract_all_dimensions_from_page(pdf_path, page_number=1)

if not result.get('success', True):
    print(f'❌ Extraction failed: {result.get("error")}')
    sys.exit(1)

items = result.get('items', [])
print(f'Total dimensions extracted: {len(items)}\n')

# Search for 154
found_154 = False
for i, item in enumerate(items):
    nominal = item.get('nominalValue', 0)
    text = item.get('rawText', '')
    
    if nominal == 154 or '154' in text:
        found_154 = True
        print(f'✓ FOUND 154 at index {i}:')
        print(f'  Raw text: {text}')
        print(f'  Nominal: {nominal}')
        print(f'  Position: ({item.get("normX"):.4f}, {item.get("normY"):.4f})')
        print(f'  Tolerances: +{item.get("upperTolerance")} / -{item.get("lowerTolerance")}')
        print(f'  Extraction mode: {item.get("extractionMode")}')
        print()

if not found_154:
    print('❌ 154 NOT FOUND in extraction results\n')
    
    # Show some context - dimensions near where 154 should be
    print('Dimensions near expected 154 position (0.3123, 0.8257):')
    target_x, target_y = 0.3123, 0.8257
    
    nearby = []
    for item in items:
        x = item.get('normX', 0)
        y = item.get('normY', 0)
        dist = ((x - target_x)**2 + (y - target_y)**2)**0.5
        if dist < 0.15:  # Within 15% of page
            nearby.append({
                'text': item.get('rawText'),
                'nominal': item.get('nominalValue'),
                'pos': (x, y),
                'dist': dist
            })
    
    nearby.sort(key=lambda d: d['dist'])
    
    if nearby:
        print(f'\n  Found {len(nearby)} dimensions nearby:')
        for dim in nearby[:10]:
            print(f'    {dim["text"]:20s} (nom={dim["nominal"]}) @ ({dim["pos"][0]:.4f}, {dim["pos"][1]:.4f}) dist={dim["dist"]:.4f}')
    else:
        print('  No dimensions found near this position')
    
    # Check filter stats
    if 'filterStats' in result:
        print('\n  Filter statistics:')
        for key, val in result['filterStats'].items():
            print(f'    {key}: {val}')

print('\n=== EXTRACTION COMPLETE ===')
