1. Executive Context: The Evolution of the SystemThe project is transitioning from a purely manual interactive canvas into an AI-augmented, automated extraction platform while retaining the existing canvas UI as the presentation and verification layer.The Baseline (Existing Foundation): You have a working canvas where users upload a PDF, manually click on dimensions, assign sequential balloons, open a dialog to enter physical measurements, validate against tolerances, and export reports.  The Upgrade (New Autonomous Layer): An automated backend pipeline takes over the initial discovery and extraction work. When a drawing is uploaded, a multi-stage Vision AI pipeline detects the dimensions, extracts nominals and tolerances, calculates optimal balloon positions, and renders them automatically on the canvas.  The Core Principle: The existing manual system is not discarded; rather, it becomes the Review & Correction Interface (Human-in-the-Loop) where inspectors verify pre-extracted balloons and enter their physical caliper/CMM measurements.  2. Architectural Layering: New AI Pipeline on Existing StackThe table below illustrates how each component of the existing architecture is enhanced by the new AI and computer vision modules:System LayerBaseline ImplementationEnhanced Autonomous ImplementationPDF IngestionDirect render of PDF onto HTML5/Fabric.js canvas.  PDF converted to high-resolution raster image; scanned for title block metadata and partitioned into an overlapping 3x3 grid.Dimension DiscoveryUser visually finds and clicks each dimension.  Pre-filtering strips blank tiles; Vision LLMs extract nominals, tolerances, and relative bounding boxes across active tiles.Coordinate MappingUser click sets the anchor $(x_a, y_a)$ directly.Backend translates tile coordinates to global drawing coordinates, identifies leader line origins, and assigns collision-free anchor points.Balloon PlacementUser drops balloon; drag-and-drop handles overlap.System auto-places numbered balloons in adjacent whitespace, using existing canvas drag-and-drop purely for minor user adjustments.Tolerance ValidationInspector enters both nominals and actuals.  Nominals and tolerances are pre-populated into database records; inspector only inputs measured physical actuals.  Export & ReportingGenerates Excel inspection sheets and marked-up PDF.  Auto-populates FAIR/PPAP-compliant Excel reports and renders color-coded statuses (Green/Yellow/Red) on the PDF.  3. End-to-End System Pipeline[1. PDF Upload] 
       │
       ▼
[2. Global Pass (Macro)] ──► Extracts Title Block: Part No, Rev, General Tolerances
       │
       ▼
[3. Image Slicing] ───────► Divides image into 9 tiles (3x3) with a 15% overlap
       │
       ▼
[4. Pre-Filter Engine] ───► OpenCV checks edge density; skips empty/blank tiles
       │
       ▼
[5. Parallel Vision API] ─► Async Semaphore worker pool (3-4 concurrent requests)
       │                    Extracts: Nominal, Upper/Lower Tol, Units, Local Bounding Box
       │
       ▼
[6. Deduplication Engine] ─► Merges duplicates from overlapping tile boundaries
       │
       ▼
[7. Canvas Hydration] ────► Streamed via WebSockets: Balloons dynamically appear on screen
       │
       ▼
[8. Shop-Floor Entry] ────► Inspector taps pre-populated balloon ──► Types Actual Measurement
       │
       ▼
[9. Tolerance Engine] ────► Auto-evaluates Green (OK), Yellow (Check), Red (Fail)
       │
       ▼
[10. Export Suite] ───────► Download Final Color-Coded PDF & Structured Excel Report
4. Key Engineering Advantages of this ApproachZero Wasted Effort: Every piece of code already written for canvas rendering, drag-and-drop repositioning, tolerance checking, and PDF/Excel generation remains intact.High Accuracy at Low Cost: Using high-resolution image tiling avoids LLM downsampling errors on dense GD&T symbols, while OpenCV pruning prevents paying for API calls on blank drawing areas.Fail-Safe Reliability: If the AI model struggles with an unusual symbol or hand-drawn markup, the inspector can instantly use the existing manual canvas tools to add, edit, or adjust the balloon without blocking the inspection workflow.