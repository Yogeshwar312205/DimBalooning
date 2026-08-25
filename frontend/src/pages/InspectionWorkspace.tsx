import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInspectionStore } from '../store/useInspectionStore';
import { Toolbar } from '../components/PDFViewer/Toolbar';
import { PDFCanvas } from '../components/PDFViewer/PDFCanvas';
import { CanvasOverlay } from '../components/PDFViewer/CanvasOverlay';
import { InspectionTable } from '../components/Inspection/InspectionTable';
import { ManualExtractionModal } from '../components/Ballooning/ManualExtractionModal';
import { CollaboratorList } from '../components/Inspection/CollaboratorList';
import { connectInspectionSocket, disconnectInspectionSocket } from '../services/socketService';
import { FileSpreadsheet, FileText, ArrowLeft, RefreshCw, Cpu, GripVertical } from 'lucide-react';
import api from '../services/api';

export const InspectionWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { activeSession, setSession, activeTool } = useInspectionStore();
  const [loading, setLoading] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number; totalPages: number }>({
    width: 800,
    height: 1100,
    totalPages: 1
  });

  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Resizable Right Panel
  const [tableWidth, setTableWidth] = useState<number>(480);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState<boolean>(false);

  // Container Viewport Size & Drag Panning State
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 800, height: 700 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0
  });

  // Initial Load & Socket Connection
  useEffect(() => {
    if (!id) return;
    fetchSessionDetails(id);

    connectInspectionSocket(id);
    return () => {
      disconnectInspectionSocket(id);
    };
  }, [id]);

  // Background Auto-Hydration Poller: If 0 balloons, check every 2.5s until populated
  useEffect(() => {
    if (!id || !activeSession || (activeSession.balloons && activeSession.balloons.length > 0)) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/inspections/${id}`);
        if (res.data.session?.balloons?.length > 0) {
          setSession(res.data.session);
          clearInterval(interval);
        }
      } catch (e) {
        // silent background check
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [id, activeSession?.balloons?.length]);

  // Viewport resize observer
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Splitter Drag Handlers
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingSplitter(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingSplitter) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 320 && newWidth <= 850) {
        setTableWidth(newWidth);
      }
    },
    [isDraggingSplitter]
  );

  const handleMouseUp = useCallback(() => {
    if (isDraggingSplitter) {
      setIsDraggingSplitter(false);
    }
  }, [isDraggingSplitter]);

  useEffect(() => {
    if (isDraggingSplitter) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplitter, handleMouseMove, handleMouseUp]);

  const fetchSessionDetails = async (sessionId: string) => {
    setIsRefreshing(true);
    try {
      const res = await api.get(`/inspections/${sessionId}`);
      setSession(res.data.session);
    } catch (err) {
      console.error('Failed to load inspection session:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleForceDeepScan = async () => {
    if (!id || !activeSession) return;
    const confirmScan = window.confirm("Run Deep AI Scan (3x3 Grid)? This analyzes dense micro-features and updates the drawing dimensions.");
    if (!confirmScan) return;

    setIsExtracting(true);
    try {
      await api.post(`/drawings/${activeSession.drawingId}/extract`, { forceAi: true, grid: '3x3' });
      await fetchSessionDetails(id);
    } catch (err: any) {
      console.error('Failed to run Deep Scan:', err);
      alert(err?.response?.data?.error || 'Deep AI Scan failed to complete.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    try {
      const res = await api.put(`/inspections/${id}/status`, { status: newStatus });
      if (res.data.session) {
        setSession(res.data.session);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleExportExcel = async () => {
    if (!id || !activeSession) return;
    setGeneratingExcel(true);
    try {
      const res = await api.post('/reports/excel', { inspectionSessionId: id });
      const rawUrl: string = res.data.downloadUrl;
      const cleanUrl = rawUrl.startsWith('/api') ? rawUrl.replace(/^\/api/, '') : rawUrl;

      const fileRes = await api.get(cleanUrl, { responseType: 'blob' });
      const blob = new Blob([fileRes.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Inspection_Report_${activeSession.partNumber}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to export Excel report:', err);
      alert(err?.response?.data?.error || 'Failed to generate Excel report');
    } finally {
      setGeneratingExcel(false);
    }
  };

  const handleExportMarkedPdf = async () => {
    if (!id || !activeSession) return;
    setGeneratingPdf(true);
    try {
      const res = await api.post('/reports/pdf', { inspectionSessionId: id });
      const rawUrl: string = res.data.downloadUrl;
      const cleanUrl = rawUrl.startsWith('/api') ? rawUrl.replace(/^\/api/, '') : rawUrl;

      const fileRes = await api.get(cleanUrl, { responseType: 'blob' });
      const blob = new Blob([fileRes.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MarkedUp_Drawing_${activeSession.partNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to export Marked PDF:', err);
      alert(err?.response?.data?.error || 'Failed to generate marked-up PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleMouseDownPan = (e: React.MouseEvent) => {
    if (activeTool !== 'PAN' || !containerRef.current) return;
    setIsPanning(true);
    setPanStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop
    });
  };

  const handleMouseMovePan = (e: React.MouseEvent) => {
    if (!isPanning || activeTool !== 'PAN' || !containerRef.current) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    containerRef.current.scrollLeft = panStart.scrollLeft - dx;
    containerRef.current.scrollTop = panStart.scrollTop - dy;
  };

  const handleMouseUpPan = () => {
    setIsPanning(false);
  };

  if (loading || !activeSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium mt-3">Loading Drawing Canvas...</p>
      </div>
    );
  }

  const drawingFileUrl = `/api/drawings/${activeSession.drawingId}/file`;
  const isBackgroundExtracting = !activeSession.balloons || activeSession.balloons.length === 0;

  return (
    <div className={`flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden relative transition-colors text-slate-900 dark:text-slate-100 ${isDraggingSplitter ? 'select-none cursor-col-resize' : ''}`}>
      {/* Workspace Header Bar */}
      <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 flex items-center justify-between shrink-0 transition-colors shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/drawings')}
            className="p-2 text-slate-700 dark:text-slate-300 hover:text-blue-600 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm"
            title="Back to Drawings"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-sm text-slate-900 dark:text-white font-display">{activeSession.name}</h2>
              
              <select
                value={activeSession.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-blue-700 dark:text-cyan-400 rounded-lg px-2 py-0.5 focus:outline-none focus:border-blue-500 shadow-sm"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="APPROVED">APPROVED</option>
              </select>

              {isBackgroundExtracting && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-cyan-400 border border-blue-500/20 text-[11px] font-mono font-semibold animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Auto-Detecting Dimensions...
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-3">
              <span>Part: <strong className="text-slate-900 dark:text-slate-200">{activeSession.partNumber}</strong></span>
              <span>Batch: <strong className="text-slate-900 dark:text-slate-200">{activeSession.batchNumber}</strong></span>
              <span>Rev: <strong className="text-cyan-600 dark:text-cyan-400">{activeSession.revision}</strong></span>
            </div>
          </div>
        </div>

        {/* Action Buttons & Export Tools */}
        <div className="flex items-center gap-2">
          <CollaboratorList />

          <button
            onClick={() => {
              if (id) fetchSessionDetails(id);
            }}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
            title="Sync Balloons"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>

          <button
            onClick={handleForceDeepScan}
            disabled={isExtracting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {isExtracting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Cpu className="w-3.5 h-3.5" />
            )}
            <span>{isExtracting ? 'AI Scanning...' : 'Deep AI Scan'}</span>
          </button>

          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1"></div>

          <button
            onClick={handleExportExcel}
            disabled={generatingExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {generatingExcel ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>Excel</span>
          </button>

          <button
            onClick={handleExportMarkedPdf}
            disabled={generatingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {generatingPdf ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar totalPages={canvasDimensions.totalPages} />

      {/* Main Split Screen Area with Resizable Divider */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* PDF Canvas Viewport Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDownPan}
          onMouseMove={handleMouseMovePan}
          onMouseUp={handleMouseUpPan}
          onMouseLeave={handleMouseUpPan}
          className={`flex-1 overflow-auto p-4 bg-slate-200 dark:bg-slate-950 flex items-center justify-center relative transition-colors ${
            activeTool === 'PAN'
              ? isPanning
                ? 'cursor-grabbing select-none'
                : 'cursor-grab'
              : ''
          }`}
        >
          <div className="relative inline-block my-auto select-none">
            <PDFCanvas
              pdfUrl={drawingFileUrl}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              onPageRendered={(dim) => setCanvasDimensions(dim)}
            />
            {canvasDimensions.width > 0 && (
              <CanvasOverlay
                width={canvasDimensions.width}
                height={canvasDimensions.height}
              />
            )}
          </div>
        </div>

        {/* Resizable Drag Splitter Divider */}
        <div
          onMouseDown={handleSplitterMouseDown}
          className="w-2 hover:w-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-500 dark:hover:bg-blue-500 cursor-col-resize flex items-center justify-center transition-all shrink-0 z-30 group"
          title="Drag to resize canvas and inspection table"
        >
          <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
        </div>

        {/* Inspection Table Side Panel */}
        <div
          style={{ width: `${tableWidth}px` }}
          className="flex shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
        >
          <InspectionTable />
        </div>
      </div>

      {/* Manual Extraction Fallback Modal */}
      <ManualExtractionModal />
    </div>
  );
};