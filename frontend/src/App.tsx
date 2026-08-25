import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useThemeStore } from './store/useThemeStore';
import { Sidebar } from './components/Layout/Sidebar';

// Core Workflow Pages
import { Drawings } from './pages/Drawings';
import { InspectionWorkspace } from './pages/InspectionWorkspace';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen w-screen bg-slate-100 dark:bg-slate-950 overflow-hidden font-sans text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 transition-colors">
        {children}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/drawings" element={<AppLayout><Drawings /></AppLayout>} />
        <Route path="/inspections/:id" element={<AppLayout><InspectionWorkspace /></AppLayout>} />

        {/* Default Auto-Redirect to Drawings Library */}
        <Route path="/" element={<Navigate to="/drawings" replace />} />
        <Route path="*" element={<Navigate to="/drawings" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;