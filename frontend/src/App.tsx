import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useThemeStore } from './store/useThemeStore';
import { Navbar } from './components/Layout/Navbar';
import { Sidebar } from './components/Layout/Sidebar';

// Pages
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Drawings } from './pages/Drawings';
import { Inspections } from './pages/Inspections';
import { InspectionWorkspace } from './pages/InspectionWorkspace';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';

const ProtectedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 dark:bg-slate-950 overflow-hidden font-sans text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 transition-colors">
          {children}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  const { initAuth, isAuthenticated } = useAuthStore();
  const { initTheme } = useThemeStore();

  useEffect(() => {
    initAuth();
    initTheme();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Auth Routes */}
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Register />} />

        {/* Protected Dashboard & App Routes */}
        <Route path="/dashboard" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
        <Route path="/drawings" element={<ProtectedLayout><Drawings /></ProtectedLayout>} />
        <Route path="/inspections" element={<ProtectedLayout><Inspections /></ProtectedLayout>} />
        <Route path="/inspections/:id" element={<ProtectedLayout><InspectionWorkspace /></ProtectedLayout>} />
        <Route path="/reports" element={<ProtectedLayout><Reports /></ProtectedLayout>} />
        <Route path="/users" element={<ProtectedLayout><Users /></ProtectedLayout>} />
        <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />

        {/* Root Redirect */}
        <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
