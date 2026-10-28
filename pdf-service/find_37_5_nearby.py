import sys
import fitz
sys.path.insert(0, 'app')

pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

doc = fitz.open(pdf_path)
page = doc[0]
width = page.rect.width
height = page.rect.height

words = page.get_text('words')

# Find 37.5 on left side
word_37_5 = None
for w in words:
    if w[4].strip() == '37.5':
        cx = (w[0] + w[2]) / 2.0
        cy = (w[1] + w[3]) / 2.0
        if cx / width < 0.1:  # Left side of page
            word_37_5 = {'text': w[4], 'cx': cx, 'cy': cy}
            break

if word_37_5:
    print(f'Found 37.5 at ({word_37_5["cx"]:.1f}, {word_37_5["cy"]:.1f})')
    print(f'Looking for nearby text with tolerance indicators...')
    
    nearby = []
    for w in words:
        text = w[4].strip()
        wx = (w[0] + w[2]) / 2.0
        wy = (w[1] + w[3]) / 2.0
        dx = abs(wx - word_37_5['cx'])
        dy = abs(wy - word_37_5['cy'])
        
        if dx < 50 and dy < 50:
            nearby.append({'text': text, 'dx': dx, 'dy': dy})
    
    nearby.sort(key=lambda x: x['dx']**2 + x['dy']**2)
    print("Closest 10 words:")
    for n in nearby[:10]:
        print(f'  "{n["text"]}" at dx={n["dx"]:.1f}, dy={n["dy"]:.1f}')
