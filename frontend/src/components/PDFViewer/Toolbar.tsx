import React, { useState } from 'react';
import { useInspectionStore } from '../../store/useInspectionStore';
import {
  MousePointer,
  CircleDot,
  Move,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoveHorizontal,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface ToolbarProps {
  totalPages: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({ totalPages }) => {
  const {
    activeTool,
    setActiveTool,
    zoomLevel,
    setZoomLevel,
    fitMode,
    setFitMode,
    currentPage,
    setCurrentPage,
    selectedBalloonId,
    deleteSelectedBalloon,
    autoDetectAllBalloons
  } = useInspectionStore();

  const [isDetecting, setIsDetecting] = useState(false);

  const handleAutoDetect = async () => {
    setIsDetecting(true);
    try {
      const res = await autoDetectAllBalloons();
      if (res && res.count > 0) {
        alert(`Successfully detected and created ${res.count} dimension balloons!`);
      } else {
        alert(res?.message || 'No new dimension callouts found on this page.');
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to auto detect balloons on drawing.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleZoomIn = () => setZoomLevel(zoomLevel + 0.2);
  const handleZoomOut = () => setZoomLevel(zoomLevel - 0.2);

  return (
    <div className="h-14 border-b border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between shrink-0 transition-colors shadow-sm text-slate-900 dark:text-slate-100">
      {/* Tool Selection & Auto Detect */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-300 dark:border-slate-800">
          <button
            onClick={() => setActiveTool('SELECT')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'SELECT'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Select & Move Balloon"
          >
            <MousePointer className="w-4 h-4" />
            <span>Select</span>
          </button>

          <button
            onClick={() => setActiveTool('BALLOON')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'BALLOON'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Click drawing to add balloon"
          >
            <CircleDot className="w-4 h-4" />
            <span>Add Balloon</span>
          </button>

          <button
            onClick={() => setActiveTool('PAN')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'PAN'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Pan & Drag Drawing Canvas"
          >
            <Move className="w-4 h-4" />
            <span>Pan / Move</span>
          </button>

          {/* Delete Balloon Button */}
          {selectedBalloonId && (
            <button
              onClick={() => deleteSelectedBalloon()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-md shadow-rose-500/20 transition-all animate-pulse"
              title="Delete Selected Balloon (Press Delete key)"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Balloon</span>
            </button>
          )}
        </div>

        {/* Prominent Auto Detect All Button */}
        <button
          onClick={handleAutoDetect}
          disabled={isDetecting}
          className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-extrabold rounded-xl shadow-md shadow-amber-500/20 transition-all disabled:opacity-50"
          title="Automatically detect and balloon all dimensions on this drawing page"
        >
          {isDetecting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span>Auto Detect All</span>
        </button>
      </div>

      {/* Page Navigation */}
      <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 px-3 py-1 rounded-xl border border-slate-300 dark:border-slate-800 text-xs font-mono">
        <button
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage(currentPage - 1)}
          className="p-1 text-slate-700 dark:text-slate-300 hover:text-blue-600 disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-slate-900 dark:text-slate-200 font-bold">
          Page <span className="text-blue-600 font-extrabold">{currentPage}</span> of {totalPages || 1}
        </span>
        <button
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage(currentPage + 1)}
          className="p-1 text-slate-700 dark:text-slate-300 hover:text-blue-600 disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Viewport Fit & Zoom Controls */}
      <div className="flex items-center gap-2">
        {/* Fit Controls */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-300 dark:border-slate-800 gap-1">
          <button
            onClick={() => setFitMode('FIT_PAGE')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              fitMode === 'FIT_PAGE'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Fit Entire Page to Container Viewport"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-mono">Fit Page</span>
          </button>

          <button
            onClick={() => setFitMode('FIT_WIDTH')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              fitMode === 'FIT_WIDTH'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Fit Page Width to Container"
          >
            <MoveHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-mono">Fit Width</span>
          </button>
        </div>

        {/* Manual Zoom Controls */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-300 dark:border-slate-800">
          <button
            onClick={handleZoomOut}
            className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-blue-600 rounded-lg"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-mono font-extrabold text-slate-900 dark:text-slate-100 min-w-[50px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 text-slate-700 dark:text-slate-300 hover:text-blue-600 rounded-lg"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
