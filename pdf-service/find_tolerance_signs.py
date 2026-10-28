import fitz

doc = fitz.open(r'D:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf')
page = doc[0]
words = page.get_text('words')

# Find words with tolerance markers
tol_words = []
for w in words:
    text = w[4]
    if any(c in text for c in ['+', '-', '±', '▒']):
        tol_words.append((text, w))

print(f'Words with +/- signs: {len(tol_words)}')
for text, w in tol_words[:30]:
    wx = (w[0] + w[2]) / 2
    wy = (w[1] + w[3]) / 2
    print(f"  '{text}' at ({wx:.1f}, {wy:.1f})")

doc.close()
