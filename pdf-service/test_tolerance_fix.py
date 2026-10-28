"""
Test tolerance fragment fix.

Expected: Only 2 balloons for 27.5 ±0.15 and 37.5 ±0.2
Actual before fix: 4 balloons (including standalone 0.15 and 0.2)
"""

import sys
sys.path.insert(0, 'app')

from services.pdf_extractor import extract_all_dimensions_from_page

pdf_path = r'd:\DimBalooning\backend\uploads\1793176065717-54491294-GP3.010.81.0.PR-GEAR COVER.pdf'

print("="*80)
print("TOLERANCE FRAGMENT FIX - TEST RESULTS")
print("="*80)

result = extract_all_dimensions_from_page(pdf_path, 1)

if not result.get('success'):
    print("❌ Extraction failed:", result.get('error'))
    sys.exit(1)

items = result.get('items', [])

# Find dimensions in the problem region
problem_region = [
    item for item in items
    if 0.06 < item.get('normX', 0) < 0.09 and 0.11 < item.get('normY', 0) < 0.15
]

print(f"\nProblem Region Analysis (x: 0.06-0.09, y: 0.11-0.15)")
print(f"Balloons detected: {len(problem_region)}")
print()

for i, item in enumerate(problem_region, 1):
    text = item.get('rawText', '')
    nom = item.get('nominalValue', 0)
    upper = item.get('upperTolerance', 0)
    lower = item.get('lowerTolerance', 0)
    
    print(f"Balloon {i}: '{text}'")
    print(f"  Position: ({item.get('normX', 0):.4f}, {item.get('normY', 0):.4f})")
    print(f"  Nominal: {nom}, Tolerances: +{upper}/{lower}")
    print()

# Check for specific issues
standalone_0_15 = [item for item in problem_region if item.get('rawText', '') == '0.15']
standalone_0_2 = [item for item in problem_region if item.get('rawText', '') == '0.2']

merged_27_5 = [item for item in problem_region if '27.5' in item.get('rawText', '')]
merged_37_5 = [item for item in problem_region if '37.5' in item.get('rawText', '')]

print("="*80)
print("TEST RESULTS")
print("="*80)

# Test 1: No standalone 0.15
if standalone_0_15:
    print("❌ FAIL: Standalone '0.15' still detected as independent dimension")
else:
    print("✓ PASS: No standalone '0.15' balloon")

# Test 2: No standalone 0.2 in problem region
if standalone_0_2:
    print("❌ FAIL: Standalone '0.2' still detected in problem region")
else:
    print("✓ PASS: No standalone '0.2' balloon in problem region")

# Test 3: Complete 27.5 ±0.15 exists
if merged_27_5:
    item = merged_27_5[0]
    if abs(item.get('upperTolerance', 0) - 0.15) < 0.01:
        print("✓ PASS: '27.5 ±0.15' detected with correct tolerance")
    else:
        print(f"⚠️  WARNING: '27.5' found but tolerance is {item.get('upperTolerance', 0)}, expected 0.15")
else:
    print("❌ FAIL: '27.5 ±0.15' not found")

# Test 4: Complete 37.5 ±0.2 exists
if merged_37_5:
    item = merged_37_5[0]
    if abs(item.get('upperTolerance', 0) - 0.2) < 0.01:
        print("✓ PASS: '37.5 ±0.2' detected with correct tolerance")
    else:
        print(f"⚠️  WARNING: '37.5' found but tolerance is {item.get('upperTolerance', 0)}, expected 0.2")
else:
    print("❌ FAIL: '37.5 ±0.2' not found")

# Test 5: Exactly 2 balloons in problem region
if len(problem_region) == 2:
    print("✓ PASS: Exactly 2 balloons in problem region (as expected)")
elif len(problem_region) == 4:
    print("❌ FAIL: 4 balloons detected (tolerance fragments not removed)")
else:
    print(f"⚠️  WARNING: {len(problem_region)} balloons detected (expected 2)")

# Test 6: Check tolerance limits calculation
if merged_27_5:
    item = merged_27_5[0]
    nom = item.get('nominalValue', 0)
    upper = item.get('upperTolerance', 0)
    lower = item.get('lowerTolerance', 0)
    
    expected_upper_limit = 27.65
    expected_lower_limit = 27.35
    
    # Calculated limits (backend does this)
    calc_upper = nom + upper
    calc_lower = nom + lower
    
    print(f"\n27.5 ±0.15 Limits:")
    print(f"  Calculated: Lower={calc_lower:.3f}, Upper={calc_upper:.3f}")
    print(f"  Expected:   Lower={expected_lower_limit:.3f}, Upper={expected_upper_limit:.3f}")
    
    if abs(calc_upper - expected_upper_limit) < 0.01 and abs(calc_lower - expected_lower_limit) < 0.01:
        print("  ✓ Limits correct")
    else:
        print("  ❌ Limits incorrect")

if merged_37_5:
    item = merged_37_5[0]
    nom = item.get('nominalValue', 0)
    upper = item.get('upperTolerance', 0)
    lower = item.get('lowerTolerance', 0)
    
    expected_upper_limit = 37.7
    expected_lower_limit = 37.3
    
    calc_upper = nom + upper
    calc_lower = nom + lower
    
    print(f"\n37.5 ±0.2 Limits:")
    print(f"  Calculated: Lower={calc_lower:.3f}, Upper={calc_upper:.3f}")
    print(f"  Expected:   Lower={expected_lower_limit:.3f}, Upper={expected_upper_limit:.3f}")
    
    if abs(calc_upper - expected_upper_limit) < 0.01 and abs(calc_lower - expected_lower_limit) < 0.01:
        print("  ✓ Limits correct")
    else:
        print("  ❌ Limits incorrect")

# Test 7: Verify other 0.2 values elsewhere are not affected
all_0_2 = [item for item in items if item.get('rawText', '') == '0.2']
print(f"\nOther standalone '0.2' dimensions in drawing: {len(all_0_2)}")
print("(These should be legitimate standalone dimensions elsewhere)")

print()
print("="*80)
if len(problem_region) == 2 and not standalone_0_15 and not standalone_0_2:
    print("✓✓✓ ALL TESTS PASSED - FIX SUCCESSFUL ✓✓✓")
else:
    print("❌ SOME TESTS FAILED - REVIEW NEEDED")
print("="*80)
