import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Maximize2,
  Edit2,
  Check,
  X,
  ChevronRight,
  ChevronLeft,
  Layers,
  Sliders,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import { calculateTolerance, ToleranceResult } from '../utils/toleranceEngine';
import { exportInspectionToExcel, ExportBalloonData } from '../utils/clientExcelExport';
import { VALMET_SAMPLE_DRAWING_SVG } from '../assets/sampleDrawings';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface DimensionSubItem {
  id: string;
  name: string; // e.g. "Length", "Breadth", "Hole Diameter", "Depth"
  nominalValue: number | null; // Drawing Dimension from diagram
  upperTolerance: number | null; // e.g. +0.05
  lowerTolerance: number | null; // e.g. -0.05
  actualValue: number | null; // Measured physical reading
  lowerLimit: number | null;
  upperLimit: number | null;
  status: 'OK' | 'TO CHECK' | 'NOT ACCEPTABLE' | 'PENDING';
}

export interface PrototypeBalloon {
  id: string;
  balloonNumber: number; // sequential: 1, 2, 3 -> formatted as "01", "02", "03"
  unit: string;
  items: DimensionSubItem[]; // Each dimension has its own nominal & reading
  overallStatus: 'OK' | 'TO CHECK' | 'NOT ACCEPTABLE' | 'PENDING';
  warningThresholdPercent: number;
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

const formatBalloonNumber = (num: number): string => String(num).padStart(2, '0');

export const PrototypeWorkspace: React.FC = () => {
  // Drawing Canvas State
  const [drawingType, setDrawingType] = useState<'SAMPLE_SVG' | 'IMAGE' | 'PDF'>('SAMPLE_SVG');
  const [drawingSrc, setDrawingSrc] = useState<string>('');
  const [drawingName, setDrawingName] = useState<string>('Console Machining Drawing');
  const [partNumber, setPartNumber] = useState<string>('VAL-8492-MK2');
  const [revision, setRevision] = useState<string>('Rev 05');

  // Viewport & Scaling
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  const [canvasDim, setCanvasDim] = useState<{ width: number; height: number }>({ width: 1000, height: 700 });
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [activeTool, setActiveTool] = useState<'BALLOON' | 'SELECT'>('BALLOON');
  const [inspectionTabOpen, setInspectionTabOpen] = useState<boolean>(true);

  // Inspection Balloons
  const [balloons, setBalloons] = useState<PrototypeBalloon[]>([]);
  const [selectedBalloonId, setSelectedBalloonId] = useState<string | null>(null);

  // Configure Dimension Dialog Box State
  const [configModalOpen, setConfigModalOpen] = useState<boolean>(false);
  const [modalData, setModalData] = useState<{
    id: string;
    balloonNumber: number;
    unit: string;
    warningThresholdPercent: number;
    subDimensions: Array<{
      name: string;
      nominalValue: string;
      upperTolerance: string;
      lowerTolerance: string;
      actualValue: string;
    }>;
    remarks: string;
    isNew: boolean;
    normX: number;
    normY: number;
    leaderStartX?: number;
    leaderStartY?: number;
  }>({
    id: '',
    balloonNumber: 1,
    unit: 'mm',
    warningThresholdPercent: 10,
    subDimensions: [
      { name: 'Dimension 01', nominalValue: '25.00', upperTolerance: '0.10', lowerTolerance: '-0.10', actualValue: '' }
    ],
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

  // Setup Fabric.js Vector Overlay with Drag & Move Support
  useEffect(() => {
    if (!overlayCanvasRef.current) return;

    const fc = new fabric.Canvas(overlayCanvasRef.current, {
      width: canvasDim.width,
      height: canvasDim.height,
      selection: true,
      hoverCursor: 'pointer',
      preserveObjectStacking: true
    });

    // Real-time leader line stretching during balloon dragging
    fc.on('object:moving', (e) => {
      const target = e.target as any;
      if (target && target.data?.balloonId) {
        const balloonId = target.data.balloonId;
        const currentPx = target.left;
        const currentPy = target.top;

        // Find connected leader line
        const lines = fc.getObjects('line') as fabric.Line[];
        const connectedLine = lines.find((l: any) => l.data?.balloonId === balloonId);
        if (connectedLine) {
          connectedLine.set({ x2: currentPx, y2: currentPy });
          fc.renderAll();
        }
      }
    });

    // Save final dropped position
    fc.on('object:modified', (e) => {
      const target = e.target as any;
      if (target && target.data?.balloonId) {
        const balloonId = target.data.balloonId;
        const newNormX = Math.max(0.01, Math.min(0.99, target.left / canvasDim.width));
        const newNormY = Math.max(0.01, Math.min(0.99, target.top / canvasDim.height));

        setBalloons((prev) =>
          prev.map((b) => (b.id === balloonId ? { ...b, x: newNormX, y: newNormY } : b))
        );
      }
    });

    fabricCanvasRef.current = fc;

    return () => {
      fc.dispose();
      fabricCanvasRef.current = null;
    };
  }, [canvasDim]);

  // Nearest Free Position Collision Avoidance
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
      const distance = radius * 2.4 * Math.ceil(attempts / 8);
      finalX = targetX + Math.cos(angle) * distance;
      finalY = targetY + Math.sin(angle) * distance;

      finalX = Math.max(radius + 5, Math.min(canvasDim.width - radius - 5, finalX));
      finalY = Math.max(radius + 5, Math.min(canvasDim.height - radius - 5, finalY));
    }

    return { x: targetX, y: targetY };
  };

  // Canvas Mouse Down: Adds a new balloon when in BALLOON mode (if clicking on empty space)
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    const handleMouseDown = (opt: fabric.IEvent) => {
      // If user clicked an existing balloon group, let Fabric handle drag selection
      if (opt.target && (opt.target as any).data?.balloonId) {
        setSelectedBalloonId((opt.target as any).data.balloonId);
        return;
      }

      if (activeTool !== 'BALLOON') return;

      const pointer = fc.getPointer(opt.e);
      const clickedX = pointer.x;
      const clickedY = pointer.y;

      const freePos = findCollisionFreePosition(clickedX, clickedY, balloons);

      // Auto sequential balloon ID calculation (Strictly sequential, e.g. 1 -> "01")
      const nextNum = balloons.length > 0 ? Math.max(...balloons.map((b) => b.balloonNumber)) + 1 : 1;

      setModalData({
        id: `dim-b-${nextNum}-${Date.now()}`,
        balloonNumber: nextNum,
        unit: 'mm',
        warningThresholdPercent: 10,
        subDimensions: [
          {
            name: `Dimension ${formatBalloonNumber(nextNum)}`,
            nominalValue: '25.00',
            upperTolerance: '0.10',
            lowerTolerance: '-0.10',
            actualValue: ''
          }
        ],
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
      unit: b.unit || 'mm',
      warningThresholdPercent: b.warningThresholdPercent || 10,
      subDimensions: b.items.map((item) => ({
        name: item.name,
        nominalValue: item.nominalValue !== null ? String(item.nominalValue) : '',
        upperTolerance: item.upperTolerance !== null ? String(item.upperTolerance) : '0.00',
        lowerTolerance: item.lowerTolerance !== null ? String(item.lowerTolerance) : '0.00',
        actualValue: item.actualValue !== null && item.actualValue !== undefined ? String(item.actualValue) : ''
      })),
      remarks: b.remarks || '',
      isNew: false,
      normX: b.x,
      normY: b.y,
      leaderStartX: b.leaderStartX,
      leaderStartY: b.leaderStartY
    });
    setConfigModalOpen(true);
  };

  // Evaluate Overall Balloon Status from its Sub-Dimensions
  const computeOverallStatus = (items: DimensionSubItem[]): 'OK' | 'TO CHECK' | 'NOT ACCEPTABLE' | 'PENDING' => {
    if (items.some((i) => i.status === 'NOT ACCEPTABLE')) return 'NOT ACCEPTABLE';
    if (items.some((i) => i.status === 'TO CHECK')) return 'TO CHECK';
    if (items.every((i) => i.status === 'OK')) return 'OK';
    return 'PENDING';
  };

  // Save Configured Dimension from Dialog Box
  const handleSaveModalDimension = () => {
    const computedItems: DimensionSubItem[] = modalData.subDimensions.map((sub, idx) => {
      const nom = parseFloat(sub.nominalValue);
      const upperTol = parseFloat(sub.upperTolerance);
      const lowerTol = parseFloat(sub.lowerTolerance);
      const actual = sub.actualValue !== '' ? parseFloat(sub.actualValue) : null;

      const tolResult: ToleranceResult = calculateTolerance(
        isNaN(nom) ? null : nom,
        isNaN(upperTol) ? 0 : upperTol,
        isNaN(lowerTol) ? 0 : lowerTol,
        isNaN(actual as number) ? null : actual,
        modalData.warningThresholdPercent
      );

      return {
        id: `sub-${idx}-${Date.now()}`,
        name: sub.name || `Dim ${idx + 1}`,
        nominalValue: isNaN(nom) ? null : nom,
        upperTolerance: isNaN(upperTol) ? 0 : upperTol,
        lowerTolerance: isNaN(lowerTol) ? 0 : lowerTol,
        actualValue: isNaN(actual as number) ? null : actual,
        lowerLimit: tolResult.lowerLimit,
        upperLimit: tolResult.upperLimit,
        status: tolResult.status
      };
    });

    const overall = computeOverallStatus(computedItems);

    const balloonItem: PrototypeBalloon = {
      id: modalData.id,
      balloonNumber: modalData.balloonNumber, // strictly sequential 2-digit format (01, 02, 03)
      unit: modalData.unit,
      items: computedItems,
      overallStatus: overall,
      warningThresholdPercent: modalData.warningThresholdPercent,
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

  // Render Balloons & Leader Lines onto Fabric.js Canvas
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;

    fc.clear();

    balloons.forEach((b) => {
      const px = b.x * canvasDim.width;
      const py = b.y * canvasDim.height;
      const isSelected = b.id === selectedBalloonId;
      const statusStyle = STATUS_STYLES[b.overallStatus] || STATUS_STYLES.PENDING;

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
          evented: false,
          data: { balloonId: b.id }
        } as any);

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

      // Balloon Number Text formatted strictly as 2-digit number (01, 02, 03)
      const formattedNum = formatBalloonNumber(b.balloonNumber);
      const text = new fabric.Text(formattedNum, {
        fontSize: 11,
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
        hasBorders: true,
        borderColor: '#1A73E8',
        borderScaleFactor: 1.5,
        lockRotation: true,
        lockScalingX: true,
        lockScalingY: true,
        selectable: true,
        evented: true,
        hoverCursor: 'move',
        data: { balloonId: b.id }
      });

      balloonGroup.on('mousedown', () => {
        setSelectedBalloonId(b.id);
      });

      balloonGroup.on('mousedblclick', () => {
        openEditModalForBalloon(b);
      });

      fc.add(balloonGroup);
    });

    fc.renderAll();
  }, [balloons, selectedBalloonId, canvasDim]);

  // Inline Reading update from the table
  const handleQuickReadingChange = (balloonId: string, itemIdx: number, rawVal: string) => {
    setBalloons((prev) =>
      prev.map((b) => {
        if (b.id !== balloonId) return b;
        const actual = rawVal === '' ? null : parseFloat(rawVal);

        const updatedItems = b.items.map((item, idx) => {
          if (idx !== itemIdx) return item;
          const tolResult = calculateTolerance(
            item.nominalValue,
            item.upperTolerance,
            item.lowerTolerance,
            isNaN(actual as number) ? null : actual,
            b.warningThresholdPercent
          );

          return {
            ...item,
            actualValue: isNaN(actual as number) ? null : actual,
            status: tolResult.status,
            lowerLimit: tolResult.lowerLimit,
            upperLimit: tolResult.upperLimit
          };
        });

        const overall = computeOverallStatus(updatedItems);

        return {
          ...b,
          items: updatedItems,
          overallStatus: overall
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
      unit: b.unit,
      items: b.items.map((i) => ({
        name: i.name,
        nominalValue: i.nominalValue,
        upperTolerance: i.upperTolerance,
        lowerTolerance: i.lowerTolerance,
        lowerLimit: i.lowerLimit,
        upperLimit: i.upperLimit,
        actualValue: i.actualValue,
        status: i.status
      })),
      overallStatus: b.overallStatus,
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
  const okCount = balloons.filter((b) => b.overallStatus === 'OK').length;
  const checkCount = balloons.filter((b) => b.overallStatus === 'TO CHECK').length;
  const failCount = balloons.filter((b) => b.overallStatus === 'NOT ACCEPTABLE').length;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden font-sans text-xs select-none">
      {/* 1. Header: Clean Technical Title & Actions */}
      <header className="h-12 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center text-white font-bold text-xs">
            V
          </div>
          <div>
            <h1 className="font-bold text-xs text-slate-900 tracking-tight">
              Drawing Dimension Ballooning & Inspection Tool
            </h1>
            <p className="text-[10px] text-slate-500 font-mono">
              Drawing: <span className="font-semibold text-slate-700">{drawingName}</span> | Part: <span className="font-semibold text-slate-700">{partNumber}</span> ({revision})
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.png,.jpg,.jpeg,.svg"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Upload Drawing (PDF / Image)</span>
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-emerald-700 hover:bg-emerald-800 text-white transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Excel (.xlsx)</span>
          </button>

          {/* Toggle Inspection Table Panel */}
          <button
            onClick={() => setInspectionTabOpen((prev) => !prev)}
            className={`p-1.5 rounded border transition-colors ${
              inspectionTabOpen
                ? 'bg-slate-100 text-slate-800 border-slate-300'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
            title={inspectionTabOpen ? 'Collapse Inspection Table' : 'Expand Inspection Table'}
          >
            {inspectionTabOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* 2. Main Work Area: Dominant 2D Canvas on Left, Compact Inspection Table on Right */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {/* Left Side: DOMINANT 2D Engineering Canvas */}
        <div className="flex-1 flex flex-col bg-slate-100 overflow-hidden relative">
          {/* Top Canvas Tool Selector */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-white/95 backdrop-blur-sm p-1 rounded border border-slate-300 shadow-sm">
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
              title="Select and drag balloons to reposition leader line"
            >
              <MousePointer className="w-3.5 h-3.5" />
              <span>Select & Drag</span>
            </button>
          </div>

          {/* Vertical Zoom & Pan Bar on Canvas Left Edge */}
          <div className="absolute left-3 top-16 z-10 flex flex-col items-center bg-white/95 backdrop-blur-sm p-1.5 rounded-lg border border-slate-300 shadow-sm space-y-1.5">
            <button
              onClick={() => setZoomScale((s) => Math.min(2.5, s + 0.15))}
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            {/* Vertical Zoom Presets */}
            <div className="flex flex-col items-center gap-1 my-1">
              <button
                onClick={() => setZoomScale(1.5)}
                className={`text-[9px] font-mono px-1 py-0.5 rounded ${zoomScale === 1.5 ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                150%
              </button>
              <button
                onClick={() => setZoomScale(1.0)}
                className={`text-[9px] font-mono px-1 py-0.5 rounded ${zoomScale === 1.0 ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                100%
              </button>
              <button
                onClick={() => setZoomScale(0.75)}
                className={`text-[9px] font-mono px-1 py-0.5 rounded ${zoomScale === 0.75 ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                75%
              </button>
            </div>

            <button
              onClick={() => setZoomScale((s) => Math.max(0.4, s - 0.15))}
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <div className="w-4 h-px bg-slate-200" />

            <button
              onClick={() => setZoomScale(1.0)}
              className="p-1.5 text-slate-700 hover:bg-slate-100 rounded"
              title="Reset 100%"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 2D Canvas Viewport Scroll Area */}
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
          <div className="h-7 px-4 bg-white border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
            <div className="flex items-center gap-4 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                <span>OK</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                <span>To Check</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-600 inline-block"></span>
                <span>Not Acceptable</span>
              </span>
            </div>

            <span className="font-mono text-slate-400 text-[10px]">
              Drag balloon on canvas to stretch leader line • Double-click to configure
            </span>
          </div>
        </div>

        {/* Right Side: Inspection Characteristics Table (Collapsible & Compact) */}
        {inspectionTabOpen && (
          <div className="w-[420px] xl:w-[460px] flex flex-col bg-white border-l border-slate-200 shrink-0 overflow-hidden">
            {/* Table Header */}
            <div className="p-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[11px] text-slate-800 uppercase tracking-wider font-mono">
                  Inspection Log
                </h2>
                <p className="text-[10px] text-slate-500">
                  Total: <strong className="text-slate-800 font-mono">{balloons.length}</strong> Balloons
                </p>
              </div>

              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold">
                  {okCount} OK
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-semibold">
                  {checkCount} Check
                </span>
                <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-800 border border-red-300 font-semibold">
                  {failCount} Reject
                </span>
              </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto">
              {balloons.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-2">
                  <Sliders className="w-7 h-7 text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">No Balloons Added</p>
                  <p className="text-[10px] max-w-xs text-slate-400">
                    Click <strong>"Add Balloon"</strong> and click any measurement on the drawing.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 font-mono text-[10px]">
                    <tr>
                      <th className="py-2 px-2 text-center w-8">ID</th>
                      <th className="py-2 px-2">Parameter</th>
                      <th className="py-2 px-2 text-right">Nominal</th>
                      <th className="py-2 px-2 text-right">Tol</th>
                      <th className="py-2 px-2 text-center min-w-[80px]">Actual Reading</th>
                      <th className="py-2 px-1 text-center">Status</th>
                      <th className="py-2 px-1 text-center w-10"></th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                    {balloons.map((b) => {
                      const isSelected = b.id === selectedBalloonId;
                      const formattedNum = formatBalloonNumber(b.balloonNumber);
                      const styleInfo = STATUS_STYLES[b.overallStatus] || STATUS_STYLES.PENDING;

                      return (
                        <React.Fragment key={b.id}>
                          {b.items.map((item, itemIdx) => {
                            const itemStyle = STATUS_STYLES[item.status] || STATUS_STYLES.PENDING;

                            return (
                              <tr
                                key={`${b.id}-${itemIdx}`}
                                onClick={() => setSelectedBalloonId(b.id)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-blue-50/80 border-l-2 border-blue-600'
                                    : 'hover:bg-slate-50'
                                }`}
                              >
                                {/* Balloon 2-digit Number Badge (01, 02, 03) */}
                                <td className="py-1.5 px-2 text-center">
                                  {itemIdx === 0 ? (
                                    <span
                                      className="w-5 h-5 rounded-full inline-flex items-center justify-center font-bold text-white text-[10px]"
                                      style={{ backgroundColor: styleInfo.border }}
                                    >
                                      {formattedNum}
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 font-mono">↳</span>
                                  )}
                                </td>

                                {/* Parameter Name */}
                                <td className="py-1.5 px-2 font-sans text-slate-800">
                                  <div className="font-medium text-[11px] leading-tight">{item.name}</div>
                                  {b.items.length > 1 && (
                                    <span className="text-[9px] text-slate-400 font-mono">Item {itemIdx + 1}</span>
                                  )}
                                </td>

                                {/* Nominal Drawing Dim */}
                                <td className="py-1.5 px-2 text-right font-bold text-slate-900">
                                  {item.nominalValue !== null ? item.nominalValue.toFixed(2) : '-'}
                                </td>

                                {/* Tolerance */}
                                <td className="py-1.5 px-2 text-right text-[10px]">
                                  <span className="text-emerald-700 font-medium block">
                                    +{item.upperTolerance?.toFixed(2) ?? '0.00'}
                                  </span>
                                  <span className="text-red-700 font-medium block">
                                    {item.lowerTolerance?.toFixed(2) ?? '0.00'}
                                  </span>
                                </td>

                                {/* Actual Reading Input */}
                                <td className="py-1 px-1.5 text-center">
                                  <input
                                    type="number"
                                    step="any"
                                    value={item.actualValue !== null && item.actualValue !== undefined ? item.actualValue : ''}
                                    onChange={(e) =>
                                      handleQuickReadingChange(b.id, itemIdx, e.target.value)
                                    }
                                    placeholder="Reading..."
                                    className="w-20 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold text-slate-900 focus:outline-none focus:border-blue-600 text-[11px]"
                                  />
                                </td>

                                {/* Status Badge */}
                                <td className="py-1.5 px-1 text-center">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold border ${itemStyle.badge}`}
                                  >
                                    {itemStyle.label}
                                  </span>
                                </td>

                                {/* Actions */}
                                <td className="py-1.5 px-1 text-center">
                                  {itemIdx === 0 && (
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEditModalForBalloon(b);
                                        }}
                                        className="p-1 text-slate-500 hover:text-blue-700 rounded hover:bg-slate-100"
                                        title="Configure Dimension"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteBalloon(b.id);
                                        }}
                                        className="p-1 text-slate-400 hover:text-red-700 rounded hover:bg-slate-100"
                                        title="Delete Balloon"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Configure Dimension Dialog Box Modal */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-[1px]">
          <div className="bg-white border border-slate-300 rounded-lg shadow-xl max-w-lg w-full overflow-hidden text-xs max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-4 py-2.5 bg-slate-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-600 text-white rounded font-mono font-bold text-xs">
                  Balloon {formatBalloonNumber(modalData.balloonNumber)}
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

            {/* Modal Scrollable Form Body */}
            <div className="p-4 space-y-3 overflow-auto flex-1">
              {/* Unit & Acceptance Level */}
              <div className="grid grid-cols-2 gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div>
                  <label className="block text-slate-600 text-[11px] font-semibold mb-0.5">
                    Dimension Unit
                  </label>
                  <select
                    value={modalData.unit}
                    onChange={(e) => setModalData({ ...modalData, unit: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                  >
                    <option value="mm">mm</option>
                    <option value="in">inch</option>
                    <option value="deg">deg (°)</option>
                    <option value="rad">rad</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 text-[11px] font-semibold mb-0.5">
                    Tolerance Warning Limit
                  </label>
                  <select
                    value={modalData.warningThresholdPercent}
                    onChange={(e) =>
                      setModalData({ ...modalData, warningThresholdPercent: parseInt(e.target.value) || 10 })
                    }
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono text-slate-900 focus:outline-none focus:border-blue-600"
                  >
                    <option value="5">5% of tolerance limit</option>
                    <option value="10">10% of tolerance limit (Standard)</option>
                    <option value="15">15% of tolerance limit</option>
                    <option value="20">20% of tolerance limit</option>
                  </select>
                </div>
              </div>

              {/* Number of Dimensions Selector (1 to 4) */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                <span className="font-bold text-slate-800 text-xs">
                  Dimension Feature Items
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Count:</span>
                  <select
                    value={modalData.subDimensions.length}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 1;
                      const current = [...modalData.subDimensions];
                      const defaultNames = ['Length', 'Breadth', 'Height / Depth', 'Diameter'];
                      while (current.length < count) {
                        const idx = current.length;
                        current.push({
                          name: defaultNames[idx] || `Dim 0${idx + 1}`,
                          nominalValue: '25.00',
                          upperTolerance: '0.10',
                          lowerTolerance: '-0.10',
                          actualValue: ''
                        });
                      }
                      setModalData({
                        ...modalData,
                        subDimensions: current.slice(0, count)
                      });
                    }}
                    className="bg-white border border-slate-300 rounded px-2 py-0.5 font-mono text-slate-900 font-bold"
                  >
                    <option value="1">1 Dimension (Single)</option>
                    <option value="2">2 Dimensions (e.g. Length & Breadth)</option>
                    <option value="3">3 Dimensions (e.g. Length, Breadth, Depth)</option>
                    <option value="4">4 Dimensions (Multi-Feature)</option>
                  </select>
                </div>
              </div>

              {/* Sub-Dimension Items: Each with its OWN Nominal, Tolerances, and Reading */}
              <div className="space-y-2.5">
                {modalData.subDimensions.map((sub, idx) => (
                  <div key={idx} className="p-3 border border-slate-200 rounded bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700 text-[11px] font-mono">
                        Item {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={sub.name}
                        onChange={(e) => {
                          const updated = [...modalData.subDimensions];
                          updated[idx].name = e.target.value;
                          setModalData({ ...modalData, subDimensions: updated });
                        }}
                        placeholder={`e.g. ${idx === 0 ? 'Length / Outer Dia' : idx === 1 ? 'Breadth / Width' : 'Depth'}`}
                        className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 w-48 font-medium focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-0.5">
                          Drawing Dim (Nominal)
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          value={sub.nominalValue}
                          onChange={(e) => {
                            const updated = [...modalData.subDimensions];
                            updated[idx].nominalValue = e.target.value;
                            setModalData({ ...modalData, subDimensions: updated });
                          }}
                          placeholder="25.00"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 text-[10px] mb-0.5">
                          + Upper Tol
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={sub.upperTolerance}
                          onChange={(e) => {
                            const updated = [...modalData.subDimensions];
                            updated[idx].upperTolerance = e.target.value;
                            setModalData({ ...modalData, subDimensions: updated });
                          }}
                          placeholder="+0.10"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono font-bold text-emerald-800 focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 text-[10px] mb-0.5">
                          - Lower Tol
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={sub.lowerTolerance}
                          onChange={(e) => {
                            const updated = [...modalData.subDimensions];
                            updated[idx].lowerTolerance = e.target.value;
                            setModalData({ ...modalData, subDimensions: updated });
                          }}
                          placeholder="-0.10"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono font-bold text-red-800 focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-500 text-[10px] mb-0.5">
                          Actual Reading
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={sub.actualValue}
                          onChange={(e) => {
                            const updated = [...modalData.subDimensions];
                            updated[idx].actualValue = e.target.value;
                            setModalData({ ...modalData, subDimensions: updated });
                          }}
                          placeholder="Measured"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModalDimension}
                className="px-4 py-1 rounded bg-blue-700 hover:bg-blue-800 text-white font-semibold flex items-center gap-1.5 shadow-sm"
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
