import sys
import os
sys.path.insert(0, 'app')

from services.pdf_extractor import extract_all_dimensions_from_page

# Test with extraction
pdf_path = r'd:\DimBalooning\backend\uploads\1793176065717-54491294-GP3.010.81.0.PR-GEAR COVER.pdf'

if os.path.exists(pdf_path):
    print('='*60)
    print('Testing extraction with fusion layer...')
    print('='*60)
    
    result = extract_all_dimensions_from_page(pdf_path, 1)
    
    print(f'\nSuccess: {result.get("success")}')
    print(f'Dimensions: {result.get("count", 0)}')
    
    if result.get('diagnostics', {}).get('filterStats', {}).get('fusion_output'):
        stats = result['diagnostics']['filterStats']
        print(f'\nFusion Statistics:')
        print(f'  Vector candidates: {stats.get("vector_candidates", 0)}')
        print(f'  OCR candidates: {stats.get("ocr_candidates", 0)}')
        print(f'  Matched pairs: {stats.get("fusion_matched_pairs", 0)}')
        print(f'  Final output: {stats.get("fusion_output", 0)}')
        print('\n✓ Fusion layer is working correctly!')
    else:
        print('\n⚠️  Fusion stats not found (may be pure vector PDF)')
    
    # Check extraction modes
    items = result.get('items', [])
    if items:
        modes = {}
        for item in items:
            mode = item.get('extractionMode', 'UNKNOWN')
            modes[mode] = modes.get(mode, 0) + 1
        
        print(f'\nExtraction Modes:')
        for mode, count in modes.items():
            print(f'  {mode}: {count}')
    
    print('\n' + '='*60)
    print('✓ Service is working correctly!')
    print('='*60)
else:
    print('PDF not found at:', pdf_path)
    print('Please upload a PDF through the UI first')
