import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileCode, CheckSquare, BarChart3, Users, Settings } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Drawings', path: '/drawings', icon: FileCode },
    { label: 'Inspections', path: '/inspections', icon: CheckSquare },
    { label: 'Reports', path: '/reports', icon: BarChart3 },
    { label: 'Users', path: '/users', icon: Users },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between p-4 shrink-0 transition-colors shadow-sm text-slate-900 dark:text-slate-100">
      <div className="space-y-1">
        <div className="px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
          Quality Control
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold'
                      : 'text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="p-3 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-300 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
        <div className="font-bold text-slate-900 dark:text-slate-200">FAIR / PPAP Engine</div>
        <div>PyMuPDF Vector Extraction</div>
        <div className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px] font-bold">PyMuPDF & Fabric.js Active</div>
      </div>
    </aside>
  );
};
