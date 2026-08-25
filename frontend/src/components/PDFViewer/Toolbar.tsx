import React from 'react';
import { useInspectionStore } from '../../store/useInspectionStore';
import { 
  MousePointer, 
  CircleDot, 
  Move, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  MoveHorizontal, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight, 
  Trash2 
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
    rotation,
    rotateCanvas,
    currentPage,
    setCurrentPage,
    selectedBalloonId,
    deleteSelectedBalloon
  } = useInspectionStore();

  const handleZoomIn = () => setZoomLevel(zoomLevel + 0.2);
  const handleZoomOut = () => setZoomLevel(zoomLevel - 0.2);

  return (
    <div className="h-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between shrink-0 transition-colors shadow-sm text-slate-900 dark:text-slate-100">
      {/* Tool Selection */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTool('SELECT')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'SELECT'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Select & Move Balloon"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Select</span>
          </button>

          <button
            onClick={() => setActiveTool('BALLOON')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'BALLOON'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Click drawing to add balloon"
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span>Add Balloon</span>
          </button>

          <button
            onClick={() => setActiveTool('PAN')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              activeTool === 'PAN'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Pan & Drag Drawing Canvas"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Pan / Move</span>
          </button>

          {/* Delete Balloon Button */}
          {selectedBalloonId && (
            <button
              onClick={() => deleteSelectedBalloon()}
              className="flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-sm transition-all animate-pulse"
              title="Delete Selected Balloon (Press Delete key)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Page Navigation */}
      <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 px-2.5 py-0.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono">
        <button
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage(currentPage - 1)}
          className="p-1 text-slate-700 dark:text-slate-300 hover:text-blue-600 disabled:opacity-30"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-slate-900 dark:text-slate-200 font-bold text-xs">
          Page <span className="text-blue-600 font-extrabold">{currentPage}</span> of {totalPages || 1}
        </span>
        <button
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage(currentPage + 1)}
          className="p-1 text-slate-700 dark:text-slate-300 hover:text-blue-600 disabled:opacity-30"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Viewport Fit, Rotate & Zoom Controls */}
      <div className="flex items-center gap-2">
        {/* Fit & Rotate Controls */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 gap-1">
          <button
            onClick={() => setFitMode('FIT_PAGE')}
            className={`px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              fitMode === 'FIT_PAGE'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Fit Entire Page"
          >
            <Maximize2 className="w-3 h-3" />
            <span className="hidden sm:inline font-mono text-[11px]">Fit Page</span>
          </button>

          <button
            onClick={() => setFitMode('FIT_WIDTH')}
            className={`px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              fitMode === 'FIT_WIDTH'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
            title="Fit Page Width"
          >
            <MoveHorizontal className="w-3 h-3" />
            <span className="hidden sm:inline font-mono text-[11px]">Fit Width</span>
          </button>

          <button
            onClick={rotateCanvas}
            className="px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all"
            title="Rotate Drawing 90° Clockwise"
          >
            <RotateCw className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span className="font-mono text-[11px]">{rotation}°</span>
          </button>
        </div>

        {/* Manual Zoom Controls */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-0.5 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={handleZoomOut}
            className="p-1 text-slate-700 dark:text-slate-300 hover:text-blue-600 rounded-lg"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-1.5 text-xs font-mono font-extrabold text-slate-900 dark:text-slate-100 min-w-[45px] text-center">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 text-slate-700 dark:text-slate-300 hover:text-blue-600 rounded-lg"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};