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
import { FileSpreadsheet, FileText, ArrowLeft, RefreshCw } from 'lucide-react';
import api from '../services/api';

export const InspectionWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { activeSession, setSession, activeTool } = useInspectionStore();
  const [loading, setLoading] = useState(true);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number; totalPages: number }>({
    width: 800,
    height: 1100,
    totalPages: 1
  });

  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

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
        <p className="text-sm font-medium mt-3">Loading Inspection Workspace & Drawing Canvas...</p>
      </div>
    );
  }

  const drawingFileUrl = `/api/drawings/${activeSession.drawingId}/file`;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden relative transition-colors text-slate-900 dark:text-slate-100">
      {/* Workspace Header Bar */}
      <div className="h-16 border-b border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between shrink-0 transition-colors shadow-sm">
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

        {/* Action Buttons & Collaborators */}
        <div className="flex items-center gap-3">
          <CollaboratorList />

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
            <span>Export Excel Report</span>
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
            <span>Export Marked PDF</span>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <Toolbar totalPages={canvasDimensions.totalPages} />

      {/* Main Split Screen Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* PDF & Overlay Canvas Viewport Container */}
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

        {/* Inspection Table Side Panel */}
        <div className="w-full lg:w-[480px] xl:w-[540px] flex shrink-0 border-l border-slate-300 dark:border-slate-800">
          <InspectionTable />
        </div>
      </div>

      {/* Manual Extraction Fallback Modal */}
      <ManualExtractionModal />
    </div>
  );
};
