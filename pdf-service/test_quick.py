import sys
sys.path.insert(0, 'app')
from services.pdf_extractor import extract_all_dimensions_from_page

pdf_path = r'D:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
result = extract_all_dimensions_from_page(pdf_path, 1)

items = result.get('items', [])
with_tol = [item for item in items if item.get('upperTolerance', 0) != 0 or item.get('lowerTolerance', 0) != 0]

print(f"Total dimensions: {len(items)}")
print(f"Dimensions with tolerance: {len(with_tol)}")

# Look for 27.5 and 37.5
found_27_5 = [item for item in items if abs(item.get('nominalValue', 0) - 27.5) < 0.1]
found_37_5 = [item for item in items if abs(item.get('nominalValue', 0) - 37.5) < 0.1]

print(f"\n27.5 dimensions found: {len(found_27_5)}")
for item in found_27_5:
    has_tol = item.get('upperTolerance', 0) != 0 or item.get('lowerTolerance', 0) != 0
    tol_status = f"upper={item['upperTolerance']}, lower={item['lowerTolerance']}" if has_tol else "NO TOLERANCE"
    print(f"  '{item['rawText']}' at ({item['normX']:.3f}, {item['normY']:.3f}) - {tol_status}")

print(f"\n37.5 dimensions found: {len(found_37_5)}")
for item in found_37_5:
    has_tol = item.get('upperTolerance', 0) != 0 or item.get('lowerTolerance', 0) != 0
    tol_status = f"upper={item['upperTolerance']}, lower={item['lowerTolerance']}" if has_tol else "NO TOLERANCE"
    print(f"  '{item['rawText']}' at ({item['normX']:.3f}, {item['normY']:.3f}) - {tol_status}")

print("\nAll dimensions with tolerance:")
for item in with_tol:
    print(f"  {item['rawText']} at ({item['normX']:.3f}, {item['normY']:.3f})")
