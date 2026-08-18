import React from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore } from '../../store/useThemeStore';
import { Shield, LogOut, User as UserIcon, Activity, Layers, Sun, Moon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-16 border-b border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between sticky top-0 z-50 transition-colors shadow-sm text-slate-900 dark:text-slate-100">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20 ring-1 ring-white/20">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-900 dark:text-white tracking-wide flex items-center gap-2 font-display">
              DIM-BALLOON<span className="text-cyan-600 dark:text-cyan-400 text-xs px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950 border border-cyan-300 dark:border-cyan-800 font-mono font-bold">PRO</span>
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Automated Inspection & Quality Validation Platform</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* System Connected Badge */}
        <div className="hidden sm:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5">
          <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">System Connected</span>
        </div>

        {/* Day / Night Mode Toggle Switch */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-100 border-amber-300 text-amber-900 dark:bg-slate-800 dark:border-slate-700 dark:text-amber-300 border text-xs font-bold shadow-sm transition-all hover:scale-105"
          title={`Switch to ${theme === 'dark' ? 'Day (Light) Mode' : 'Night (Dark) Mode'}`}
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline font-mono">Day Mode ☀️</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-600" />
              <span className="hidden md:inline font-mono">Night Mode 🌙</span>
            </>
          )}
        </button>

        {user && (
          <div className="flex items-center gap-3 border-l border-slate-300 dark:border-slate-800 pl-4">
            <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-800 dark:text-slate-200 font-bold">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="hidden md:block">
              <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{user.name}</div>
              <div className="text-xs text-blue-600 dark:text-cyan-400 font-mono font-bold flex items-center gap-1">
                <Shield className="w-3 h-3 inline" /> {user.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors ml-1"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
