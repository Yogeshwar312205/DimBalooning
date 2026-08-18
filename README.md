# Automated Dimension Ballooning & Inspection Validation Platform

A production-grade, microservice-based industrial quality-control application designed to digitalize 2D manufacturing PDF engineering drawings into interactive ballooned drawings, execute deterministic physical measurement validation, enable multi-user real-time collaboration, and export FAIR/PPAP compliant Excel and color-coded PDF inspection reports.

---

## 🌟 Key Architecture & Technical Features

### 1. Microservices Architecture
- **Frontend App (`frontend/`)**: Built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, **Fabric.js v5**, **PDF.js**, and **Zustand**.
- **Backend API (`backend/`)**: Built with **Node.js**, **Express**, **TypeScript**, **Prisma ORM**, **ExcelJS**, and **Socket.io**.
- **PDF Processing Service (`pdf-service/`)**: Built with **Python 3.10**, **FastAPI**, and **PyMuPDF (fitz)** for vector text extraction and drawing markup overlay rendering.

### 2. Microservice Interaction Workflow
```text
  [ React Browser App ] 
           │
           │  1. Upload PDF / Extract Text
           ▼
  [ Express Backend API (Port 5000) ]
           │
           │  2. Delegate Vector Extraction & PDF Markup
           ▼
  [ FastAPI PDF Service (Port 8000) ]
           │
           │  3. PyMuPDF Vector Processing & Regex Parsing
           ▼
  [ Prisma Database (dev.db) ]
```

### 3. Core Quality Control Engine Features
- **Interactive Fabric.js Canvas**: Overlay vector canvas with normalized `(x, y)` coordinate mapping to prevent visual distortion across zoom levels and window resizing.
- **Deterministic Nearest-Free Position Collision Avoidance**: Automatically detects overlaps when placing balloons and spirally shifts new balloons to the nearest clear space.
- **PyMuPDF Vector Text Extraction & Regex Parser**: Automatically extracts dimension text (`25 ± 0.10`, `Ø 50.00 +0.10/-0.05`, etc.) when clicking drawing features.
- **Graceful Manual Entry Fallback**: Provides a fallback modal dialog for non-vector, scanned, or complex title block dimensions.
- **Deterministic Tolerance Math Engine**: Calculates upper and lower bounds automatically and categorizes physical actual entries into:
  - `PASS` (Green): Measured value strictly inside nominal limits.
  - `CHECK` (Yellow): Measured value within warning threshold margin of upper/lower bounds.
  - `FAIL` (Red): Measured value out of tolerance bounds.
  - `PENDING` (Blue): Measured value pending inspector entry.
- **Real-Time WebSocket Synchronization**: Socket.io sync for multi-inspector presence and live balloon creation/movement updates.
- **Automated Report Engine**:
  - **Excel (ExcelJS)**: Professional FAIR (First Article Inspection Report) & PPAP compliant spreadsheet with green/yellow/red conditional formatting.
  - **Marked-Up PDF (PyMuPDF)**: Generates high-res annotated PDF drawings with numbered balloon vectors and PASS/CHECK/FAIL status highlights.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js >= 18.x
- Python >= 3.10
- Docker & Docker Compose (Optional for containerized run)

### Option A: Local Development Run

1. **Start Python PDF Processing Microservice**:
```bash
cd pdf-service
python -m venv venv
# On Windows:
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

2. **Initialize Backend API & Database**:
```bash
cd backend
npm install
npx prisma db push
npx ts-node prisma/seed.ts
npm run dev
```

3. **Start React Frontend**:
```bash
cd frontend
npm install
npm run dev
```

Open browser at `http://localhost:3000` (or `http://localhost:5000` for backend API).

---

### Option B: Docker Compose Deployment

Run the complete multi-service environment with one command:
```bash
docker-compose up --build
```
- **Frontend App**: `http://localhost:3000`
- **Backend API**: `http://localhost:5000`
- **FastAPI PDF Service**: `http://localhost:8000/docs`

---

## 🔑 Demo Login Credentials

The system comes pre-seeded with manufacturing QA roles:

| Role | Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **QA Inspector** | `inspector@factory.com` | `password123` | Session Creation, Ballooning, Actual Measurement Entry |
| **Chief Admin** | `admin@factory.com` | `password123` | Full System Access, Drawing Upload, User Management |
| **Mfg Engineer** | `engineer@factory.com` | `password123` | Engineering Drawing Upload & Review |
| **Auditor** | `viewer@factory.com` | `password123` | Read-only inspection report viewing |

---

## 📄 License & Attribution
Designed for enterprise manufacturing quality control, First Article Inspection Reports (FAIR), and Production Part Approval Processes (PPAP).
