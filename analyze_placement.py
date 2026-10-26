#!/usr/bin/env python3
"""
Analyze balloon placement quality on GEAR COVER drawing.
Measure leader line lengths, crossing potential, and spacing issues.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'pdf-service'))

from app.services.pdf_extractor import extract_all_dimensions_from_page
import math

pdf_path = 'backend/uploads/1792738710508-21990296-GP3.010.81.0.PR-GEAR COVER.pdf'

print("="*80)
print("BALLOON PLACEMENT QUALITY ANALYSIS")
print("="*80)
print(f"PDF: {pdf_path}")
print()

result = extract_all_dimensions_from_page(pdf_path, 1)

if not result['success'] or not result['items']:
    print("✗ Extraction failed or no items")
    sys.exit(1)

items = result['items']
print(f"Total detections: {len(items)}")
print()

# Simulate the backend placement algorithm
print("SIMULATING BACKEND PLACEMENT ALGORITHM")
print("-"*80)

placed_positions = []
placed_anchors = []

candidate_radii = [0.045, 0.070, 0.095, 0.125, 0.160]
angles = [
    -math.pi / 4,      # Top-Right
    -3 * math.pi / 4,  # Top-Left
    math.pi / 4,       # Bottom-Right
    3 * math.pi / 4,   # Bottom-Left
    -math.pi / 2,      # Top
    0,                 # Right
    math.pi / 2,       # Bottom
    math.pi            # Left
]

placements = []

for item in items:
    target_x = item['normX']
    target_y = item['normY']
    
    # Check for duplicate
    is_dup = any(
        math.hypot(anchor['x'] - target_x, anchor['y'] - target_y) < 0.012
        for anchor in placed_anchors
    )
    
    if is_dup:
        continue
    
    placed_anchors.append({'x': target_x, 'y': target_y})
    
    # Find best candidate
    best_cand = {
        'x': max(0.03, min(0.97, target_x + 0.04)),
        'y': max(0.03, min(0.97, target_y - 0.03)),
        'score': -1000
    }
    
    for r in candidate_radii:
        for angle in angles:
            cand_x = max(0.03, min(0.97, target_x + r * math.cos(angle)))
            cand_y = max(0.03, min(0.97, target_y + r * math.sin(angle)))
            
            score = 0
            score -= r * 10  # Prefer closer
            
            min_dist = 1.0
            for pos in placed_positions:
                dist = math.hypot(pos['x'] - cand_x, pos['y'] - cand_y)
                min_dist = min(min_dist, dist)
            
            if min_dist < 0.040:
                score -= (0.040 - min_dist) * 100
            else:
                score += min_dist * 5
            
            edge_dist = min(cand_x, cand_y, 1 - cand_x, 1 - cand_y)
            if edge_dist < 0.05:
                score -= (0.05 - edge_dist) * 50
            
            if cand_x > target_x and cand_y < target_y:
                score += 5
            
            if score > best_cand['score']:
                best_cand = {'x': cand_x, 'y': cand_y, 'score': score}
    
    placed_positions.append({'x': best_cand['x'], 'y': best_cand['y']})
    
    # Calculate leader line length
    leader_length = math.hypot(best_cand['x'] - target_x, best_cand['y'] - target_y)
    
    placements.append({
        'anchor': {'x': target_x, 'y': target_y},
        'balloon': {'x': best_cand['x'], 'y': best_cand['y']},
        'leader_length': leader_length,
        'raw_text': item.get('rawText', '???'),
        'score': best_cand['score']
    })

print(f"Placed: {len(placements)} balloons")
print()

# Analyze placement quality
print("PLACEMENT QUALITY METRICS")
print("-"*80)

leader_lengths = [p['leader_length'] for p in placements]
avg_leader = sum(leader_lengths) / len(leader_lengths) if leader_lengths else 0
max_leader = max(leader_lengths) if leader_lengths else 0
min_leader = min(leader_lengths) if leader_lengths else 0

print(f"Leader line lengths (normalized coordinates):")
print(f"  Average: {avg_leader:.4f}")
print(f"  Maximum: {max_leader:.4f}")
print(f"  Minimum: {min_leader:.4f}")
print(f"  Median:  {sorted(leader_lengths)[len(leader_lengths)//2]:.4f}")
print()

# Count by length category
short = sum(1 for l in leader_lengths if l < 0.05)
medium = sum(1 for l in leader_lengths if 0.05 <= l < 0.10)
long = sum(1 for l in leader_lengths if 0.10 <= l < 0.15)
very_long = sum(1 for l in leader_lengths if l >= 0.15)

print(f"Distribution:")
print(f"  Short (<0.05):     {short:3} ({100*short/len(placements):.1f}%)")
print(f"  Medium (0.05-0.10): {medium:3} ({100*medium/len(placements):.1f}%)")
print(f"  Long (0.10-0.15):   {long:3} ({100*long/len(placements):.1f}%)")
print(f"  Very Long (>=0.15): {very_long:3} ({100*very_long/len(placements):.1f}%)")
print()

# Check for potential overlaps
print("OVERLAP ANALYSIS")
print("-"*80)

overlap_count = 0
balloon_radius = 0.02  # Approximate normalized radius

for i, p1 in enumerate(placements):
    for j, p2 in enumerate(placements[i+1:], i+1):
        dist = math.hypot(
            p1['balloon']['x'] - p2['balloon']['x'],
            p1['balloon']['y'] - p2['balloon']['y']
        )
        if dist < balloon_radius * 2.5:  # 2.5x radius threshold
            overlap_count += 1

print(f"Potential overlaps: {overlap_count}")
print(f"Overlap rate: {100*overlap_count/(len(placements)*(len(placements)-1)/2):.2f}% of pairs")
print()

# Show examples of long leaders
print("LONGEST LEADER LINES (Top 10)")
print("-"*80)
sorted_placements = sorted(placements, key=lambda p: p['leader_length'], reverse=True)
for i, p in enumerate(sorted_placements[:10]):
    print(f"{i+1:2}. {p['raw_text']:25} | Length: {p['leader_length']:.4f} | Anchor: ({p['anchor']['x']:.3f}, {p['anchor']['y']:.3f})")
print()

# Check for clustering issues
print("SPATIAL CLUSTERING ANALYSIS")
print("-"*80)

# Divide page into grid
grid_size = 10
grid = [[0 for _ in range(grid_size)] for _ in range(grid_size)]

for p in placements:
    grid_x = min(grid_size - 1, int(p['anchor']['x'] * grid_size))
    grid_y = min(grid_size - 1, int(p['anchor']['y'] * grid_size))
    grid[grid_y][grid_x] += 1

dense_cells = sum(1 for row in grid for count in row if count > 5)
total_cells = grid_size * grid_size
occupied_cells = sum(1 for row in grid for count in row if count > 0)

print(f"Grid analysis ({grid_size}x{grid_size} cells):")
print(f"  Occupied cells: {occupied_cells}/{total_cells} ({100*occupied_cells/total_cells:.1f}%)")
print(f"  Dense cells (>5 anchors): {dense_cells} ({100*dense_cells/total_cells:.1f}%)")
print()

max_density = max(max(row) for row in grid)
print(f"  Maximum density: {max_density} anchors in one cell")
print()

print("="*80)
print("SUMMARY")
print("="*80)
print(f"✓ {len(placements)} balloons placed")
print(f"⚠ Average leader length: {avg_leader:.4f} (normalized)")
print(f"⚠ {very_long} very long leaders (>=0.15)")
print(f"⚠ {overlap_count} potential overlaps")
print(f"⚠ {dense_cells} dense regions")
print()

if avg_leader > 0.08:
    print("✗ ISSUE: Average leader length is high - consider improving placement")
if very_long > len(placements) * 0.1:
    print("✗ ISSUE: Too many very long leaders (>10%)")
if overlap_count > len(placements) * 0.05:
    print("✗ ISSUE: High overlap rate")

