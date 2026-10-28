import sys
import fitz
sys.path.insert(0, 'app')

pdf_path = r'd:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

doc = fitz.open(pdf_path)
page = doc[0]  # Page 1
width = page.rect.width
height = page.rect.height

words = page.get_text("words")

# Find 27.5 and 37.5
target_words = []
for w in words:
    text = w[4].strip()
    if text in ['27.5', '37.5', '0.15', '0.2', '0.15mm', '0.2mm']:
        cx = (w[0] + w[2]) / 2.0
        cy = (w[1] + w[3]) / 2.0
        norm_x = cx / width
        norm_y = cy / height
        target_words.append({
            'text': text,
            'x': w[0], 'y': w[1],
            'cx': cx, 'cy': cy,
            'norm_x': norm_x, 'norm_y': norm_y
        })

print("Target words found:")
for w in sorted(target_words, key=lambda x: (x['norm_y'], x['norm_x'])):
    print(f"  '{w['text']}' at ({w['cx']:.1f}, {w['cy']:.1f}) = normalized ({w['norm_x']:.4f}, {w['norm_y']:.4f})")

print("\nDistance calculations:")
# Find 27.5
word_27_5 = [w for w in target_words if w['text'] == '27.5']
word_0_15 = [w for w in target_words if w['text'] in ['0.15', '0.15mm']]

if word_27_5 and word_0_15:
    w1 = word_27_5[0]
    w2 = word_0_15[0]
    dx = abs(w1['cx'] - w2['cx'])
    dy = abs(w1['cy'] - w2['cy'])
    print(f"  27.5 to 0.15: dx={dx:.1f}pt, dy={dy:.1f}pt")
    print(f"    Within 30pt radius? dx<35: {dx<35}, dy<30: {dy<30}")
    print(f"    Vertically stacked? dx<35 and 0<dy<30: {dx<35 and 0<dy<30}")

# Find 37.5
word_37_5 = [w for w in target_words if w['text'] == '37.5']
word_0_2 = [w for w in target_words if w['text'] in ['0.2', '0.2mm']]

if word_37_5 and word_0_2:
    w1 = word_37_5[0]
    w2 = word_0_2[0]
    dx = abs(w1['cx'] - w2['cx'])
    dy = abs(w1['cy'] - w2['cy'])
    print(f"  37.5 to 0.2: dx={dx:.1f}pt, dy={dy:.1f}pt")
    print(f"    Within 30pt radius? dx<35: {dx<35}, dy<30: {dy<30}")
    print(f"    Vertically stacked? dx<35 and 0<dy<30: {dx<35 and 0<dy<30}")

print("\nNearby text around 27.5:")
if word_27_5:
    w1 = word_27_5[0]
    nearby = []
    for w in words:
        wx = (w[0] + w[2]) / 2.0
        wy = (w[1] + w[3]) / 2.0
        dx = abs(wx - w1['cx'])
        dy = abs(wy - w1['cy'])
        
        if (dx < 35 and 0 < dy < 30) or (dy < 10 and 5 < dx < 30):
            nearby.append({'text': w[4], 'dx': dx, 'dy': dy})
    
    nearby.sort(key=lambda x: x['dx']**2 + x['dy']**2)
    for n in nearby[:10]:
        print(f"  '{n['text']}' at dx={n['dx']:.1f}, dy={n['dy']:.1f}")
