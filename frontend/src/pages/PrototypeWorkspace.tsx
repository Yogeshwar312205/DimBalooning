import React, { useState, useRef, useEffect } from 'react';
import { fabric } from 'fabric';
import * as pdfjsLib from 'pdfjs-dist';
import {
  Upload,
  FileSpreadsheet,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  Layers,
  MousePointer,
  HelpCircle,
  FileText,
  Sliders
} from 'lucide-react';
import { calculateTolerance, ToleranceResult } from '../utils/toleranceEngine';
import { exportInspectionToExcel, ExportBalloonData } from '../utils/clientExcelExport';
import { VALMET_SAMPLE_DRAWING_SVG, SAMPLE_PRELOADED_BALLOONS } from '../assets/sampleDrawings';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface PrototypeBalloon {
  id: string;
  balloonNumber: number;
  dimensionName: string;
  nominalValue: number | null;
  upperTolerance: number | null;
  lowerTolerance: number | null;
  lowerLimit: number | null;
  upperLimit: number | null;
  actualValue: number | null;
  unit: string;
  status: 'PASS' | 'CHECK' | 'FAIL' | 'PENDING';
  remarks?: string;
  // Normalized coordinates [0..1]
  x: number;
  y: number;
  leaderStartX?: number;
  leaderStartY?: number;
}

const STATUS_COLORS: Record<string, { fill: string; border: string; text: string; label: string; badgeBg: string }> = {
  PASS: {
    fill: '#D1FAE5',
    border: '#10B981',
    text: '#065F46',
    label: 'OK / PASS',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700'
  },
  CHECK: {
    fill: '#FEF3C7',
    border: '#F59E0B',
    text: '#92400E',
    label: 'TO CHECK',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700'
  },
  FAIL: {
    fill: '#FEE2E2',
    border: '#EF4444',
    text: '#991B1B',
    label: 'OUT OF SPEC',
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-700'
  },
  PENDING: {
    fill: '#DBEAFE',
    border: '#3B82F6',
    text: '#1E40AF',
    label: 'PENDING',
    badgeBg: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-700'
  }
};

export const PrototypeWorkspace: React.FC = () => {
  // Drawing Canvas State
  const [drawingType, setDrawingType] = useState<'SAMPLE_SVG' | 'IMAGE' | 'PDF'>('SAMPLE_SVG');
  const [drawingSrc, setDrawingSrc] = useState<string>('');
  const [drawingName, setDrawingName] = useState<string>('Valmet Machined Console (VAL-8492)');
  const [partNumber, setPartNumber] = useState<string>('VAL-8492-MK2');
  const [revision, setRevision] = useState<string>('Rev 05');

  // Drawing Viewport Canvas
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const [canvasDim, setCanvasDim] = useState<{ width: number; height: number }>({ width: 1000, height: 700 });
  const [scale, setScale] = useState<number>(1.0);
  const [activeTool, setActiveTool] = useState<'BALLOON' | 'SELECT'>('BALLOON');

  // Inspection Balloons
  const [balloons, setBalloons] = useState<PrototypeBalloon[]>([]);
  const [selectedBalloonId, setSelectedBalloonId] = useState<string | null>(null);

  // Mini-Dialog Modal for Balloon editing
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [modalBalloon, setModalBalloon] = useState<PrototypeBalloon | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize Drawing on Mount with Sample Drawing
  useEffect(() => {
    loadSampleDrawing();
  }, []);

  const loadSampleDrawing = () => {
    setDrawingType('SAMPLE_SVG');
    setDrawingName('Valmet Machined Console (DWG 94050440201)');
    setPartNumber('VAL-8492-MK2');
    setRevision('Rev 05');

    const svgBlob = new Blob([VALMET_SAMPLE_DRAWING_SVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    setDrawingSrc(url);

    // Pre-populate sample Valmet balloons
    const initialBalloons: PrototypeBalloon[] = SAMPLE_PRELOADED_BALLOONS.map((p) => {
      const tol = calculateTolerance(p.nominalValue, p.upperTolerance, p.lowerTolerance, p.actualValue);
      return {
        id: `b-${p.balloonNumber}-${Date.now()}`,
        balloonNumber: p.balloonNumber,
        dimensionName: p.dimensionName,
        nominalValue: p.nominalValue,
        upperTolerance: p.upperTolerance,
        lowerTolerance: p.lowerTolerance,
        lowerLimit: tol.lowerLimit,
        upperLimit: tol.upperLimit,
        actualValue: p.actualValue,
        unit: p.unit,
        status: tol.status,
        x: p.x,
        y: p.y,
        leaderStartX: p.leaderStartX,
        leaderStartY: p.leaderStartY
      };
    });

    setBalloons(initialBalloons);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    setDrawingName(file.name.replace(/\.[^/.]+$/, ''));
    setPartNumber(file.name.slice(0, 12).toUpperCase());

    if (fileExt === 'pdf') {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const typedArray = new Uint8Array(event.target?.result as ArrayBuffer);
        try {
          const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = bgCanvasRef.current;
          if (canvas) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d')!;
            await page.render({ canvasContext: ctx, viewport }).promise;
            setCanvasDim({ width: viewport.width, height: viewport.height });
            setDrawingType('PDF');
            setBalloons([]);
          }
        } catch (err) {
          alert('Failed to parse PDF drawing');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // Image (PNG, JPG, SVG)
      const url = URL.createObjectURL(file);
      setDrawingSrc(url);
      setDrawingType('IMAGE');
      setBalloons([]);
    }
  };

  // Render Background Drawing Image / SVG
  useEffect(() => {
    if (drawingType === 'PDF') return;
    if (!drawingSrc || !bgCanvasRef.current) return;

    const img = new Image();
    img.src = drawingSrc;
    img.onload = () => {
      const canvas = bgCanvasRef.current;
      if (!canvas) return;
      const targetW = img.width || 1000;
      const targetH = img.height || 700;
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
      }
      setCanvasDim({ width: targetW, height: targetH });
    };
  }, [drawingSrc, drawingType]);

  // Setup Fabric.js Overlay Canvas
  useEffect(() => {
    if (!overlayCanvasRef.current) return;

    const fc = new fabric.Canvas(overlayCanvasRef.current, {
      width: canvasDim.width,
      height: canvasDim.height,
      selection: activeTool === 'SELECT',
      hoverCursor: activeTool === 'BALLOON' ? 'crosshair' : 'pointer'
    });

    fabricCanvasRef.current = fc;

    return () => {
      fc.dispose();
      fabricCanvasRef.current = null;
    };
  }, [canvasDim]);

  // Update cursor and selection mode when active tool changes
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    fc.defaultCursor = activeTool === 'BALLOON' ? 'crosshair' : 'default';
    fc.hoverCursor = activeTool === 'BALLOON' ? 'crosshair' : 'pointer';
    fc.selection = activeTool === 'SELECT';
  }, [activeTool]);

  // Collision Avoidance: Find Nearest Free Position
  const findCollisionFreePosition = (targetX: number, targetY: number, existing: PrototypeBalloon[]) => {
    const radius = 22;
    let finalX = targetX;
    let finalY = targetY;
    let attempts = 0;
    let angle = 0;

    while (attempts < 16) {
      let isColliding = false;
      for (const b of existing) {
        const bx = b.x * canvasDim.width;
        const by = b.y * canvasDim.height;
        const dist = Math.hypot(finalX - bx, finalY - by);
        if (dist < radius * 2.2) {
          isColliding = true;
          break;
        }
      }

      if (!isColliding) return { x: finalX, y: finalY };

      attempts++;
      angle += Math.PI / 4;
      const distance = radius * 2.5 * Math.ceil(attempts / 8);
      finalX = targetX + Math.cos(angle) * distance;
      finalY = targetY + Math.sin(angle) * distance;

      finalX = Math.max(radius + 5, Math.min(canvasDim.width - radius - 5, finalX));
      finalY = Math.max(radius + 5, Math.min(canvasDim.height - radius - 5, finalY));
    }

    return { x: targetX, y: targetY };
  };

  // Handle Canvas Click to add Balloon
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    const handleMouseDown = (opt: fabric.IEvent) => {
      if (activeTool !== 'BALLOON') return;

      const pointer = fc.getPointer(opt.e);
      const clickedX = pointer.x;
      const clickedY = pointer.y;

      const freePos = findCollisionFreePosition(clickedX, clickedY, balloons);

      // Determine next sequential balloon number
      const nextNum = balloons.length > 0 ? Math.max(...balloons.map((b) => b.balloonNumber)) + 1 : 1;

      const newBalloon: PrototypeBalloon = {
        id: `balloon-${nextNum}-${Date.now()}`,
        balloonNumber: nextNum,
        dimensionName: `Dimension #${nextNum}`,
        nominalValue: 25.0,
        upperTolerance: 0.1,
        lowerTolerance: -0.1,
        lowerLimit: 24.9,
        upperLimit: 25.1,
        actualValue: null,
        unit: 'mm',
        status: 'PENDING',
        x: freePos.x / canvasDim.width,
        y: freePos.y / canvasDim.height,
        leaderStartX: clickedX / canvasDim.width,
        leaderStartY: clickedY / canvasDim.height
      };

      setBalloons((prev) => [...prev, newBalloon]);
      setSelectedBalloonId(newBalloon.id);
      setModalBalloon(newBalloon);
      setEditModalOpen(true);
    };

    fc.on('mouse:down', handleMouseDown);
    return () => {
      fc.off('mouse:down', handleMouseDown);
    };
  }, [activeTool, balloons, canvasDim]);

  // Render Balloons onto Canvas Overlay
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    fc.clear();

    balloons.forEach((b) => {
      const px = b.x * canvasDim.width;
      const py = b.y * canvasDim.height;
      const isSelected = b.id === selectedBalloonId;
      const colorScheme = STATUS_COLORS[b.status] || STATUS_COLORS.PENDING;

      let leaderLine: fabric.Line | null = null;
      let targetDot: fabric.Circle | null = null;

      const hasLeader = b.leaderStartX !== undefined && b.leaderStartY !== undefined;
      const lx = hasLeader ? b.leaderStartX! * canvasDim.width : px;
      const ly = hasLeader ? b.leaderStartY! * canvasDim.height : py;

      const dist = Math.hypot(lx - px, ly - py);

      if (dist > 3) {
        // Dimension Anchor Dot on Drawing
        targetDot = new fabric.Circle({
          left: lx,
          top: ly,
          radius: 3.5,
          fill: colorScheme.border,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false
        });

        // Stretchable Leader Line
        leaderLine = new fabric.Line([lx, ly, px, py], {
          stroke: colorScheme.border,
          strokeWidth: 2,
          strokeDashArray: [4, 4],
          selectable: false,
          evented: false
        });

        fc.add(targetDot);
        fc.add(leaderLine);
      }

      // Circle Balloon
      const circle = new fabric.Circle({
        radius: 17,
        fill: colorScheme.fill,
        stroke: isSelected ? '#2563EB' : colorScheme.border,
        strokeWidth: isSelected ? 3.5 : 2.5,
        originX: 'center',
        originY: 'center',
        shadow: isSelected ? new fabric.Shadow({ color: 'rgba(37, 99, 235, 0.6)', blur: 14 }) : undefined
      });

      // Balloon Number Text
      const text = new fabric.Text(String(b.balloonNumber), {
        fontSize: String(b.balloonNumber).length > 2 ? 11 : 13,
        fontWeight: 'bold',
        fill: colorScheme.text,
        fontFamily: 'Inter, Arial, sans-serif',
        originX: 'center',
        originY: 'center'
      });

      const balloonGroup = new fabric.Group([circle, text], {
        left: px,
        top: py,
        originX: 'center',
        originY: 'center',
        hasControls: false,
        hasBorders: false,
        selectable: activeTool === 'SELECT',
        data: { balloonId: b.id }
      });

      balloonGroup.on('mousedown', () => {
        setSelectedBalloonId(b.id);
      });

      balloonGroup.on('mousedblclick', () => {
        setModalBalloon(b);
        setEditModalOpen(true);
      });

      balloonGroup.on('moving', () => {
        if (leaderLine) {
          const currentPx = balloonGroup.left || px;
          const currentPy = balloonGroup.top || py;
          leaderLine.set({ x2: currentPx, y2: currentPy });
          fc.renderAll();
        }
      });

      balloonGroup.on('modified', () => {
        const newPx = balloonGroup.left || px;
        const newPy = balloonGroup.top || py;

        const newNormX = Math.max(0.01, Math.min(0.99, newPx / canvasDim.width));
        const newNormY = Math.max(0.01, Math.min(0.99, newPy / canvasDim.height));

        setBalloons((prev) =>
          prev.map((item) => (item.id === b.id ? { ...item, x: newNormX, y: newNormY } : item))
        );
      });

      fc.add(balloonGroup);
    });

    fc.renderAll();
  }, [balloons, selectedBalloonId, activeTool, canvasDim]);

  // Update a single balloon's properties and re-calculate tolerance status
  const updateBalloonData = (
    id: string,
    updates: Partial<PrototypeBalloon>
  ) => {
    setBalloons((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const updated = { ...b, ...updates };

        // Run tolerance validation
        const tolResult: ToleranceResult = calculateTolerance(
          updated.nominalValue,
          updated.upperTolerance,
          updated.lowerTolerance,
          updated.actualValue
        );

        return {
          ...updated,
          lowerLimit: tolResult.lowerLimit,
          upperLimit: tolResult.upperLimit,
          status: tolResult.status
        };
      })
    );
  };

  const deleteBalloon = (id: string) => {
    setBalloons((prev) => prev.filter((b) => b.id !== id));
    if (selectedBalloonId === id) setSelectedBalloonId(null);
  };

  const handleExport = async () => {
    if (balloons.length === 0) {
      alert('Please add at least one dimension balloon before exporting.');
      return;
    }

    const exportItems: ExportBalloonData[] = balloons.map((b) => ({
      balloonNumber: b.balloonNumber,
      dimensionName: b.dimensionName,
      nominalValue: b.nominalValue,
      upperTolerance: b.upperTolerance,
      lowerTolerance: b.lowerTolerance,
      lowerLimit: b.lowerLimit,
      upperLimit: b.upperLimit,
      actualValue: b.actualValue,
      unit: b.unit,
      status: b.status,
      remarks: b.remarks
    }));

    await exportInspectionToExcel(
      {
        companyName: 'Valmet Quality Assurance Platform',
        partName: drawingName,
        partNumber: partNumber,
        drawingRef: drawingName,
        revision: revision,
        inspectorName: 'Shop Floor QA Inspector',
        inspectionDate: new Date().toLocaleDateString()
      },
      exportItems
    );
  };

  // Summary Metrics Counts
  const passCount = balloons.filter((b) => b.status === 'PASS').length;
  const checkCount = balloons.filter((b) => b.status === 'CHECK').length;
  const failCount = balloons.filter((b) => b.status === 'FAIL').length;
  const pendingCount = balloons.filter((b) => b.status === 'PENDING').length;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans select-none">
      {/* 1. Header Toolbar Banner */}
      <header className="h-16 px-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                  Valmet Dimension Ballooning & Inspection Tool
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono">
                  Live Prototype
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Drawing: <strong className="text-slate-800 dark:text-slate-200">{drawingName}</strong> ({partNumber} - {revision})
              </p>
            </div>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.png,.jpg,.jpeg,.svg"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all shadow-sm"
          >
            <Upload className="w-4 h-4 text-blue-500" />
            <span>Upload PDF / Drawing</span>
          </button>

          <button
            onClick={loadSampleDrawing}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Load Valmet Sample</span>
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Inspection Excel (.xlsx)</span>
          </button>
        </div>
      </header>

      {/* 2. Main Split View: Canvas on Left, Inspection Table on Right */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Side: Interactive Engineering Canvas */}
        <div className="flex-1 flex flex-col bg-slate-200 dark:bg-slate-950 overflow-hidden relative border-r border-slate-300 dark:border-slate-800">
          {/* Floating Canvas Action Bar */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-xl">
            {/* Tool Mode Buttons */}
            <button
              onClick={() => setActiveTool('BALLOON')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTool === 'BALLOON'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Click on drawing to place dimension balloon"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Balloon</span>
            </button>

            <button
              onClick={() => setActiveTool('SELECT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTool === 'SELECT'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Select & drag balloons to stretch leader lines"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Select & Move</span>
            </button>

            <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

            {/* Zoom controls */}
            <button
              onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              onClick={() => setScale((s) => Math.max(0.4, s - 0.15))}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              onClick={() => setScale(1.0)}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-mono font-bold"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 px-2">
              {Math.round(scale * 100)}%
            </span>
          </div>

          {/* Canvas Viewport Scroll Area */}
          <div className="flex-1 overflow-auto p-8 flex items-center justify-center relative">
            <div
              className="relative inline-block bg-white shadow-2xl rounded border border-slate-300 dark:border-slate-800 transition-transform origin-center"
              style={{
                transform: `scale(${scale})`,
                width: `${canvasDim.width}px`,
                height: `${canvasDim.height}px`
              }}
            >
              {/* Background Drawing Raster */}
              <canvas ref={bgCanvasRef} className="block absolute top-0 left-0" />

              {/* Interactive Vector Balloon Fabric Overlay */}
              <div className="absolute top-0 left-0 pointer-events-auto">
                <canvas ref={overlayCanvasRef} />
              </div>
            </div>
          </div>

          {/* Quick Helper Footer */}
          <div className="p-3 bg-white/70 dark:bg-slate-900/70 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                <span>Green = OK (In Spec)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                <span>Yellow = To Check (10% Boundary)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                <span>Red = Out of Tolerance</span>
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              Tip: Drag balloon away to pull leader line without covering dimension text
            </span>
          </div>
        </div>

        {/* Right Side: Inspection Characteristic Table */}
        <div className="w-full lg:w-[540px] xl:w-[600px] flex flex-col bg-white dark:bg-slate-900 shrink-0 overflow-hidden">
          {/* Status Metrics Bar */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Inspection Log & Tolerance Engine
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live physical reading evaluation
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800">
                {passCount} OK
              </span>
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800">
                {checkCount} Check
              </span>
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800">
                {failCount} Fail
              </span>
            </div>
          </div>

          {/* Table Area */}
          <div className="flex-1 overflow-auto">
            {balloons.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
                <Sliders className="w-10 h-10 text-slate-400 dark:text-slate-600" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  No Dimension Balloons Placed
                </h4>
                <p className="text-xs max-w-xs text-slate-500">
                  Click <strong>"Add Balloon"</strong> on the top left, then click any dimension on the engineering drawing.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-800 font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">#</th>
                    <th className="py-2.5 px-3">Dimension</th>
                    <th className="py-2.5 px-3 text-right">Nominal</th>
                    <th className="py-2.5 px-3 text-right">Tol</th>
                    <th className="py-2.5 px-3 text-right">Limits</th>
                    <th className="py-2.5 px-3 text-center min-w-[110px]">Actual Reading</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-2 text-center w-8"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  {balloons.map((b) => {
                    const isSelected = b.id === selectedBalloonId;
                    const statusInfo = STATUS_COLORS[b.status] || STATUS_COLORS.PENDING;

                    return (
                      <tr
                        key={b.id}
                        onClick={() => setSelectedBalloonId(b.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Balloon Badge */}
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className="w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-white text-xs shadow-sm"
                            style={{ backgroundColor: statusInfo.border }}
                          >
                            {b.balloonNumber}
                          </span>
                        </td>

                        {/* Characteristic Name */}
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-800 dark:text-slate-200">
                          {b.dimensionName}
                        </td>

                        {/* Nominal */}
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-900 dark:text-white">
                          {b.nominalValue !== null ? b.nominalValue.toFixed(2) : '-'}
                        </td>

                        {/* Tolerance */}
                        <td className="py-2.5 px-3 text-right text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold block">
                            +{b.upperTolerance?.toFixed(2) ?? '0.00'}
                          </span>
                          <span className="text-rose-600 dark:text-rose-400 font-bold block">
                            {b.lowerTolerance?.toFixed(2) ?? '0.00'}
                          </span>
                        </td>

                        {/* Lower / Upper Limits */}
                        <td className="py-2.5 px-3 text-right text-[10px] text-slate-500 dark:text-slate-400">
                          <div>L: {b.lowerLimit?.toFixed(2) ?? '-'}</div>
                          <div>U: {b.upperLimit?.toFixed(2) ?? '-'}</div>
                        </td>

                        {/* Actual Physical Input */}
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            step="any"
                            value={b.actualValue !== null && b.actualValue !== undefined ? b.actualValue : ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : parseFloat(e.target.value);
                              updateBalloonData(b.id, { actualValue: isNaN(val as number) ? null : val });
                            }}
                            placeholder="Reading..."
                            className="w-24 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-center font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 shadow-sm"
                          />
                        </td>

                        {/* Status Badge */}
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusInfo.badgeBg}`}
                          >
                            {statusInfo.label}
                          </span>
                        </td>

                        {/* Delete Action */}
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBalloon(b.id);
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete Balloon"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Quick Preload Actions */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between text-xs">
            <span className="font-mono text-slate-500">
              Total: <strong>{balloons.length}</strong> Dimensions
            </span>

            <button
              onClick={() => {
                if (balloons.length === 0) return;
                // Pre-fill realistic actuals for quick demonstration
                setBalloons((prev) =>
                  prev.map((b, idx) => {
                    const demoVals = [38.42, 41.18, 112.24, 91.98, 64.95];
                    const val = demoVals[idx % demoVals.length];
                    const tol = calculateTolerance(b.nominalValue, b.upperTolerance, b.lowerTolerance, val);
                    return {
                      ...b,
                      actualValue: val,
                      status: tol.status,
                      lowerLimit: tol.lowerLimit,
                      upperLimit: tol.upperLimit
                    };
                  })
                );
              }}
              className="text-blue-600 dark:text-cyan-400 font-semibold hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Simulate Physical Readings</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Fast Edit Modal for Dimension Nominal & Tolerance Limits */}
      {editModalOpen && modalBalloon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs inline-flex items-center justify-center font-bold">
                  {modalBalloon.balloonNumber}
                </span>
                Configure Dimension Balloon
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                  Dimension Feature Name
                </label>
                <input
                  type="text"
                  value={modalBalloon.dimensionName}
                  onChange={(e) => setModalBalloon({ ...modalBalloon, dimensionName: e.target.value })}
                  placeholder="e.g. Bore Diameter / Center Distance"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                    Nominal (mm)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={modalBalloon.nominalValue ?? ''}
                    onChange={(e) =>
                      setModalBalloon({
                        ...modalBalloon,
                        nominalValue: e.target.value === '' ? null : parseFloat(e.target.value)
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-bold font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                    + Upper Tol
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={modalBalloon.upperTolerance ?? ''}
                    onChange={(e) =>
                      setModalBalloon({
                        ...modalBalloon,
                        upperTolerance: e.target.value === '' ? null : parseFloat(e.target.value)
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-emerald-600 font-bold font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                    - Lower Tol
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={modalBalloon.lowerTolerance ?? ''}
                    onChange={(e) =>
                      setModalBalloon({
                        ...modalBalloon,
                        lowerTolerance: e.target.value === '' ? null : parseFloat(e.target.value)
                      })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-rose-600 font-bold font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                  Actual Measured Value (Optional - can be typed anytime)
                </label>
                <input
                  type="number"
                  step="any"
                  value={modalBalloon.actualValue ?? ''}
                  onChange={(e) =>
                    setModalBalloon({
                      ...modalBalloon,
                      actualValue: e.target.value === '' ? null : parseFloat(e.target.value)
                    })
                  }
                  placeholder="Enter physical reading from vernier / CMM..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-bold font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateBalloonData(modalBalloon.id, modalBalloon);
                  setEditModalOpen(false);
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20"
              >
                Save Dimension
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
