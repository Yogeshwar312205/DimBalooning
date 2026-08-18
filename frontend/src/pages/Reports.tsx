import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import api from '../services/api';

export const Reports: React.FC = () => {
  const [sessionsWithReports, setSessionsWithReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await api.get('/inspections');
      setSessionsWithReports(res.data.sessions);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = async (session: any) => {
    setLoadingReport((prev) => ({ ...prev, [`excel_${session.id}`]: true }));
    try {
      const res = await api.post('/reports/excel', { inspectionSessionId: session.id });
      const rawUrl: string = res.data.downloadUrl;
      const cleanUrl = rawUrl.startsWith('/api') ? rawUrl.replace(/^\/api/, '') : rawUrl;

      const fileRes = await api.get(cleanUrl, { responseType: 'blob' });
      const blob = new Blob([fileRes.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Inspection_Report_${session.partNumber || 'Export'}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download Excel error:', err);
      alert(err?.response?.data?.error || 'Failed to generate Excel report');
    } finally {
      setLoadingReport((prev) => ({ ...prev, [`excel_${session.id}`]: false }));
    }
  };

  const handleDownloadPdf = async (session: any) => {
    setLoadingReport((prev) => ({ ...prev, [`pdf_${session.id}`]: true }));
    try {
      const res = await api.post('/reports/pdf', { inspectionSessionId: session.id });
      const rawUrl: string = res.data.downloadUrl;
      const cleanUrl = rawUrl.startsWith('/api') ? rawUrl.replace(/^\/api/, '') : rawUrl;

      const fileRes = await api.get(cleanUrl, { responseType: 'blob' });
      const blob = new Blob([fileRes.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MarkedUp_Drawing_${session.partNumber || 'Export'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download PDF error:', err);
      alert(err?.response?.data?.error || 'Failed to generate marked-up PDF');
    } finally {
      setLoadingReport((prev) => ({ ...prev, [`pdf_${session.id}`]: false }));
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto bg-slate-50 dark:bg-slate-950 space-y-6 transition-colors text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide font-display">FAIR & PPAP Report Export Hub</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Download structured Excel inspection spreadsheets and PyMuPDF color-marked engineering PDFs.</p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading inspection reports...</div>
      ) : (
        <div className="space-y-4">
          {sessionsWithReports.map((session) => (
            <div key={session.id} className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">{session.name}</h3>
                <div className="text-xs text-slate-600 dark:text-slate-400 font-mono flex flex-wrap items-center gap-4">
                  <span>Part No: <strong className="text-slate-800 dark:text-slate-200">{session.partNumber}</strong></span>
                  <span>Batch: <strong className="text-slate-800 dark:text-slate-200">{session.batchNumber}</strong></span>
                  <span>Rev: <strong className="text-cyan-600 dark:text-cyan-400 font-bold">{session.revision}</strong></span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono pt-1">
                  Created by {session.createdBy?.name} on {new Date(session.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDownloadExcel(session)}
                  disabled={loadingReport[`excel_${session.id}`]}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  {loadingReport[`excel_${session.id}`] ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  <span>Download Excel (.xlsx)</span>
                </button>

                <button
                  onClick={() => handleDownloadPdf(session)}
                  disabled={loadingReport[`pdf_${session.id}`]}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  {loadingReport[`pdf_${session.id}`] ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  <span>Download Marked PDF</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
