import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawing } from '../types/drawing';
import { 
  Upload, 
  FileCode, 
  Plus, 
  Calendar, 
  Layers, 
  ChevronRight, 
  FileSpreadsheet, 
  FileText, 
  Play, 
  X,
  RefreshCw 
} from 'lucide-react';
import api from '../services/api';

export const Drawings: React.FC = () => {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<any | null>(null);
  const [createSessionModalOpen, setCreateSessionModalOpen] = useState(false);

  // Upload Form State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [drawingName, setDrawingName] = useState('');
  const [revision, setRevision] = useState('Rev A');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Session Form State
  const [sessionName, setSessionName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [partName, setPartName] = useState('');
  const [batchNumber, setBatchNumber] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    fetchDrawings();
  }, []);

  const fetchDrawings = async () => {
    try {
      const res = await api.get('/drawings');
      setDrawings(res.data.drawings);
    } catch (err) {
      console.error('Failed to fetch drawings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) {
      setError('Please select an engineering PDF drawing file');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    const finalDrawingName = drawingName || pdfFile.name.replace(/\.[^/.]+$/, '');
    formData.append('pdf', pdfFile);
    formData.append('name', finalDrawingName);
    formData.append('revision', revision);

    try {
      // Step 1: Upload and auto-extract (Backend creates Drawing + Session + Balloons in 1 step)
      const res = await api.post('/drawings', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const newSessionId = res.data.session.id;

      setUploadModalOpen(false);
      setPdfFile(null);
      setDrawingName('');

      // Step 2: Route directly into the populated canvas cockpit
      navigate(`/inspections/${newSessionId}`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to process PDF drawing');
      setUploading(false);
    }
  };

  const handleCreateNewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDrawing) return;

    try {
      const res = await api.post('/inspections', {
        drawingId: selectedDrawing.id,
        name: sessionName,
        partNumber,
        partName,
        revision: selectedDrawing.revision,
        batchNumber
      });

      setCreateSessionModalOpen(false);
      navigate(`/inspections/${res.data.session.id}`);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create inspection session');
    }
  };

  const openNewSessionModal = (drawing: any) => {
    setSelectedDrawing(drawing);
    setSessionName(`Inspection Run #${(drawing.inspectionSessions?.length || 0) + 1} - ${drawing.name}`);
    setPartNumber(drawing.name.split(' ')[0] || 'PART-1001');
    setPartName(drawing.name);
    setBatchNumber(`BATCH-${Math.floor(1000 + Math.random() * 9000)}`);
    setCreateSessionModalOpen(true);
  };

  const handleDirectDownloadExcel = async (sessionId: string, partNum: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.post('/reports/excel', { inspectionSessionId: sessionId });
      const rawUrl: string = res.data.downloadUrl;
      const cleanUrl = rawUrl.startsWith('/api') ? rawUrl.replace(/^\/api/, '') : rawUrl;

      const fileRes = await api.get(cleanUrl, { responseType: 'blob' });
      const blob = new Blob([fileRes.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Inspection_Report_${partNum}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to download Excel report');
    }
  };

  const handleDirectDownloadPdf = async (sessionId: string, partNum: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await api.post('/reports/pdf', { inspectionSessionId: sessionId });
      const rawUrl: string = res.data.downloadUrl;
      const cleanUrl = rawUrl.startsWith('/api') ? rawUrl.replace(/^\/api/, '') : rawUrl;

      const fileRes = await api.get(cleanUrl, { responseType: 'blob' });
      const blob = new Blob([fileRes.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MarkedUp_Drawing_${partNum}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to download Marked PDF');
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto bg-slate-50 dark:bg-slate-950 space-y-6 transition-colors">
      {/* Top Banner */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide font-display">Engineering Drawings Hub</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Upload CAD drawings, view historical inspection runs, and export FAIR/PPAP reports.</p>
        </div>

        <button
          onClick={() => setUploadModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all"
        >
          <Upload className="w-4 h-4" />
          <span>Upload PDF Drawing</span>
        </button>
      </div>

      {/* Drawings Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading drawings library...</div>
      ) : drawings.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 space-y-3">
          <FileCode className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Drawings Uploaded</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">Upload your first 2D engineering PDF to begin automatic dimension ballooning.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {drawings.map((drawing: any) => {
            const sessionCount = drawing.inspectionSessions?.length || 0;
            const latestSession = drawing.inspectionSessions?.[0];

            return (
              <div 
                key={drawing.id} 
                onClick={() => setSelectedDrawing(drawing)}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 p-5 flex flex-col justify-between space-y-4 hover:border-blue-500 dark:hover:border-blue-500 shadow-sm transition-all cursor-pointer group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-600 dark:text-blue-400 shrink-0">
                      <FileCode className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 border border-slate-300 dark:border-slate-700">
                      {drawing.revision}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {drawing.name}
                  </h3>

                  <div className="text-xs text-slate-600 dark:text-slate-400 font-mono space-y-1 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      <span>Pages: <strong className="text-slate-900 dark:text-slate-200">{drawing.pageCount}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Uploaded: {new Date(drawing.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-slate-600 dark:text-slate-400">
                    {sessionCount} {sessionCount === 1 ? 'Inspection Run' : 'Inspection Runs'}
                  </span>
                  
                  <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold group-hover:translate-x-1 transition-transform">
                    <span>View Runs</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drawing Detail & Inspection History Drawer */}
      {selectedDrawing && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border-l border-slate-300 dark:border-slate-800 h-full flex flex-col justify-between shadow-2xl p-6 overflow-y-auto">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">Drawing Details</span>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{selectedDrawing.name}</h2>
                  <div className="flex items-center gap-3 text-xs text-slate-500 font-mono mt-1">
                    <span>Revision: <strong>{selectedDrawing.revision}</strong></span>
                    <span>•</span>
                    <span>Pages: <strong>{selectedDrawing.pageCount}</strong></span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDrawing(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action Button: Start New Run */}
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider font-mono">Inspection Runs</h3>
                <button
                  onClick={() => openNewSessionModal(selectedDrawing)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Start New Run</span>
                </button>
              </div>

              {/* Sessions List */}
              <div className="space-y-3">
                {(!selectedDrawing.inspectionSessions || selectedDrawing.inspectionSessions.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                    No inspection sessions found for this drawing yet.
                  </div>
                ) : (
                  selectedDrawing.inspectionSessions.map((session: any) => (
                    <div 
                      key={session.id}
                      className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 hover:border-blue-500 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{session.name}</h4>
                          <div className="text-xs text-slate-500 font-mono mt-0.5 space-x-2">
                            <span>Batch: <strong>{session.batchNumber}</strong></span>
                            <span>•</span>
                            <span>Part: <strong>{session.partNumber}</strong></span>
                          </div>
                        </div>

                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                          session.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                          session.status === 'COMPLETED' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                          'bg-amber-500/10 text-amber-600 border-amber-500/20'
                        }`}>
                          {session.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                        <span className="text-slate-500 font-mono text-[11px]">
                          {session._count?.balloons || 0} Balloons Detected
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => handleDirectDownloadExcel(session.id, session.partNumber, e)}
                            title="Download Excel Report"
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg border border-slate-300 dark:border-slate-700"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDirectDownloadPdf(session.id, session.partNumber, e)}
                            title="Download Marked PDF"
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg border border-slate-300 dark:border-slate-700"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => navigate(`/inspections/${session.id}`)}
                            className="flex items-center gap-1 px-3 py-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-lg text-xs hover:opacity-90 transition-opacity"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Open Canvas</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload PDF Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">Upload Engineering Drawing PDF</h3>
            {error && <div className="p-3 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 rounded-xl text-xs">{error}</div>}

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Select PDF File</label>
                <input
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={(e) => setPdfFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-700 dark:text-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Drawing Name / Title</label>
                <input
                  type="text"
                  value={drawingName}
                  onChange={(e) => setDrawingName(e.target.value)}
                  placeholder="e.g. GB-1049 Transmission Housing"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Revision Level</label>
                <input
                  type="text"
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  placeholder="Rev A"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-xl"
                >
                  {uploading ? 'Auto-Extracting & Placing Balloons...' : 'Upload & Launch Cockpit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Session Modal */}
      {createSessionModalOpen && selectedDrawing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">Start New Inspection Run</h3>
            <form onSubmit={handleCreateNewSession} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Session Name</label>
                <input
                  type="text"
                  required
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Part Number</label>
                  <input
                    type="text"
                    required
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Batch Number</label>
                  <input
                    type="text"
                    required
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Part Name</label>
                <input
                  type="text"
                  required
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateSessionModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl"
                >
                  Launch Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};