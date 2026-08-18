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
  RotateCcw,
  MousePointer,
  FileText,
  Sliders,
  Edit2,
  Check,
  X
} from 'lucide-react';
import { calculateTolerance, evaluateMultiReadings, ToleranceResult } from '../utils/toleranceEngine';
import { exportInspectionToExcel, ExportBalloonData } from '../utils/clientExcelExport';
import { VALMET_SAMPLE_DRAWING_SVG } from '../assets/sampleDrawings';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface PrototypeBalloon {
  id: string;
  balloonNumber: number; // strictly sequential (locked)
  dimensionName: string;
  unit: string;
  nominalValue: number | null; // Drawing Dim from diagram
  upperTolerance: number | null;
  lowerTolerance: number | null;
  warningThresholdPercent: number; // Acceptance level %
  observationCount: number; // Number of dimension readings (1, 2, 3...)
  observations: (number | null)[]; // Actual physical readings
  lowerLimit: number | null;
  upperLimit: number | null;
  status: 'OK' | 'TO CHECK' | 'NOT ACCEPTABLE' | 'PENDING';
  remarks?: string;
  // Normalized canvas coordinates [0..1]
  x: number;
  y: number;
  leaderStartX?: number;
  leaderStartY?: number;
}

// Clean industrial technical color palette
const STATUS_STYLES: Record<string, { fill: string; border: string; text: string; label: string; badge: string }> = {
  OK: {
    fill: '#E6F4EA',
    border: '#1E8E3E',
    text: '#137333',
    label: 'OK',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-300'
  },
  'TO CHECK': {
    fill: '#FEF7E0',
    border: '#F9AB00',
    text: '#B06000',
    label: 'TO CHECK',
    badge: 'bg-amber-50 text-amber-800 border-amber-300'
  },
  'NOT ACCEPTABLE': {
    fill: '#FCE8E6',
    border: '#D93025',
    text: '#C5221F',
    label: 'NOT ACCEPTABLE',
    badge: 'bg-red-50 text-red-800 border-red-300'
  },
  PENDING: {
    fill: '#E8F0FE',
    border: '#1A73E8',
    text: '#174EA6',
    label: 'PENDING',
    badge: 'bg-blue-50 text-blue-800 border-blue-200'
  }
};

export const PrototypeWorkspace: React.FC = () => {
  // Drawing Canvas State
  const [drawingType, setDrawingType] = useState<'SAMPLE_SVG' | 'IMAGE' | 'PDF'>('SAMPLE_SVG');
  const [drawingSrc, setDrawingSrc] = useState<string>('');
  const [drawingName, setDrawingName] = useState<string>('Console Machining Drawing');
  const [partNumber, setPartNumber] = useState<string>('VAL-8492-MK2');
  const [revision, setRevision] = useState<string>('Rev 05');

  // Canvas References & Scaling
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const [canvasDim, setCanvasDim] = useState<{ width: number; height: number }>({ width: 1000, height: 700 });
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [activeTool, setActiveTool] = useState<'BALLOON' | 'SELECT'>('BALLOON');

  // Inspection Balloons
  const [balloons, setBalloons] = useState<PrototypeBalloon[]>([]);
  const [selectedBalloonId, setSelectedBalloonId] = useState<string | null>(null);

  // Configure Dimension Dialog Box State
  const [configModalOpen, setConfigModalOpen] = useState<boolean>(false);
  const [modalData, setModalData] = useState<{
    id: string;
    balloonNumber: number;
    dimensionName: string;
    unit: string;
    nominalValue: string;
    upperTolerance: string;
    lowerTolerance: string;
    warningThresholdPercent: number;
    observationCount: number;
    observations: string[];
    remarks: string;
    isNew: boolean;
    normX: number;
    normY: number;
    leaderStartX?: number;
    leaderStartY?: number;
  }>({
    id: '',
    balloonNumber: 1,
    dimensionName: '',
    unit: 'mm',
    nominalValue: '25.00',
    upperTolerance: '0.10',
    lowerTolerance: '-0.10',
    warningThresholdPercent: 10,
    observationCount: 1,
    observations: [''],
    remarks: '',
    isNew: false,
    normX: 0.5,
    normY: 0.5
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize Default Technical Drawing on Mount
  useEffect(() => {
    loadInitialBlueprint();
  }, []);

  const loadInitialBlueprint = () => {
    setDrawingType('SAMPLE_SVG');
    const svgBlob = new Blob([VALMET_SAMPLE_DRAWING_SVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    setDrawingSrc(url);
    setBalloons([]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    setDrawingName(cleanName);
    setPartNumber(cleanName.slice(0, 14).toUpperCase());

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
          alert('Unable to render PDF drawing.');
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

  // Render Background Blueprint onto Canvas
  useEffect(() => {
    if (drawingType === 'PDF') return;
    if (!drawingSrc || !bgCanvasRef.current) return;

    const img = new Image();
    img.src = drawingSrc;
    img.onload = () => {
      const canvas = bgCanvasRef.current;
      if (!canvas) return;
      const w = img.width || 1000;
      const h = img.height || 700;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
      }
      setCanvasDim({ width: w, height: h });
    };
  }, [drawingSrc, drawingType]);

  // Setup Fabric.js Vector Overlay
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

  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    fc.defaultCursor = activeTool === 'BALLOON' ? 'crosshair' : 'default';
    fc.hoverCursor = activeTool === 'BALLOON' ? 'crosshair' : 'pointer';
    fc.selection = activeTool === 'SELECT';
  }, [activeTool]);

  // Collision Avoidance: Find Nearest Free Position
  const findCollisionFreePosition = (targetX: number, targetY: number, existing: PrototypeBalloon[]) => {
    const radius = 20;
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
      const distance = radius * 2.4 * Math.ceil(attempts / 8);
      finalX = targetX + Math.cos(angle) * distance;
      finalY = targetY + Math.sin(angle) * distance;

      finalX = Math.max(radius + 5, Math.min(canvasDim.width - radius - 5, finalX));
      finalY = Math.max(radius + 5, Math.min(canvasDim.height - radius - 5, finalY));
    }

    return { x: targetX, y: targetY };
  };

  // Handle Canvas Click to add Balloon -> opens Configure Dimension Dialog Box
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    const handleMouseDown = (opt: fabric.IEvent) => {
      if (activeTool !== 'BALLOON') return;

      const pointer = fc.getPointer(opt.e);
      const clickedX = pointer.x;
      const clickedY = pointer.y;

      const freePos = findCollisionFreePosition(clickedX, clickedY, balloons);

      // Auto sequential balloon ID calculation (Strictly sequential, no manual change)
      const nextNum = balloons.length > 0 ? Math.max(...balloons.map((b) => b.balloonNumber)) + 1 : 1;

      setModalData({
        id: `dim-b-${nextNum}-${Date.now()}`,
        balloonNumber: nextNum,
        dimensionName: `Dimension #${nextNum}`,
        unit: 'mm',
        nominalValue: '25.00',
        upperTolerance: '0.10',
        lowerTolerance: '-0.10',
        warningThresholdPercent: 10,
        observationCount: 1,
        observations: [''],
        remarks: '',
        isNew: true,
        normX: freePos.x / canvasDim.width,
        normY: freePos.y / canvasDim.height,
        leaderStartX: clickedX / canvasDim.width,
        leaderStartY: clickedY / canvasDim.height
      });

      setConfigModalOpen(true);
    };

    fc.on('mouse:down', handleMouseDown);
    return () => {
      fc.off('mouse:down', handleMouseDown);
    };
  }, [activeTool, balloons, canvasDim]);

  // Open Configure Dimension Dialog for Existing Balloon
  const openEditModalForBalloon = (b: PrototypeBalloon) => {
    setModalData({
      id: b.id,
      balloonNumber: b.balloonNumber,
      dimensionName: b.dimensionName,
      unit: b.unit || 'mm',
      nominalValue: b.nominalValue !== null ? String(b.nominalValue) : '',
      upperTolerance: b.upperTolerance !== null ? String(b.upperTolerance) : '0.00',
      lowerTolerance: b.lowerTolerance !== null ? String(b.lowerTolerance) : '0.00',
      warningThresholdPercent: b.warningThresholdPercent || 10,
      observationCount: b.observationCount || 1,
      observations: b.observations.map((o) => (o !== null && o !== undefined ? String(o) : '')),
      remarks: b.remarks || '',
      isNew: false,
      normX: b.x,
      normY: b.y,
      leaderStartX: b.leaderStartX,
      leaderStartY: b.leaderStartY
    });
    setConfigModalOpen(true);
  };

  // Save Configured Dimension from Dialog Box
  const handleSaveModalDimension = () => {
    const nom = parseFloat(modalData.nominalValue);
    const upperTol = parseFloat(modalData.upperTolerance);
    const lowerTol = parseFloat(modalData.lowerTolerance);

    if (isNaN(nom)) {
      alert('Please enter a valid numeric Drawing Dimension (Nominal).');
      return;
    }

    const obsCount = Math.max(1, modalData.observationCount);
    const parsedObservations: (number | null)[] = [];
    for (let i = 0; i < obsCount; i++) {
      const raw = modalData.observations[i];
      if (raw !== undefined && raw !== '' && !isNaN(parseFloat(raw))) {
        parsedObservations.push(parseFloat(raw));
      } else {
        parsedObservations.push(null);
      }
    }

    // Evaluate Tolerance Math
    const tolResult: ToleranceResult = evaluateMultiReadings(
      nom,
      isNaN(upperTol) ? 0 : upperTol,
      isNaN(lowerTol) ? 0 : lowerTol,
      parsedObservations,
      modalData.warningThresholdPercent
    );

    const balloonItem: PrototypeBalloon = {
      id: modalData.id,
      balloonNumber: modalData.balloonNumber, // sequential locked ID
      dimensionName: modalData.dimensionName || `Dimension #${modalData.balloonNumber}`,
      unit: modalData.unit,
      nominalValue: nom,
      upperTolerance: isNaN(upperTol) ? 0 : upperTol,
      lowerTolerance: isNaN(lowerTol) ? 0 : lowerTol,
      warningThresholdPercent: modalData.warningThresholdPercent,
      observationCount: obsCount,
      observations: parsedObservations,
      lowerLimit: tolResult.lowerLimit,
      upperLimit: tolResult.upperLimit,
      status: tolResult.status,
      remarks: modalData.remarks,
      x: modalData.normX,
      y: modalData.normY,
      leaderStartX: modalData.leaderStartX,
      leaderStartY: modalData.leaderStartY
    };

    if (modalData.isNew) {
      setBalloons((prev) => [...prev, balloonItem]);
      setSelectedBalloonId(balloonItem.id);
    } else {
      setBalloons((prev) => prev.map((b) => (b.id === balloonItem.id ? balloonItem : b)));
    }

    setConfigModalOpen(false);
  };

  // Render Balloons onto Fabric.js Canvas
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    fc.clear();

    balloons.forEach((b) => {
      const px = b.x * canvasDim.width;
      const py = b.y * canvasDim.height;
      const isSelected = b.id === selectedBalloonId;
      const statusStyle = STATUS_STYLES[b.status] || STATUS_STYLES.PENDING;

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
          radius: 3,
          fill: statusStyle.border,
          originX: 'center',
          originY: 'center',
          selectable: false,
          evented: false
        });

        // Stretchable Clean Leader Line
        leaderLine = new fabric.Line([lx, ly, px, py], {
          stroke: statusStyle.border,
          strokeWidth: 1.5,
          strokeDashArray: [3, 3],
          selectable: false,
          evented: false
        });

        fc.add(targetDot);
        fc.add(leaderLine);
      }

      // 2D Clean CAD Balloon Circle
      const circle = new fabric.Circle({
        radius: 15,
        fill: statusStyle.fill,
        stroke: isSelected ? '#1A73E8' : statusStyle.border,
        strokeWidth: isSelected ? 2.5 : 1.5,
        originX: 'center',
        originY: 'center'
      });

      // Balloon Number Text
      const text = new fabric.Text(String(b.balloonNumber), {
        fontSize: String(b.balloonNumber).length > 2 ? 10 : 12,
        fontWeight: 'bold',
        fill: statusStyle.text,
        fontFamily: 'Arial, sans-serif',
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
        openEditModalForBalloon(b);
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

  // Inline Quick Reading update from the table
  const handleQuickObservationChange = (balloonId: string, obsIndex: number, rawVal: string) => {
    setBalloons((prev) =>
      prev.map((b) => {
        if (b.id !== balloonId) return b;
        const updatedObs = [...b.observations];
        updatedObs[obsIndex] = rawVal === '' ? null : parseFloat(rawVal);

        const tolResult = evaluateMultiReadings(
          b.nominalValue,
          b.upperTolerance,
          b.lowerTolerance,
          updatedObs,
          b.warningThresholdPercent
        );

        return {
          ...b,
          observations: updatedObs,
          status: tolResult.status,
          lowerLimit: tolResult.lowerLimit,
          upperLimit: tolResult.upperLimit
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
      alert('Please place at least one dimension balloon before exporting.');
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
      observationCount: b.observationCount,
      observations: b.observations,
      actualValue: b.observations[0] ?? null,
      unit: b.unit,
      status: b.status,
      remarks: b.remarks
    }));

    await exportInspectionToExcel(
      {
        companyName: 'Valmet Corporation',
        partName: drawingName,
        partNumber: partNumber,
        drawingRef: drawingName,
        revision: revision,
        inspectorName: 'QA Inspection Engineer',
        inspectionDate: new Date().toLocaleDateString()
      },
      exportItems
    );
  };

  // Summary Metrics Counts
  const okCount = balloons.filter((b) => b.status === 'OK').length;
  const checkCount = balloons.filter((b) => b.status === 'TO CHECK').length;
  const failCount = balloons.filter((b) => b.status === 'NOT ACCEPTABLE').length;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden font-sans text-xs select-none">
      {/* 1. Header: Clean Technical Title & Actions */}
      <header className="h-14 px-5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-white font-bold text-sm">
            V
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-900 tracking-tight">
              Drawing Dimension Ballooning & Inspection Tool
            </h1>
            <p className="text-[11px] text-slate-500 font-mono">
              Drawing: <span className="font-semibold text-slate-700">{drawingName}</span> | Part: <span className="font-semibold text-slate-700">{partNumber}</span> ({revision})
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.png,.jpg,.jpeg,.svg"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Upload Drawing (PDF / Image)</span>
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded bg-emerald-700 hover:bg-emerald-800 text-white transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel (.xlsx)</span>
          </button>
        </div>
      </header>

      {/* 2. Main Work Area: 2D Engineering Canvas on Left, Inspection Table on Right */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Side: 2D Engineering Canvas */}
        <div className="flex-1 flex flex-col bg-slate-100 overflow-hidden relative border-r border-slate-300">
          {/* Canvas Floating Toolbar */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-white/95 backdrop-blur-sm p-1 rounded border border-slate-300 shadow-sm">
            {/* Mode Selectors */}
            <button
              onClick={() => setActiveTool('BALLOON')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTool === 'BALLOON'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Click on drawing to place dimension balloon"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Balloon</span>
            </button>

            <button
              onClick={() => setActiveTool('SELECT')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                activeTool === 'SELECT'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Select and reposition balloons with leader line"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Select & Drag</span>
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* Zoom Controls */}
            <button
              onClick={() => setZoomScale((s) => Math.min(2.5, s + 0.15))}
              className="p-1 text-slate-700 hover:bg-slate-100 rounded"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setZoomScale((s) => Math.max(0.4, s - 0.15))}
              className="p-1 text-slate-700 hover:bg-slate-100 rounded"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setZoomScale(1.0)}
              className="p-1 text-slate-700 hover:bg-slate-100 rounded"
              title="Reset Zoom (100%)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <span className="text-[10px] font-mono text-slate-500 px-1.5">
              {Math.round(zoomScale * 100)}%
            </span>
          </div>

          {/* 2D Blueprint Canvas Viewport */}
          <div className="flex-1 overflow-auto p-6 flex items-center justify-center relative">
            <div
              className="relative inline-block bg-white shadow border border-slate-300 transition-transform origin-center"
              style={{
                transform: `scale(${zoomScale})`,
                width: `${canvasDim.width}px`,
                height: `${canvasDim.height}px`
              }}
            >
              {/* Drawing Background Canvas */}
              <canvas ref={bgCanvasRef} className="block absolute top-0 left-0" />

              {/* Fabric.js Vector Balloon Overlay */}
              <div className="absolute top-0 left-0 pointer-events-auto">
                <canvas ref={overlayCanvasRef} />
              </div>
            </div>
          </div>

          {/* Canvas Footer Legend */}
          <div className="h-8 px-4 bg-white border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
            <div className="flex items-center gap-4 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
                <span>OK (Within Tolerance)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                <span>To Check (Warning Boundary)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
                <span>Not Acceptable (Out of Tolerance)</span>
              </span>
            </div>

            <span className="font-mono text-slate-400">
              Double-click balloon on canvas to edit configuration
            </span>
          </div>
        </div>

        {/* Right Side: Inspection Characteristics Table */}
        <div className="w-full lg:w-[580px] xl:w-[640px] flex flex-col bg-white shrink-0 overflow-hidden">
          {/* Table Header & Metrics Summary */}
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-xs text-slate-800 uppercase tracking-wider font-mono">
                Dimensional Inspection Characteristics
              </h2>
              <p className="text-[11px] text-slate-500">
                Total: <strong className="text-slate-800 font-mono">{balloons.length}</strong> Dimensions
              </p>
            </div>

            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold">
                {okCount} OK
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-semibold">
                {checkCount} Check
              </span>
              <span className="px-2 py-0.5 rounded bg-red-50 text-red-800 border border-red-300 font-semibold">
                {failCount} Reject
              </span>
            </div>
          </div>

          {/* Table Data Rows */}
          <div className="flex-1 overflow-auto">
            {balloons.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-2">
                <Sliders className="w-8 h-8 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No Dimension Balloons Added</p>
                <p className="text-[11px] max-w-xs text-slate-400">
                  Select <strong>"Add Balloon"</strong> and click any measurement on the drawing to configure nominal dimensions and tolerance limits.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 font-mono text-[11px]">
                  <tr>
                    <th className="py-2 px-2 text-center w-8">#</th>
                    <th className="py-2 px-2.5">Parameter</th>
                    <th className="py-2 px-2 text-right">Nominal</th>
                    <th className="py-2 px-2 text-right">Tolerance</th>
                    <th className="py-2 px-2 text-right">Limits</th>
                    <th className="py-2 px-2 text-center min-w-[130px]">Actual Reading(s)</th>
                    <th className="py-2 px-2 text-center">Status</th>
                    <th className="py-2 px-1 text-center w-12">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {balloons.map((b) => {
                    const isSelected = b.id === selectedBalloonId;
                    const styleInfo = STATUS_STYLES[b.status] || STATUS_STYLES.PENDING;

                    return (
                      <tr
                        key={b.id}
                        onClick={() => setSelectedBalloonId(b.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/80 border-l-2 border-blue-600'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* Balloon Number Badge */}
                        <td className="py-2 px-2 text-center">
                          <span
                            className="w-5 h-5 rounded-full inline-flex items-center justify-center font-bold text-white text-[10px]"
                            style={{ backgroundColor: styleInfo.border }}
                          >
                            {b.balloonNumber}
                          </span>
                        </td>

                        {/* Parameter Name */}
                        <td className="py-2 px-2.5 font-sans font-medium text-slate-800">
                          {b.dimensionName}
                        </td>

                        {/* Nominal Drawing Dim */}
                        <td className="py-2 px-2 text-right font-bold text-slate-900">
                          {b.nominalValue !== null ? b.nominalValue.toFixed(3) : '-'}
                        </td>

                        {/* Tolerance */}
                        <td className="py-2 px-2 text-right text-[10px]">
                          <span className="text-emerald-700 font-medium block">
                            +{b.upperTolerance?.toFixed(3) ?? '0.000'}
                          </span>
                          <span className="text-red-700 font-medium block">
                            {b.lowerTolerance?.toFixed(3) ?? '0.000'}
                          </span>
                        </td>

                        {/* Lower / Upper Limits */}
                        <td className="py-2 px-2 text-right text-[10px] text-slate-500">
                          <div>L: {b.lowerLimit?.toFixed(3) ?? '-'}</div>
                          <div>U: {b.upperLimit?.toFixed(3) ?? '-'}</div>
                        </td>

                        {/* Actual Physical Readings (Single or Multiple) */}
                        <td className="py-1.5 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {Array.from({ length: b.observationCount || 1 }).map((_, obsIdx) => {
                              const val = b.observations[obsIdx];
                              return (
                                <input
                                  key={obsIdx}
                                  type="number"
                                  step="any"
                                  value={val !== null && val !== undefined ? val : ''}
                                  onChange={(e) =>
                                    handleQuickObservationChange(b.id, obsIdx, e.target.value)
                                  }
                                  placeholder={`Obs ${obsIdx + 1}`}
                                  className="w-16 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold text-slate-900 focus:outline-none focus:border-blue-600 text-[11px]"
                                  title={`Observation ${obsIdx + 1}`}
                                />
                              );
                            })}
                          </div>
                        </td>

                        {/* Status Result Badge */}
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${styleInfo.badge}`}
                          >
                            {styleInfo.label}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-2 px-1 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModalForBalloon(b);
                              }}
                              className="p-1 text-slate-500 hover:text-blue-700 rounded hover:bg-slate-100"
                              title="Configure Dimension"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBalloon(b.id);
                              }}
                              className="p-1 text-slate-400 hover:text-red-700 rounded hover:bg-slate-100"
                              title="Delete Balloon"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 3. Configure Dimension Dialog Box Modal */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-[1px]">
          <div className="bg-white border border-slate-300 rounded-lg shadow-xl max-w-md w-full overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="px-5 py-3 bg-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded font-mono font-bold text-xs">
                  Balloon #{modalData.balloonNumber}
                </span>
                <h3 className="font-bold text-sm">Configure Dimension</h3>
              </div>
              <button
                onClick={() => setConfigModalOpen(false)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="p-5 space-y-3.5">
              {/* Parameter / Feature Name */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Dimension Feature Name
                </label>
                <input
                  type="text"
                  value={modalData.dimensionName}
                  onChange={(e) => setModalData({ ...modalData, dimensionName: e.target.value })}
                  placeholder="e.g. Hole Center Distance, Flange Outer Diameter, Slot Width"
                  className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-slate-900 focus:outline-none focus:border-blue-600 text-xs"
                />
              </div>

              {/* Drawing Dimension (Nominal) & Unit */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-700 font-semibold mb-1">
                    Drawing Dimension (Nominal)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={modalData.nominalValue}
                    onChange={(e) => setModalData({ ...modalData, nominalValue: e.target.value })}
                    placeholder="25.00"
                    className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Unit
                  </label>
                  <select
                    value={modalData.unit}
                    onChange={(e) => setModalData({ ...modalData, unit: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                  >
                    <option value="mm">mm</option>
                    <option value="in">inch</option>
                    <option value="deg">deg (°)</option>
                    <option value="rad">rad</option>
                  </select>
                </div>
              </div>

              {/* Manual Tolerance Acceptance Level */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                <span className="block font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                  Tolerance & Acceptance Level
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 text-[11px] mb-0.5">
                      + Upper Tolerance
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={modalData.upperTolerance}
                      onChange={(e) => setModalData({ ...modalData, upperTolerance: e.target.value })}
                      placeholder="+0.10"
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-emerald-800 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[11px] mb-0.5">
                      - Lower Tolerance
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={modalData.lowerTolerance}
                      onChange={(e) => setModalData({ ...modalData, lowerTolerance: e.target.value })}
                      placeholder="-0.10"
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-red-800 font-mono font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 text-[11px] mb-0.5">
                    Acceptance Warning Boundary (% near limit for "To Check")
                  </label>
                  <select
                    value={modalData.warningThresholdPercent}
                    onChange={(e) =>
                      setModalData({ ...modalData, warningThresholdPercent: parseInt(e.target.value) || 10 })
                    }
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-800 font-mono"
                  >
                    <option value="5">5% of tolerance range</option>
                    <option value="10">10% of tolerance range (Standard)</option>
                    <option value="15">15% of tolerance range</option>
                    <option value="20">20% of tolerance range</option>
                  </select>
                </div>
              </div>

              {/* Number of Dimensions / Observation Readings */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-700 font-semibold">
                    Number of Readings / Observations
                  </label>
                  <select
                    value={modalData.observationCount}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 1;
                      const current = [...modalData.observations];
                      while (current.length < count) current.push('');
                      setModalData({
                        ...modalData,
                        observationCount: count,
                        observations: current.slice(0, count)
                      });
                    }}
                    className="bg-white border border-slate-300 rounded px-2 py-0.5 font-mono text-slate-900"
                  >
                    <option value="1">1 Reading (Single Dimension)</option>
                    <option value="2">2 Readings (e.g. Length, Breadth)</option>
                    <option value="3">3 Readings (Obs 01, Obs 02, Obs 03)</option>
                    <option value="4">4 Readings (4 Samples / Repeat)</option>
                    <option value="5">5 Readings (5 Samples / Repeat)</option>
                  </select>
                </div>

                {/* Dynamic Observation Input Fields */}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {Array.from({ length: modalData.observationCount }).map((_, idx) => (
                    <div key={idx}>
                      <label className="block text-slate-500 text-[10px] mb-0.5">
                        Reading {idx + 1}
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={modalData.observations[idx] || ''}
                        onChange={(e) => {
                          const updated = [...modalData.observations];
                          updated[idx] = e.target.value;
                          setModalData({ ...modalData, observations: updated });
                        }}
                        placeholder={`Obs ${idx + 1}`}
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModalDimension}
                className="px-4 py-1.5 rounded bg-blue-700 hover:bg-blue-800 text-white font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Dimension</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
