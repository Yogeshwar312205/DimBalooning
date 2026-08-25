import React from 'react';
import { NavLink } from 'react-router-dom';
import { Layers, Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../../store/useThemeStore';

export const Sidebar: React.FC = () => {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <aside className="w-16 hover:w-56 group transition-all duration-300 ease-in-out border-r border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between p-3 shrink-0 z-40 shadow-sm text-slate-900 dark:text-slate-100">
      {/* Brand Icon & Nav Links */}
      <div className="space-y-4">

        <nav className="space-y-2">
          <NavLink
            to="/drawings"
            title="Drawings Library"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${
                isActive
                  ? 'text-black'
                  : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`
            }
          >
            <Layers className="w-5 h-5 shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap overflow-hidden">
              Drawings Library
            </span>
          </NavLink>
        </nav>
      </div>

      {/* Minimalist Theme Switcher (Moon / Sun Icon Only) */}
      <div className="flex items-center justify-start px-1">
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light Mode' : 'Dark Mode'}`}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 transition-all shadow-sm"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-indigo-600" />
          )}
        </button>
      </div>
    </aside>
  );
};