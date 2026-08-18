import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardStats } from '../types/inspection';
import { Badge } from '../components/Common/Badge';
import {
  FileText,
  Activity,
  Plus,
  ArrowUpRight,
  Percent,
  XCircle,
  Clock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import api from '../services/api';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const res = await api.get('/inspections/stats/dashboard');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 dark:bg-slate-950 light:bg-slate-50 dark:text-slate-400 light:text-slate-600">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto dark:bg-slate-950 light:bg-slate-50 space-y-6 transition-colors">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 dark:bg-gradient-to-r dark:from-slate-900 dark:to-slate-950 light:bg-white border dark:border-slate-800 light:border-slate-200 p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-bold dark:text-white light:text-slate-900 tracking-wide font-display flex items-center gap-2">
            Quality Assurance Dashboard
            <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
              Live Operations
            </span>
          </h2>
          <p className="text-xs dark:text-slate-400 light:text-slate-600 mt-1">
            Real-time shop-floor dimension ballooning, physical measurement validation & PPAP compliance tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/drawings')}
            className="flex items-center gap-2 px-4 py-2 dark:bg-slate-800 light:bg-slate-100 hover:bg-slate-700 dark:text-white light:text-slate-800 text-xs font-semibold rounded-xl border dark:border-slate-700 light:border-slate-300 transition-all"
          >
            <FileText className="w-4 h-4 text-blue-500" />
            <span>Manage Drawings</span>
          </button>

          <button
            onClick={() => navigate('/inspections')}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Inspection Session</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Drawings */}
        <div className="glass-panel p-5 rounded-2xl border dark:border-slate-800 light:border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold dark:text-slate-400 light:text-slate-500 uppercase tracking-wider">Drawings</p>
            <h3 className="text-2xl font-bold dark:text-white light:text-slate-900 mt-1 font-mono">{stats?.totalDrawings || 0}</h3>
            <p className="text-[11px] dark:text-slate-500 light:text-slate-400 mt-0.5">Engineering PDFs</p>
          </div>
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-500">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Active Inspections */}
        <div className="glass-panel p-5 rounded-2xl border dark:border-slate-800 light:border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold dark:text-slate-400 light:text-slate-500 uppercase tracking-wider">Active Sessions</p>
            <h3 className="text-2xl font-bold dark:text-white light:text-slate-900 mt-1 font-mono">{stats?.activeSessions || 0}</h3>
            <p className="text-[11px] text-blue-500 mt-0.5 flex items-center gap-1 font-mono">
              <Activity className="w-3 h-3 animate-pulse" /> In Progress
            </p>
          </div>
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-500">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* Pass Rate */}
        <div className="glass-panel p-5 rounded-2xl border dark:border-slate-800 light:border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold dark:text-slate-400 light:text-slate-500 uppercase tracking-wider">Pass Rate</p>
            <h3 className="text-2xl font-bold text-emerald-500 mt-1 font-mono">{stats?.passRate || 100}%</h3>
            <p className="text-[11px] text-emerald-500 mt-0.5">{stats?.passCount || 0} Dimensions Passed</p>
          </div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-500">
            <Percent className="w-6 h-6" />
          </div>
        </div>

        {/* Failed Measurements */}
        <div className="glass-panel p-5 rounded-2xl border dark:border-slate-800 light:border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold dark:text-slate-400 light:text-slate-500 uppercase tracking-wider">Failed Features</p>
            <h3 className="text-2xl font-bold text-rose-500 mt-1 font-mono">{stats?.failCount || 0}</h3>
            <p className="text-[11px] text-rose-500 mt-0.5">Out of tolerance</p>
          </div>
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500">
            <XCircle className="w-6 h-6" />
          </div>
        </div>

        {/* Pending Inspections */}
        <div className="glass-panel p-5 rounded-2xl border dark:border-slate-800 light:border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold dark:text-slate-400 light:text-slate-500 uppercase tracking-wider">Pending Checks</p>
            <h3 className="text-2xl font-bold dark:text-slate-300 light:text-slate-700 mt-1 font-mono">{stats?.pendingCount || 0}</h3>
            <p className="text-[11px] dark:text-slate-500 light:text-slate-400 mt-0.5">Awaiting measurement</p>
          </div>
          <div className="p-3 dark:bg-slate-800 light:bg-slate-200 border dark:border-slate-700 light:border-slate-300 rounded-xl dark:text-slate-400 light:text-slate-600">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Measurement Breakdown & Recent Inspection Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution Breakdown */}
        <div className="glass-panel p-6 rounded-2xl border dark:border-slate-800 light:border-slate-200 space-y-4">
          <h3 className="font-bold text-base dark:text-white light:text-slate-900 font-display">Measurement Status Metrics</h3>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-emerald-500 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 inline" /> PASS (In Tolerance)
                </span>
                <span className="font-mono dark:text-slate-300 light:text-slate-700">{stats?.passCount || 0}</span>
              </div>
              <div className="w-full dark:bg-slate-950 light:bg-slate-200 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full"
                  style={{
                    width: `${stats?.passCount ? (stats.passCount / (stats.passCount + stats.checkCount + stats.failCount || 1)) * 100 : 0}%`
                  }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-amber-500 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 inline" /> CHECK (Near Limits)
                </span>
                <span className="font-mono dark:text-slate-300 light:text-slate-700">{stats?.checkCount || 0}</span>
              </div>
              <div className="w-full dark:bg-slate-950 light:bg-slate-200 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full"
                  style={{
                    width: `${stats?.checkCount ? (stats.checkCount / (stats.passCount + stats.checkCount + stats.failCount || 1)) * 100 : 0}%`
                  }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-rose-500 font-semibold flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 inline" /> FAIL (Out of Tolerance)
                </span>
                <span className="font-mono dark:text-slate-300 light:text-slate-700">{stats?.failCount || 0}</span>
              </div>
              <div className="w-full dark:bg-slate-950 light:bg-slate-200 rounded-full h-2">
                <div
                  className="bg-rose-500 h-2 rounded-full"
                  style={{
                    width: `${stats?.failCount ? (stats.failCount / (stats.passCount + stats.checkCount + stats.failCount || 1)) * 100 : 0}%`
                  }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Inspection Sessions */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border dark:border-slate-800 light:border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base dark:text-white light:text-slate-900 font-display">Recent Inspection Sessions</h3>
            <button
              onClick={() => navigate('/inspections')}
              className="text-xs text-blue-500 hover:underline flex items-center gap-1 font-semibold"
            >
              View All <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2.5">
            {stats?.recentSessions && stats.recentSessions.length > 0 ? (
              stats.recentSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => navigate(`/inspections/${session.id}`)}
                  className="p-4 dark:bg-slate-900/80 light:bg-white border dark:border-slate-800 light:border-slate-200 hover:border-blue-500 rounded-xl flex items-center justify-between cursor-pointer transition-all hover:translate-x-1"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm dark:text-white light:text-slate-900">{session.name}</span>
                      <Badge status={session.status} size="sm" />
                    </div>
                    <div className="text-xs dark:text-slate-400 light:text-slate-600 font-mono flex items-center gap-3">
                      <span>Part: <span className="dark:text-slate-200 light:text-slate-800 font-bold">{session.partNumber}</span></span>
                      <span>Batch: <span className="dark:text-slate-200 light:text-slate-800 font-bold">{session.batchNumber}</span></span>
                      <span>Inspector: <span className="dark:text-slate-200 light:text-slate-800">{session.createdBy?.name}</span></span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-blue-500 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-2.5 py-1 rounded-lg">
                      {session._count?.balloons || 0} Balloons
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">No recent inspection sessions found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
