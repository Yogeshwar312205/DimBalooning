import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InspectionSession } from '../types/inspection';
import { Badge } from '../components/Common/Badge';
import { CheckSquare, ArrowRight, User, Calendar } from 'lucide-react';
import api from '../services/api';

export const Inspections: React.FC = () => {
  const [sessions, setSessions] = useState<InspectionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await api.get('/inspections');
      setSessions(res.data.sessions);
    } catch (err) {
      console.error('Failed to fetch inspection sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto bg-slate-50 dark:bg-slate-950 space-y-6 transition-colors text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide font-display">Quality Inspection Sessions</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Manage active article inspections, FAIR audits, and physical measurement logs.</p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading inspection sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="py-16 text-center glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <CheckSquare className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Active Inspection Sessions</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">Go to Drawings page to launch a new inspection workspace.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => navigate(`/inspections/${session.id}`)}
              className="glass-panel rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-blue-500 cursor-pointer transition-all hover:translate-x-1 shadow-sm"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">{session.name}</h3>
                  <Badge status={session.status} size="sm" />
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400 font-mono flex flex-wrap items-center gap-4">
                  <span>Part No: <strong className="text-slate-800 dark:text-slate-200">{session.partNumber}</strong></span>
                  <span>Part Name: <strong className="text-slate-800 dark:text-slate-200">{session.partName}</strong></span>
                  <span>Batch: <strong className="text-slate-800 dark:text-slate-200">{session.batchNumber}</strong></span>
                  <span>Rev: <strong className="text-cyan-600 dark:text-cyan-400 font-bold">{session.revision}</strong></span>
                </div>

                <div className="text-[11px] text-slate-500 font-mono flex items-center gap-4 pt-0.5">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" /> Inspector: {session.createdBy?.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> Created: {new Date(session.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">{session._count?.balloons || 0} Balloons</div>
                  <div className="text-[10px] text-slate-500">Characteristics</div>
                </div>

                <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl">
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
