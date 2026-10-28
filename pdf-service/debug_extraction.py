import sys
sys.path.insert(0, 'app')
import fitz
from services.pdf_extractor import parse_dimension_string

pdf_path = r'D:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
doc = fitz.open(pdf_path)
page = doc[0]
width, height = page.rect.width, page.rect.height

# Get words and organize by lines
words = page.get_text("words")
lines_dict = {}
for w in words:
    key = (w[5], w[6])  # (block_no, line_no)
    if key not in lines_dict:
        lines_dict[key] = []
    lines_dict[key].append(w)

# Look for lines containing 37.5±0.2 or similar
print("Lines containing tolerance patterns:")
print("="*80)

for key, line_words in lines_dict.items():
    clean_line = " ".join(w[4] for w in line_words).strip()
    
    # Check if this line has tolerance patterns
    if any(marker in clean_line for marker in ['±', '+0.', '-0.', '37.5', '27.5']):
        x0 = min(w[0] for w in line_words)
        y0 = min(w[1] for w in line_words)
        x1 = max(w[2] for w in line_words)
        y1 = max(w[3] for w in line_words)
        
        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2
        norm_x = cx / width
        norm_y = cy / height
        
        # Try to parse it
        parsed = parse_dimension_string(clean_line)
        
        status = "PARSED" if parsed and parsed.get("found") else "NOT PARSED"
        if parsed and parsed.get("found"):
            has_tol = parsed.get("upperTolerance", 0) != 0 or parsed.get("lowerTolerance", 0) != 0
            tol_status = f"WITH TOL: upper={parsed['upperTolerance']}, lower={parsed['lowerTolerance']}" if has_tol else "NO TOL"
            status = f"{status} - {tol_status}"
        
        print(f"\nLine: '{clean_line}'")
        print(f"  Position: ({norm_x:.4f}, {norm_y:.4f})")
        print(f"  Status: {status}")

doc.close()
