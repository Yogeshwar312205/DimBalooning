// High-detail vector SVG representation of Valmet Industrial Machined Console Drawing
export const VALMET_SAMPLE_DRAWING_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" width="1000" height="700">
  <defs>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="1"/>
    </pattern>
    <!-- Arrowhead markers -->
    <marker id="arrow-start" markerWidth="8" markerHeight="8" refX="2" refY="4" orient="auto">
      <path d="M 8 0 L 0 4 L 8 8 Z" fill="#334155" />
    </marker>
    <marker id="arrow-end" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M 0 0 L 8 4 L 0 8 Z" fill="#334155" />
    </marker>
  </defs>

  <!-- Background Grid & Paper -->
  <rect width="1000" height="700" fill="#ffffff" />
  <rect width="1000" height="700" fill="url(#grid)" />
  
  <!-- Outer Title Border Frame -->
  <rect x="25" y="25" width="950" height="650" fill="none" stroke="#0f172a" stroke-width="2.5" />
  <rect x="30" y="30" width="940" height="640" fill="none" stroke="#334155" stroke-width="1" />

  <!-- Drawing Title Block (Bottom Right) -->
  <g transform="translate(620, 560)">
    <rect x="0" y="0" width="345" height="105" fill="#f8fafc" stroke="#0f172a" stroke-width="1.8" />
    <line x1="0" y1="35" x2="345" y2="35" stroke="#334155" stroke-width="1" />
    <line x1="0" y1="70" x2="345" y2="70" stroke="#334155" stroke-width="1" />
    <line x1="170" y1="0" x2="170" y2="105" stroke="#334155" stroke-width="1" />

    <text x="10" y="22" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#475569">CUSTOMER:</text>
    <text x="75" y="22" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#0f172a">VALMET CORP.</text>

    <text x="180" y="22" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#475569">DWG NO:</text>
    <text x="240" y="22" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#0f172a">94050440201</text>

    <text x="10" y="57" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#475569">PART NAME:</text>
    <text x="80" y="57" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#0f172a">Machined Console</text>

    <text x="180" y="57" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#475569">ARTICLE NO:</text>
    <text x="255" y="57" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#0f172a">13523526</text>

    <text x="10" y="92" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#475569">REV / DATE:</text>
    <text x="85" y="92" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#0284c7">Rev 05 / 2026</text>

    <text x="180" y="92" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#475569">UNITS / SCALE:</text>
    <text x="270" y="92" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#0f172a">mm / 1:1</text>
  </g>

  <!-- Part Geometry (3-arm Cast Console) -->
  <g transform="translate(180, 80)">
    <!-- Central Hub -->
    <circle cx="280" cy="240" r="55" fill="#f8fafc" stroke="#1e293b" stroke-width="2.5" />
    <circle cx="280" cy="240" r="32" fill="#ffffff" stroke="#1e293b" stroke-width="2" />
    <circle cx="280" cy="240" r="18" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.5" />

    <!-- Centerlines -->
    <line x1="190" y1="240" x2="370" y2="240" stroke="#64748b" stroke-width="1" stroke-dasharray="8,4,2,4" />
    <line x1="280" y1="150" x2="280" y2="330" stroke="#64748b" stroke-width="1" stroke-dasharray="8,4,2,4" />

    <!-- Left Arm -->
    <path d="M 230 220 L 70 120 C 50 105 30 135 45 155 L 235 255 Z" fill="#f1f5f9" stroke="#1e293b" stroke-width="2.5" />
    <circle cx="65" cy="135" r="28" fill="#ffffff" stroke="#1e293b" stroke-width="2" />
    <circle cx="65" cy="135" r="14" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.5" />
    <line x1="20" y1="135" x2="110" y2="135" stroke="#64748b" stroke-width="1" stroke-dasharray="6,3,2,3" />
    <line x1="65" y1="90" x2="65" y2="180" stroke="#64748b" stroke-width="1" stroke-dasharray="6,3,2,3" />

    <!-- Right Arm -->
    <path d="M 330 230 L 480 200 C 505 195 505 235 480 240 L 330 260 Z" fill="#f1f5f9" stroke="#1e293b" stroke-width="2.5" />
    <circle cx="485" cy="220" r="24" fill="#ffffff" stroke="#1e293b" stroke-width="2" />
    <circle cx="485" cy="220" r="12" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.5" />
    <line x1="445" y1="220" x2="525" y2="220" stroke="#64748b" stroke-width="1" stroke-dasharray="6,3,2,3" />
    <line x1="485" y1="180" x2="485" y2="260" stroke="#64748b" stroke-width="1" stroke-dasharray="6,3,2,3" />

    <!-- Bottom Arm -->
    <path d="M 265 290 L 265 420 C 265 445 305 445 305 420 L 305 290 Z" fill="#f1f5f9" stroke="#1e293b" stroke-width="2.5" />
    <circle cx="285" cy="425" r="26" fill="#ffffff" stroke="#1e293b" stroke-width="2" />
    <circle cx="285" cy="425" r="13" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.5" />
    <line x1="240" y1="425" x2="330" y2="425" stroke="#64748b" stroke-width="1" stroke-dasharray="6,3,2,3" />
    <line x1="285" y1="380" x2="285" y2="470" stroke="#64748b" stroke-width="1" stroke-dasharray="6,3,2,3" />
  </g>

  <!-- Dimension Callouts & Extension Lines -->
  <!-- Dim 1: Main Bore Diameter (Ø 38.40 ± 0.05) -->
  <g>
    <line x1="460" y1="320" x2="530" y2="280" stroke="#334155" stroke-width="1.4" marker-start="url(#arrow-start)" />
    <line x1="530" y1="280" x2="620" y2="280" stroke="#334155" stroke-width="1.4" />
    <rect x="535" y="262" width="95" height="16" fill="#ffffff" opacity="0.85" />
    <text x="540" y="275" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#0f172a">Ø38.40±0.05</text>
  </g>

  <!-- Dim 2: Left Center Distance (41.0 ± 0.20) -->
  <g>
    <line x1="245" y1="170" x2="245" y2="90" stroke="#64748b" stroke-width="1" />
    <line x1="460" y1="280" x2="460" y2="90" stroke="#64748b" stroke-width="1" />
    <line x1="245" y1="100" x2="460" y2="100" stroke="#334155" stroke-width="1.4" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)" />
    <rect x="315" y="88" width="80" height="18" fill="#ffffff" />
    <text x="320" y="103" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#0f172a">41.0±0.20</text>
  </g>

  <!-- Dim 3: Right Hole Center Distance (112.0 ± 0.15) -->
  <g>
    <line x1="460" y1="320" x2="460" y2="400" stroke="#64748b" stroke-width="1" />
    <line x1="665" y1="300" x2="665" y2="400" stroke="#64748b" stroke-width="1" />
    <line x1="460" y1="390" x2="665" y2="390" stroke="#334155" stroke-width="1.4" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)" />
    <rect x="525" y="378" width="85" height="18" fill="#ffffff" />
    <text x="530" y="393" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#0f172a">112.0±0.15</text>
  </g>

  <!-- Dim 4: Bottom Hole Vertical Distance (92.0 ± 0.15) -->
  <g>
    <line x1="460" y1="320" x2="400" y2="320" stroke="#64748b" stroke-width="1" />
    <line x1="465" y1="505" x2="400" y2="505" stroke="#64748b" stroke-width="1" />
    <line x1="410" y1="320" x2="410" y2="505" stroke="#334155" stroke-width="1.4" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)" />
    <rect x="365" y="405" width="85" height="18" fill="#ffffff" transform="rotate(-90 405 410)" />
    <text x="368" y="407" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#0f172a" transform="rotate(-90 410 407)">92.0±0.15</text>
  </g>

  <!-- Dim 5: Tapping Hole Center Distance (65.0 ± 0.20) -->
  <g>
    <line x1="245" y1="215" x2="160" y2="215" stroke="#64748b" stroke-width="1" />
    <line x1="465" y1="505" x2="160" y2="505" stroke="#64748b" stroke-width="1" />
    <line x1="170" y1="215" x2="170" y2="505" stroke="#334155" stroke-width="1.4" marker-start="url(#arrow-start)" marker-end="url(#arrow-end)" />
    <rect x="125" y="350" width="85" height="18" fill="#ffffff" transform="rotate(-90 170 350)" />
    <text x="128" y="350" font-family="'Courier New', monospace" font-size="13" font-weight="bold" fill="#0f172a" transform="rotate(-90 170 350)">65.0±0.20</text>
  </g>

  <!-- General Inspection Instructions Badge -->
  <g transform="translate(45, 590)">
    <rect x="0" y="0" width="300" height="65" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" rx="4" />
    <text x="10" y="18" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#0284c7">QUALITY INSPECTION SPECIFICATION:</text>
    <text x="10" y="34" font-family="Arial, sans-serif" font-size="9" fill="#475569">• All dimensions in mm unless specified</text>
    <text x="10" y="48" font-family="Arial, sans-serif" font-size="9" fill="#475569">• Cast surface tolerance ISO 8062-3 - DCTG 9</text>
  </g>
</svg>
`;

export interface PreloadPresetItem {
  balloonNumber: number;
  dimensionName: string;
  nominalValue: number;
  upperTolerance: number;
  lowerTolerance: number;
  actualValue: number | null;
  unit: string;
  x: number; // normalized [0..1]
  y: number; // normalized [0..1]
  leaderStartX: number;
  leaderStartY: number;
}

export const SAMPLE_PRELOADED_BALLOONS: PreloadPresetItem[] = [
  {
    balloonNumber: 1,
    dimensionName: 'Main Hub Bore Diameter',
    nominalValue: 38.40,
    upperTolerance: 0.05,
    lowerTolerance: -0.05,
    actualValue: 38.42, // PASS
    unit: 'mm',
    x: 0.63,
    y: 0.28,
    leaderStartX: 0.46,
    leaderStartY: 0.32
  },
  {
    balloonNumber: 2,
    dimensionName: 'Left Arm Center Distance',
    nominalValue: 41.00,
    upperTolerance: 0.20,
    lowerTolerance: -0.20,
    actualValue: 41.18, // CHECK (close to +0.20 bound)
    unit: 'mm',
    x: 0.36,
    y: 0.06,
    leaderStartX: 0.36,
    leaderStartY: 0.14
  },
  {
    balloonNumber: 3,
    dimensionName: 'Right Hole Center Distance',
    nominalValue: 112.00,
    upperTolerance: 0.15,
    lowerTolerance: -0.15,
    actualValue: 112.24, // FAIL (exceeds +0.15 bound)
    unit: 'mm',
    x: 0.56,
    y: 0.47,
    leaderStartX: 0.56,
    leaderStartY: 0.56
  },
  {
    balloonNumber: 4,
    dimensionName: 'Bottom Arm Vertical Offset',
    nominalValue: 92.00,
    upperTolerance: 0.15,
    lowerTolerance: -0.15,
    actualValue: null, // PENDING
    unit: 'mm',
    x: 0.32,
    y: 0.58,
    leaderStartX: 0.41,
    leaderStartY: 0.58
  },
  {
    balloonNumber: 5,
    dimensionName: 'Tapping Hole Center Distance',
    nominalValue: 65.00,
    upperTolerance: 0.20,
    lowerTolerance: -0.20,
    actualValue: 64.95, // PASS
    unit: 'mm',
    x: 0.09,
    y: 0.50,
    leaderStartX: 0.17,
    leaderStartY: 0.50
  }
];
