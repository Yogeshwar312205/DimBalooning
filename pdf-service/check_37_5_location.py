import fitz

doc = fitz.open(r'D:\DimBalooning\backend\uploads\1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf')
page = doc[0]
width, height = page.rect.width, page.rect.height

words = page.get_text('words')

# Find the tolerance dimensions
tolerance_dims = [
    '37.5±0.2',
    '7±0.2mm'
]

for target in tolerance_dims:
    print(f"\nSearching for: '{target}'")
    
    for w in words:
        text = w[4]
        if target in text or text in target:
            wx = (w[0] + w[2]) / 2
            wy = (w[1] + w[3]) / 2
            norm_x = wx / width
            norm_y = wy / height
            
            print(f"  Found: '{text}'")
            print(f"  Position: PDF ({wx:.1f}, {wy:.1f}), Normalized ({norm_x:.4f}, {norm_y:.4f})")
            
            # Check if this is near edges
            near_top = norm_y < 0.08
            near_bottom = norm_y > 0.92
            near_left = norm_x < 0.08
            near_right = norm_x > 0.92
            
            status = []
            if near_top:
                status.append("NEAR TOP")
            if near_bottom:
                status.append("NEAR BOTTOM")
            if near_left:
                status.append("NEAR LEFT")
            if near_right:
                status.append("NEAR RIGHT")
            
            if status:
                print(f"  STATUS: {', '.join(status)} - MIGHT BE FILTERED!")
            else:
                print(f"  STATUS: Interior - should be detected")

doc.close()
