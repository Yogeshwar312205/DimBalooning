import sys
sys.path.insert(0, 'app')
import fitz

pdf_path = r'D:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'
doc = fitz.open(pdf_path)
page = doc[0]
width, height = page.rect.width, page.rect.height

# Target coordinates (normalized)
targets = [
    (0.063, 0.121, "27.5"),
    (0.065, 0.138, "37.5")
]

words = page.get_text("words")

for norm_x, norm_y, label in targets:
    pdf_x = norm_x * width
    pdf_y = norm_y * height
    
    print(f"\n{'='*60}")
    print(f"Near {label} at ({norm_x:.3f}, {norm_y:.3f}) = ({pdf_x:.1f}, {pdf_y:.1f}) pts")
    print(f"{'='*60}")
    
    # Find all words within 30pts
    nearby = []
    for w in words:
        wx = (w[0] + w[2]) / 2
        wy = (w[1] + w[3]) / 2
        dist = ((wx - pdf_x)**2 + (wy - pdf_y)**2)**0.5
        if dist < 35:
            nearby.append((dist, w))
    
    nearby.sort()
    
    print("Nearby words:")
    for dist, w in nearby[:10]:
        text = w[4]
        wx = (w[0] + w[2]) / 2
        wy = (w[1] + w[3]) / 2
        print(f"  {dist:5.1f}pt: '{text}' at ({wx:.1f}, {wy:.1f})")

doc.close()
