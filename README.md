# DIM-BALLOON: Automated Drawing Dimension Ballooning & Inspection Validation Platform
*Branch: `tanmay-protype` — Industrial Frictionless Edition for Valmet*

A production-grade, zero-touch industrial quality assurance application engineered to eliminate manual factory-floor data entry. The platform automatically converts complex 2D vector CAD exports and scanned raster engineering PDFs into interactive ballooned drawings, runs live deterministic tolerance math validation (Green/Yellow/Red), and exports FAIR/PPAP-compliant Excel spreadsheets and annotated PDFs with one click.

---

## 🌟 Core Architecture & Pipeline

```text
[ PDF Upload ] 
       │
       ▼ (<200ms Instant UI Handoff)
[ PyMuPDF Gatekeeper ] ─── (Vector Text Found?) ───► YES ───► [ Word-Level Vector Engine ] ──► (Instant / $0.00)
       │                                                                                             │
       NO (Scanned / Raster PDF)                                                                     │
       │                                                                                             │
       ▼                                                                                             │
[ OpenCV Edge Density Analyzer ]                                                                     │
       │                                                                                             │
       ├─ Low Density (<0.035) ──► [ 2x2 Grid + Gemini 3.6 Flash ]                                  │
       └─ High Density (≥0.035) ─► [ 3x3 Grid + Gemini 3.6 Flash ]                                  │
                                            │                                                        │
                                            ▼ (Multi-Key Failover Pool)                              │
                              [ Coordinate Normalization & Dedup ]                                   │
                                            │                                                        │
                                            └───────────────────────┬────────────────────────────────┘
                                                                    │
                                                                    ▼
                                               [ 32-Candidate Radial Spiral Search ]
                                                                    │
                                                                    ▼
                                                  [ PostgreSQL Storage (Neon) ]
                                                                    │
                                                                    ▼
                                             [ Fabric.js Resizable Canvas Cockpit ]
                                                                    │
                                                                    ▼
                                               [ 1-Click FAIR/PPAP Excel & PDF Export ]
⚡ Key Technical Innovations
1. The Smart Tri-Engine Router (pdf_extractor.py)
Stage 1 (Vector Fast-Track): Uses PyMuPDF word-level extraction + rotation matrix transformation (page.rotation_matrix) + CAD keyword exclusion filters + regex tolerance parser (25 ±0.1, 50 +0.1/-0.2). Rips through 90+ dimensions in < 1 second with 100% spatial precision and zero API cost.
Stage 2 (OpenCV Canny Complexity Analyzer): Computes edge density over rasterized page images to dynamically determine grid slicing (2x2 grid for sparse drawings, 3x3 grid for dense drawings).
Stage 3 (Vision AI with Multi-Key Failover Pool): Connects to Google Gemini 3.6 Flash via the official google-genai SDK in worker threads (asyncio.to_thread). Features an automated 8-key API rotation manager that intercepts HTTP 429 quota exhaustion errors and hot-swaps API keys in 0.5 seconds to prevent quota freezes.
2. Spatial Geometry: 32-Candidate Radial Spiral Placement
Text Anchor Lock: Locks the leader line start coordinate (leaderStartX, leaderStartY) to the physical text center.
Collision Avoidance: Computes 
4
 radii 
(
R
=
0.04
,
0.065
,
0.09
,
0.12
)
×
8
 compass directions 
(
0
∘
 to 
315
∘
)
4 radii (R=0.04,0.065,0.09,0.12)×8 compass directions (0 
∘
  to 315 
∘
 )
 to position the balloon node in clear canvas space without obscuring engineering callouts or overlapping adjacent balloons.
3. Frictionless Single-Click Cockpit
Zero Login Friction: No auth barriers or login gates—instant direct entry into the Drawings Hub and Workspace.
Non-Blocking Background Extraction: PDF uploads return in <200ms, dropping the inspector immediately onto the drawing canvas while Python processes dimensions in the background.
Resizable Split Workspace: Features an interactive vertical drag handle (GripVertical) allowing inspectors to freely resize the drawing viewport vs. the Characteristics Log table.
Visual Debug Mode: Press the D key on the canvas to toggle bounding box visualization (Green = Anchor Dot, Red = Detected Box, Blue = Balloon Center).
4. Deterministic Tolerance Engine & Reporting
Live Caliper Math Validation: Automatically computes nominal limits and categorizes physical caliper entries:
🟢 PASS: Measured value strictly within tolerance.
🟡 CHECK: Measured value near tolerance warning threshold.
🔴 FAIL: Measured value out of tolerance.
🔵 PENDING: Unmeasured characteristic.
1-Click FAIR/PPAP Excel Export (ExcelJS): Compiles session metadata, dimensions, tolerances, actual measurements, and conditional color formatting into a standardized inspection report.
Marked-Up Vector PDF (PyMuPDF): Generates high-res annotated engineering drawings with numbered balloon vectors and PASS/FAIL color coding.
🛠️ Microservices Stack
Service	Technologies
Frontend App (frontend/)	React 18, TypeScript, Vite, Tailwind CSS, Fabric.js v5, PDF.js, Zustand, Lucide Icons
Backend API (backend/)	Node.js, Express, TypeScript, Prisma ORM, Neon Serverless PostgreSQL, ExcelJS, Socket.io
PDF Vision Service (pdf-service/)	Python 3.10+, FastAPI, PyMuPDF (fitz), OpenCV, Pillow, Google GenAI SDK (gemini-3.6-flash)
🚀 Quick Start Guide
1. Python PDF Processing Microservice
code
Bash
cd pdf-service
python -m venv venv

# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
Configure pdf-service/.env:
code
Env
GEMINI_API_KEYS="your_key_1,your_key_2,your_key_3"
VISION_MODEL="gemini-3.6-flash"
CONCURRENCY_LIMIT=1
2. Backend API & PostgreSQL Database
code
Bash
cd backend
npm install
npx prisma db push
npm run dev
Configure backend/.env:
code
Env
PORT=5000
DATABASE_URL="postgresql://user:pass@ep-odd-heart...neon.tech/neondb?sslmode=require&connect_timeout=30"
PDF_SERVICE_URL="http://localhost:8000"
UPLOAD_DIR="./uploads"
REPORTS_DIR="./reports"
3. React Frontend
code
Bash
cd frontend
npm install
npm run dev
Open your browser at http://localhost:3000.
📄 License & Industrial Quality Compliance
Designed for industrial manufacturing quality control, First Article Inspection Reports (FAIR), and Production Part Approval Processes (PPAP) compliant with Valmet requirements.