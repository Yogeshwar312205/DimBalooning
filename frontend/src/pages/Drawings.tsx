import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawing } from '../types/drawing';
import { Upload, FileCode, Plus, Calendar, Layers } from 'lucide-react';
import api from '../services/api';

export const Drawings: React.FC = () => {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [createSessionModalOpen, setCreateSessionModalOpen] = useState(false);
  const [selectedDrawingForSession, setSelectedDrawingForSession] = useState<Drawing | null>(null);

  // Upload Form State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [drawingName, setDrawingName] = useState('');
  const [revision, setRevision] = useState('Rev A');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session Form State
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
    formData.append('pdf', pdfFile);
    formData.append('name', drawingName || pdfFile.name.replace(/\.[^/.]+$/, ''));
    formData.append('revision', revision);

    try {
      const res = await api.post('/drawings', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDrawings([res.data.drawing, ...drawings]);
      setUploadModalOpen(false);
      setPdfFile(null);
      setDrawingName('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to upload PDF drawing');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDrawingForSession) return;

    try {
      const res = await api.post('/inspections', {
        drawingId: selectedDrawingForSession.id,
        name: sessionName,
        partNumber,
        partName,
        revision: selectedDrawingForSession.revision,
        batchNumber
      });

      setCreateSessionModalOpen(false);
      navigate(`/inspections/${res.data.session.id}`);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to create inspection session');
    }
  };

  const openCreateSession = (drawing: Drawing) => {
    setSelectedDrawingForSession(drawing);
    setSessionName(`FAIR Inspection - ${drawing.name}`);
    setPartNumber(drawing.name.split(' ')[0] || 'PART-1001');
    setPartName(drawing.name);
    setBatchNumber(`BATCH-${Math.floor(1000 + Math.random() * 9000)}`);
    setCreateSessionModalOpen(true);
  };

  return (
    <div className="flex-1 p-6 overflow-auto dark:bg-slate-950 light:bg-slate-50 space-y-6 transition-colors">
      {/* Top Banner */}
      <div className="flex items-center justify-between dark:bg-slate-900 light:bg-white border dark:border-slate-800 light:border-slate-200 p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold dark:text-white light:text-slate-900 tracking-wide font-display">Engineering Drawings Library</h2>
          <p className="text-xs dark:text-slate-400 light:text-slate-600 mt-1">Upload and manage vector engineering PDFs for ballooning and quality validation.</p>
        </div>

        <button
          onClick={() => setUploadModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all"
        >
          <Upload className="w-4 h-4" />
          <span>Upload PDF Drawing</span>
        </button>
      </div>

      {/* Drawings Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading drawings library...</div>
      ) : drawings.length === 0 ? (
        <div className="py-16 text-center glass-panel rounded-2xl border dark:border-slate-800 light:border-slate-200 space-y-3">
          <FileCode className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold dark:text-white light:text-slate-900">No Drawings Uploaded</h3>
          <p className="text-xs dark:text-slate-400 light:text-slate-600">Upload your first 2D engineering PDF to begin dimension ballooning.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {drawings.map((drawing) => (
            <div key={drawing.id} className="glass-panel rounded-2xl border dark:border-slate-800 light:border-slate-200 p-5 flex flex-col justify-between space-y-4 hover:border-blue-500 transition-all">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-500 shrink-0">
                    <FileCode className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full dark:bg-slate-800 light:bg-slate-200 text-cyan-500 border dark:border-slate-700 light:border-slate-300">
                    {drawing.revision}
                  </span>
                </div>

                <h3 className="font-bold text-base dark:text-white light:text-slate-900 leading-snug line-clamp-2">{drawing.name}</h3>

                <div className="text-xs dark:text-slate-400 light:text-slate-600 font-mono space-y-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span>Page Count: <strong className="dark:text-slate-200 light:text-slate-800">{drawing.pageCount} Pages</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Uploaded: {new Date(drawing.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t dark:border-slate-800 light:border-slate-200 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-mono">
                  {drawing._count?.inspectionSessions || 0} Active Sessions
                </span>
                <button
                  onClick={() => openCreateSession(drawing)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 dark:bg-slate-800 light:bg-slate-100 dark:hover:bg-slate-700 light:hover:bg-slate-200 dark:text-white light:text-slate-800 text-xs font-semibold rounded-xl border dark:border-slate-700 light:border-slate-300 transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Start Inspection</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload PDF Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="dark:bg-slate-900 light:bg-white border dark:border-slate-800 light:border-slate-200 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-base dark:text-white light:text-slate-900">Upload Engineering Drawing PDF</h3>
            {error && <div className="p-3 bg-rose-950 text-rose-300 rounded-xl text-xs">{error}</div>}

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold dark:text-slate-400 light:text-slate-600 uppercase mb-1">Select PDF File</label>
                <input
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={(e) => setPdfFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full dark:bg-slate-950 light:bg-slate-100 border dark:border-slate-800 light:border-slate-300 rounded-xl p-2.5 text-xs dark:text-slate-300 light:text-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold dark:text-slate-400 light:text-slate-600 uppercase mb-1">Drawing Name / Title</label>
                <input
                  type="text"
                  value={drawingName}
                  onChange={(e) => setDrawingName(e.target.value)}
                  placeholder="e.g. GB-1049 Transmission Housing"
                  className="w-full dark:bg-slate-950 light:bg-slate-100 border dark:border-slate-800 light:border-slate-300 rounded-xl px-3.5 py-2 dark:text-white light:text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold dark:text-slate-400 light:text-slate-600 uppercase mb-1">Revision Level</label>
                <input
                  type="text"
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  placeholder="Rev A"
                  className="w-full dark:bg-slate-950 light:bg-slate-100 border dark:border-slate-800 light:border-slate-300 rounded-xl px-3.5 py-2 dark:text-white light:text-slate-900 font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 dark:text-slate-400 light:text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-xl"
                >
                  {uploading ? 'Processing & Vectorizing PDF...' : 'Upload & Process'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Inspection Session Modal */}
      {createSessionModalOpen && selectedDrawingForSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="dark:bg-slate-900 light:bg-white border dark:border-slate-800 light:border-slate-200 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-base dark:text-white light:text-slate-900">Create Inspection Session</h3>
            <form onSubmit={handleCreateSessionSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold dark:text-slate-400 light:text-slate-600 uppercase mb-1">Session Name</label>
                <input
                  type="text"
                  required
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="w-full dark:bg-slate-950 light:bg-slate-100 border dark:border-slate-800 light:border-slate-300 rounded-xl px-3.5 py-2 dark:text-white light:text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold dark:text-slate-400 light:text-slate-600 uppercase mb-1">Part Number</label>
                  <input
                    type="text"
                    required
                    value={partNumber}
                    onChange={(e) => setPartNumber(e.target.value)}
                    className="w-full dark:bg-slate-950 light:bg-slate-100 border dark:border-slate-800 light:border-slate-300 rounded-xl px-3 py-2 dark:text-white light:text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold dark:text-slate-400 light:text-slate-600 uppercase mb-1">Batch Number</label>
                  <input
                    type="text"
                    required
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    className="w-full dark:bg-slate-950 light:bg-slate-100 border dark:border-slate-800 light:border-slate-300 rounded-xl px-3 py-2 dark:text-white light:text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold dark:text-slate-400 light:text-slate-600 uppercase mb-1">Part Name</label>
                <input
                  type="text"
                  required
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  className="w-full dark:bg-slate-950 light:bg-slate-100 border dark:border-slate-800 light:border-slate-300 rounded-xl px-3.5 py-2 dark:text-white light:text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateSessionModalOpen(false)}
                  className="px-4 py-2 dark:text-slate-400 light:text-slate-600"
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
