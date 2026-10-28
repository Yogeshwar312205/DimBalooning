"""
Analyze how PyMuPDF extracts text spans to understand why tolerances are missing.
Check if nominal values and tolerances are in separate text blocks.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import fitz

def analyze_text_near_coordinates(pdf_path, page_num, target_x, target_y, search_radius=50):
    """Analyze all text near specific coordinates."""
    
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    width, height = page.rect.width, page.rect.height
    
    pdf_x = target_x * width
    pdf_y = target_y * height
    
    print(f"\nAnalyzing text near ({target_x:.3f}, {target_y:.3f}) = ({pdf_x:.1f}, {pdf_y:.1f}) pts")
    print(f"Search radius: {search_radius} pts")
    print("-" * 80)
    
    # Method 1: Get words
    words = page.get_text("words")
    nearby_words = []
    for w in words:
        wx = (w[0] + w[2]) / 2
        wy = (w[1] + w[3]) / 2
        dist = ((wx - pdf_x)**2 + (wy - pdf_y)**2)**0.5
        if dist < search_radius:
            nearby_words.append((dist, w))
    
    nearby_words.sort(key=lambda x: x[0])
    
    print("\nNearby words (sorted by distance):")
    for dist, w in nearby_words[:15]:
        text = w[4]
        wx = (w[0] + w[2]) / 2
        wy = (w[1] + w[3]) / 2
        norm_wx = wx / width
        norm_wy = wy / height
        print(f"  {dist:5.1f}pt: '{text}' at ({norm_wx:.4f}, {norm_wy:.4f})")
    
    # Method 2: Get text blocks
    blocks = page.get_text("blocks")
    nearby_blocks = []
    for b in blocks:
        if len(b) < 5:
            continue
        bx = (b[0] + b[2]) / 2
        by = (b[1] + b[3]) / 2
        dist = ((bx - pdf_x)**2 + (by - pdf_y)**2)**0.5
        if dist < search_radius * 2:  # Larger radius for blocks
            nearby_blocks.append((dist, b))
    
    nearby_blocks.sort(key=lambda x: x[0])
    
    print("\nNearby blocks:")
    for dist, b in nearby_blocks[:5]:
        text = b[4].strip()
        bx = (b[0] + b[2]) / 2
        by = (b[1] + b[3]) / 2
        norm_bx = bx / width
        norm_by = by / height
        print(f"  {dist:5.1f}pt: '{text}' at ({norm_bx:.4f}, {norm_by:.4f})")
    
    # Method 3: Get detailed dict extraction
    text_dict = page.get_text("dict")
    print("\nText structure (dict method):")
    block_count = 0
    for block in text_dict.get("blocks", []):
        if block.get("type") == 0:  # Text block
            block_bbox = block.get("bbox", [0, 0, 0, 0])
            bx = (block_bbox[0] + block_bbox[2]) / 2
            by = (block_bbox[1] + block_bbox[3]) / 2
            dist = ((bx - pdf_x)**2 + (by - pdf_y)**2)**0.5
            
            if dist < search_radius * 2:
                block_count += 1
                if block_count > 3:  # Limit output
                    break
                    
                print(f"\n  Block at distance {dist:.1f}pt:")
                for line in block.get("lines", []):
                    line_text = ""
                    for span in line.get("spans", []):
                        span_text = span.get("text", "")
                        line_text += span_text
                    if line_text.strip():
                        print(f"    Line: '{line_text.strip()}'")
    
    doc.close()


def find_dimensions_with_numbers(pdf_path, page_num, target_numbers):
    """Find all text containing specific numbers."""
    
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    width, height = page.rect.width, page.rect.height
    
    print(f"\n{'='*80}")
    print(f"Searching for dimensions containing: {target_numbers}")
    print(f"{'='*80}")
    
    # Search in words
    words = page.get_text("words")
    matches = []
    
    for w in words:
        text = w[4]
        for target in target_numbers:
            if target in text:
                wx = (w[0] + w[2]) / 2
                wy = (w[1] + w[3]) / 2
                norm_x = wx / width
                norm_y = wy / height
                matches.append({
                    'text': text,
                    'norm_x': norm_x,
                    'norm_y': norm_y,
                    'target': target
                })
    
    # Group by target number
    for target in target_numbers:
        target_matches = [m for m in matches if m['target'] == target]
        print(f"\nFound {len(target_matches)} occurrences of '{target}':")
        for m in target_matches:
            print(f"  '{m['text']}' at ({m['norm_x']:.4f}, {m['norm_y']:.4f})")
            
            # Check nearby text
            analyze_text_near_coordinates(pdf_path, page_num, m['norm_x'], m['norm_y'], search_radius=30)
    
    doc.close()


def main():
    """Analyze the GEAR COVER PDF."""
    
    upload_dir = os.path.join(os.path.dirname(__file__), '../../..', 'backend', 'uploads')
    
    gear_cover_pdf = None
    if os.path.exists(upload_dir):
        for file in os.listdir(upload_dir):
            if "GEAR COVER" in file.upper() or "GP3.010" in file:
                gear_cover_pdf = os.path.join(upload_dir, file)
                break
    
    if not gear_cover_pdf:
        print("ERROR: GEAR COVER PDF not found")
        return
    
    print("="*80)
    print("PDF TEXT SPAN ANALYSIS")
    print("="*80)
    print(f"File: {os.path.basename(gear_cover_pdf)}")
    
    # Look for 27.5 and 37.5 (balloons 94 and 99)
    find_dimensions_with_numbers(gear_cover_pdf, 1, ["27.5", "37.5"])


if __name__ == "__main__":
    main()
