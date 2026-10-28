"""
Test tolerance extraction for balloons 94 and 99.
Verify that asymmetric tolerances like "27.5 +0.05/-0.05" and "37.5 +0.2/-0.2" are correctly parsed.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from app.services.pdf_extractor import parse_dimension_string, extract_all_dimensions_from_page
import fitz

def test_tolerance_patterns():
    """Test various tolerance patterns."""
    
    print("="*80)
    print("TOLERANCE PATTERN TESTS")
    print("="*80)
    print()
    
    test_cases = [
        # (input, expected_nominal, expected_upper, expected_lower, description)
        ("27.5 +0.05/-0.05", 27.5, 0.05, -0.05, "Asymmetric tolerance (equal)"),
        ("37.5 +0.2/-0.2", 37.5, 0.2, -0.2, "Asymmetric tolerance (larger)"),
        ("27.5 +0.05 -0.05", 27.5, 0.05, -0.05, "Asymmetric with space"),
        ("27.5+0.05/-0.05", 27.5, 0.05, -0.05, "Asymmetric no space"),
        ("50 ±0.1", 50, 0.1, -0.1, "Symmetric tolerance"),
        ("25.00 +0.10/-0.00", 25.0, 0.10, 0.0, "Unilateral upper"),
        ("25.00 +0.00/-0.10", 25.0, 0.0, -0.10, "Unilateral lower"),
        ("100 +0.5", 100, 0.5, 0.0, "Single upper tolerance"),
        ("100 -0.5", 100, 0.0, -0.5, "Single lower tolerance"),
    ]
    
    passed = 0
    failed = 0
    
    for test_input, exp_nom, exp_upper, exp_lower, desc in test_cases:
        result = parse_dimension_string(test_input)
        
        if result and result.get("found"):
            nom = result.get("nominalValue")
            upper = result.get("upperTolerance")
            lower = result.get("lowerTolerance")
            
            # Check if values match (with small tolerance for floating point)
            nom_ok = abs(nom - exp_nom) < 0.001 if nom else False
            upper_ok = abs(upper - exp_upper) < 0.001 if upper is not None else False
            lower_ok = abs(lower - exp_lower) < 0.001 if lower is not None else False
            
            if nom_ok and upper_ok and lower_ok:
                print(f"PASS: {desc}")
                print(f"  Input: '{test_input}'")
                print(f"  Got: nom={nom}, upper={upper}, lower={lower}")
                passed += 1
            else:
                print(f"FAIL: {desc}")
                print(f"  Input: '{test_input}'")
                print(f"  Expected: nom={exp_nom}, upper={exp_upper}, lower={exp_lower}")
                print(f"  Got: nom={nom}, upper={upper}, lower={lower}")
                failed += 1
        else:
            print(f"FAIL: {desc}")
            print(f"  Input: '{test_input}'")
            print(f"  Result: NOT PARSED")
            failed += 1
        print()
    
    print(f"Results: {passed} passed, {failed} failed")
    print()
    return failed == 0


def find_specific_balloons(pdf_path, page_num=1):
    """Find balloons around positions where 94 and 99 might be."""
    
    print("="*80)
    print("SEARCHING FOR TOLERANCE DIMENSIONS IN PDF")
    print("="*80)
    print(f"File: {os.path.basename(pdf_path)}")
    print(f"Page: {page_num}")
    print()
    
    result = extract_all_dimensions_from_page(pdf_path, page_num)
    
    if not result.get("success"):
        print(f"ERROR: {result.get('error')}")
        return
    
    items = result.get("items", [])
    print(f"Total detections: {len(items)}")
    print()
    
    # Look for dimensions with specific patterns
    tolerance_dims = []
    for i, item in enumerate(items):
        text = item.get('rawText', '')
        upper = item.get('upperTolerance', 0)
        lower = item.get('lowerTolerance', 0)
        
        # Check if it has non-zero tolerances or contains +/- in text
        has_tolerance_text = any(char in text for char in ['±', '+', '-']) and any(c.isdigit() for c in text)
        has_tolerance_values = (upper != 0 or lower != 0)
        
        if has_tolerance_text or has_tolerance_values:
            tolerance_dims.append({
                'index': i + 1,
                'text': text,
                'nominal': item.get('nominalValue'),
                'upper': upper,
                'lower': lower,
                'position': (item['normX'], item['normY'])
            })
    
    print(f"Found {len(tolerance_dims)} dimensions with tolerances:")
    print()
    
    for dim in tolerance_dims:
        print(f"Balloon #{dim['index']}: '{dim['text']}'")
        print(f"  Position: ({dim['position'][0]:.3f}, {dim['position'][1]:.3f})")
        print(f"  Nominal: {dim['nominal']}")
        print(f"  Upper tolerance: {dim['upper']}")
        print(f"  Lower tolerance: {dim['lower']}")
        
        # Check if tolerances were extracted
        if dim['upper'] == 0 and dim['lower'] == 0 and ('+' in dim['text'] or '-' in dim['text']):
            print(f"  WARNING: Text contains +/- but tolerances are zero!")
        print()
    
    return tolerance_dims


def main():
    """Run all tests."""
    
    # Test 1: Pattern matching
    print("\n")
    patterns_ok = test_tolerance_patterns()
    
    # Test 2: Find tolerance dimensions in GEAR COVER PDF
    upload_dir = os.path.join(os.path.dirname(__file__), '../../..', 'backend', 'uploads')
    
    gear_cover_pdf = None
    if os.path.exists(upload_dir):
        for file in os.listdir(upload_dir):
            if "GEAR COVER" in file.upper() or "GP3.010" in file:
                gear_cover_pdf = os.path.join(upload_dir, file)
                break
    
    if gear_cover_pdf:
        print("\n")
        tolerance_dims = find_specific_balloons(gear_cover_pdf, page_num=1)
        
        # Check for specific values 27.5 and 37.5
        print("="*80)
        print("CHECKING FOR BALLOONS 94 AND 99")
        print("="*80)
        
        found_27_5 = [d for d in tolerance_dims if abs(d['nominal'] - 27.5) < 0.1]
        found_37_5 = [d for d in tolerance_dims if abs(d['nominal'] - 37.5) < 0.1]
        
        if found_27_5:
            print(f"\nFound dimension ~27.5: {len(found_27_5)} occurrence(s)")
            for dim in found_27_5:
                status = "OK" if dim['upper'] != 0 or dim['lower'] != 0 else "MISSING TOLERANCE"
                print(f"  Balloon #{dim['index']}: {dim['text']} [{status}]")
        else:
            print("\nWARNING: Dimension ~27.5 not found")
        
        if found_37_5:
            print(f"\nFound dimension ~37.5: {len(found_37_5)} occurrence(s)")
            for dim in found_37_5:
                status = "OK" if dim['upper'] != 0 or dim['lower'] != 0 else "MISSING TOLERANCE"
                print(f"  Balloon #{dim['index']}: {dim['text']} [{status}]")
        else:
            print("\nWARNING: Dimension ~37.5 not found")
    else:
        print("\nWARNING: GEAR COVER PDF not found, skipping PDF tests")
    
    print("\n")
    if patterns_ok:
        print("SUCCESS: All tolerance pattern tests passed!")
    else:
        print("FAILURE: Some tolerance pattern tests failed")


if __name__ == "__main__":
    main()
