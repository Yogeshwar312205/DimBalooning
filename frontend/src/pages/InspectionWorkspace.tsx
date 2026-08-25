import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInspectionStore } from '../store/useInspectionStore';
import { Toolbar } from '../components/PDFViewer/Toolbar';
import { PDFCanvas } from '../components/PDFViewer/PDFCanvas';
import { CanvasOverlay } from '../components/PDFViewer/CanvasOverlay';
import { InspectionTable } from '../components/Inspection/InspectionTable';
import { ManualExtractionModal } from '../components/Ballooning/ManualExtractionModal';
import { CollaboratorList } from '../components/Inspection/CollaboratorList';
import { connectInspectionSocket, disconnectInspectionSocket } from '../services/socketService';
import {
  FileSpreadsheet,
  FileText,
  ArrowLeft,
  RefreshCw,
  PanelRightClose,
  PanelRightOpen,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2
} from 'lucide-react';
import api from '../services/api';

export const InspectionWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { activeSession, setSession, activeTool, fitMode, zoomLevel, setZoomLevel, syncZoomLevel } = useInspectionStore();
  const [loading, setLoading] = useState(true);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number; totalPages: number }>({
    width: 800,
    height: 1100,
    totalPages: 1
  });

  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Sliding Taskbar & Sidebar State for Full Page Canvas Work
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [isTopBarOpen, setIsTopBarOpen] = useState(true);

  const isFullCanvasMode = !isTopBarOpen && !isRightSidebarOpen;

  const toggleFullCanvasMode = () => {
    if (isFullCanvasMode) {
      setIsTopBarOpen(true);
      setIsRightSidebarOpen(true);
    } else {
      setIsTopBarOpen(false);
      setIsRightSidebarOpen(false);
    }
  };

  // Container Viewport Size & Drag Panning State
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 800, height: 700 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0
  });

  useEffect(() => {
    if (!id) return;
    fetchSessionDetails(id);

    connectInspectionSocket(id);
    return () => {
      disconnectInspectionSocket(id);
    };
  }, [id]);

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

  // Spacebar listener for temporary panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((document.activeElement as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Window-level Panning event listener
  useEffect(() => {
    if (!isPanning) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      containerRef.current.scrollLeft = panStart.scrollLeft - dx;
      containerRef.current.scrollTop = panStart.scrollTop - dy;
    };

    const handleWindowMouseUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isPanning, panStart]);

  // Mouse Wheel Zooming Listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        const currentZoom = useInspectionStore.getState().zoomLevel;
        const newZoom = Math.round(Math.max(0.2, Math.min(4.0, currentZoom + delta)) * 100) / 100;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const scrollXRatio = (container.scrollLeft + mouseX) / (container.scrollWidth || 1);
        const scrollYRatio = (container.scrollTop + mouseY) / (container.scrollHeight || 1);

        setZoomLevel(newZoom);

        requestAnimationFrame(() => {
          if (container) {
            container.scrollLeft = scrollXRatio * container.scrollWidth - mouseX;
            container.scrollTop = scrollYRatio * container.scrollHeight - mouseY;
          }
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [setZoomLevel]);

  const handleMouseDownPan = (e: React.MouseEvent) => {
    const isPanAction = activeTool === 'PAN' || isSpacePressed || e.button === 1;
    if (!isPanAction || !containerRef.current) return;

    if (e.button === 1) {
      e.preventDefault();
    }

    setIsPanning(true);
    setPanStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop
    });
  };

  const handlePageRendered = (dim: { width: number; height: number; totalPages: number; scale?: number }) => {
    setCanvasDimensions({ width: dim.width, height: dim.height, totalPages: dim.totalPages });
    if (dim.scale && fitMode !== 'CUSTOM') {
      syncZoomLevel(dim.scale);
    }
  };

  const fetchSessionDetails = async (sessionId: string) => {
    try {
      const res = await api.get(`/inspections/${sessionId}`);
      setSession(res.data.session);
    } catch (err) {
      console.error('Failed to load inspection session:', err);
    } finally {
      setLoading(false);
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

      // Download file via Blob using authenticated api instance
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

      // Download file via Blob using authenticated api instance
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

  if (loading || !activeSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-medium mt-3">Loading Inspection Workspace & Drawing Canvas...</p>
      </div>
    );
  }

  const drawingFileUrl = `/api/drawings/${activeSession.drawingId}/file`;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden relative transition-colors text-slate-900 dark:text-slate-100">
      {/* Sliding Top Taskbar & Toolbar Container */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden z-20 shrink-0 ${
          isTopBarOpen ? 'max-h-[160px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        }`}
      >
        {/* Workspace Header Bar */}
        <div className="h-16 border-b border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/inspections')}
              className="p-2 text-slate-700 dark:text-slate-300 hover:text-blue-600 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 shadow-sm"
              title="Back to Inspections"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-base text-slate-900 dark:text-white font-display">{activeSession.name}</h2>
                
                <select
                  value={activeSession.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="bg-white dark:bg-slate-950 border border-slate-400 dark:border-slate-700 text-xs font-mono font-bold text-blue-700 dark:text-cyan-400 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 shadow-sm"
                >
                  <option value="DRAFT" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white font-mono font-bold">DRAFT</option>
                  <option value="IN_PROGRESS" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white font-mono font-bold">IN_PROGRESS</option>
                  <option value="COMPLETED" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white font-mono font-bold">COMPLETED</option>
                  <option value="APPROVED" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white font-mono font-bold">APPROVED</option>
                </select>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 font-mono flex items-center gap-3 mt-0.5">
                <span>Part: <strong className="text-slate-900 dark:text-slate-200">{activeSession.partNumber}</strong></span>
                <span>Batch: <strong className="text-slate-900 dark:text-slate-200">{activeSession.batchNumber}</strong></span>
                <span>Rev: <strong className="text-cyan-700 dark:text-cyan-400 font-bold">{activeSession.revision}</strong></span>
              </div>
            </div>
          </div>

          {/* Action Buttons, Collaborators & Slide Toggles */}
          <div className="flex items-center gap-3">
            <CollaboratorList />

            {/* Export Buttons */}
            <button
              onClick={handleExportExcel}
              disabled={generatingExcel}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl shadow-md shadow-emerald-700/20 transition-all disabled:opacity-50"
            >
              {generatingExcel ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>Export Excel</span>
            </button>

            <button
              onClick={handleExportMarkedPdf}
              disabled={generatingPdf}
              className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              {generatingPdf ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>Export PDF</span>
            </button>

            {/* Divider */}
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-800 mx-1" />

            {/* Full Canvas Focus Mode Toggle */}
            <button
              onClick={toggleFullCanvasMode}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-all shadow-sm ${
                isFullCanvasMode
                  ? 'bg-amber-600 text-white border-amber-500 shadow-amber-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title={isFullCanvasMode ? 'Exit Full Screen Mode' : 'Enter Full Screen Focus Mode'}
            >
              {isFullCanvasMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isFullCanvasMode ? 'Standard View' : 'Full Canvas'}</span>
            </button>

            {/* Slide Hide Top Taskbar Button */}
            <button
              onClick={() => setIsTopBarOpen(false)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-all shadow-sm"
              title="Slide Hide Top Taskbar & Toolbar"
            >
              <ChevronUp className="w-4 h-4" />
            </button>

            {/* Slide Hide Right Sidebar Button */}
            <button
              onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-all shadow-sm"
              title={isRightSidebarOpen ? 'Slide Hide Table' : 'Slide Show Table'}
            >
              {isRightSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <Toolbar totalPages={canvasDimensions.totalPages} />
      </div>

      {/* Floating Top Slide Down Pill Tab (Visible when Top Taskbar is collapsed) */}
      {!isTopBarOpen && (
        <button
          onClick={() => setIsTopBarOpen(true)}
          className="absolute top-2 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-b-2xl shadow-2xl flex items-center gap-2 text-xs font-bold transition-all hover:translate-y-0.5"
          title="Slide Down Taskbar & Toolbar"
        >
          <ChevronDown className="w-4 h-4 animate-bounce" />
          <span>Show Taskbar & Toolbar</span>
        </button>
      )}

      {/* Floating Right Slide Open Tab (Visible when Right Sidebar is collapsed) */}
      {!isRightSidebarOpen && (
        <button
          onClick={() => setIsRightSidebarOpen(true)}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-40 p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-l-2xl shadow-2xl flex items-center gap-1.5 transition-all duration-300 hover:scale-105"
          title="Slide Open Inspection Table Side Panel"
        >
          <PanelRightOpen className="w-5 h-5" />
          <span className="text-xs font-bold font-mono">Table</span>
        </button>
      )}

      {/* Main Canvas + Side Panel Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* PDF & Overlay Canvas Viewport Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDownPan}
          className={`flex-1 overflow-auto p-8 bg-slate-200 dark:bg-slate-950 flex relative transition-colors select-none ${
            activeTool === 'PAN' || isSpacePressed
              ? isPanning
                ? 'cursor-grabbing'
                : 'cursor-grab'
              : ''
          }`}
        >
          <div className="m-auto relative shrink-0 shadow-2xl rounded border border-slate-300 dark:border-slate-800 bg-white">
            <PDFCanvas
              pdfUrl={drawingFileUrl}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              onPageRendered={handlePageRendered}
            />
            {canvasDimensions.width > 0 && (
              <CanvasOverlay
                width={canvasDimensions.width}
                height={canvasDimensions.height}
              />
            )}
          </div>
        </div>

        {/* Sliding Inspection Table Side Panel Container */}
        <div
          className={`transition-all duration-300 ease-in-out flex shrink-0 border-slate-300 dark:border-slate-800 ${
            isRightSidebarOpen
              ? 'w-full lg:w-[480px] xl:w-[540px] border-l opacity-100'
              : 'w-0 border-none overflow-hidden opacity-0 pointer-events-none'
          }`}
        >
          <InspectionTable />
        </div>
      </div>

      {/* Manual Extraction Fallback Modal */}
      <ManualExtractionModal />
    </div>
  );
};
