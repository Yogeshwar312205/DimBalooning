import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileCode,
  CheckSquare,
  BarChart3,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Drawings', path: '/drawings', icon: FileCode },
    { label: 'Inspections', path: '/inspections', icon: CheckSquare },
    { label: 'Reports', path: '/reports', icon: BarChart3 },
    { label: 'Users', path: '/users', icon: Users },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside
      className={`relative border-r border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between p-3 shrink-0 transition-all duration-300 shadow-sm text-slate-900 dark:text-slate-100 ${
        collapsed ? 'w-16 items-center' : 'w-64'
      }`}
    >
      <div className="space-y-3 w-full">
        {/* Header & Slide Toggle */}
        <div className={`flex items-center justify-between px-2 py-1 ${collapsed ? 'justify-center' : ''}`}>
          {!collapsed && (
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
              Quality Control
            </span>
          )}
          <button
            onClick={toggleSidebar}
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all border border-slate-200 dark:border-slate-700 shadow-sm"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation items */}
        <nav className="space-y-1 w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${
                    collapsed ? 'justify-center px-0' : ''
                  } ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-extrabold'
                      : 'text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      {!collapsed && (
        <div className="p-3 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-300 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1 w-full">
          <div className="font-bold text-slate-900 dark:text-slate-200">FAIR / PPAP Engine</div>
          <div>PyMuPDF Vector Extraction</div>
          <div className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px] font-bold">
            PyMuPDF & Fabric.js Active
          </div>
        </div>
      )}
    </aside>
  );
};
