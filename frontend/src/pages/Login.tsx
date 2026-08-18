import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Layers, ShieldCheck, Lock, Mail, ArrowRight, Activity } from 'lucide-react';
import api from '../services/api';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginStore = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/auth/login', { email, password });
      loginStore(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to authenticate. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoUser = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorative Gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full glass-panel rounded-3xl p-8 border border-slate-800 shadow-2xl relative z-10">
        {/* Brand Logo Header */}
        <div className="text-center space-y-3 mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-xl shadow-blue-500/20 ring-1 ring-white/20">
            <Layers className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wide font-display">
              DIM-BALLOON <span className="text-cyan-400 font-mono text-sm">PRO</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Automated Manufacturing Quality Inspection & Validation
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-rose-950/70 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Work Email
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="inspector@factory.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-6"
          >
            <span>{loading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Demo Quick Fill Buttons */}
        <div className="mt-8 pt-6 border-t border-slate-800/80">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-mono mb-3 text-center">
            Quick Fill Demo Accounts:
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => fillDemoUser('inspector@factory.com')}
              className="px-3 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 text-left font-mono"
            >
              <div className="font-semibold text-emerald-400">Inspector</div>
              <div className="text-[10px] text-slate-500 truncate">inspector@factory.com</div>
            </button>

            <button
              type="button"
              onClick={() => fillDemoUser('admin@factory.com')}
              className="px-3 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-slate-300 text-left font-mono"
            >
              <div className="font-semibold text-blue-400">Chief Admin</div>
              <div className="text-[10px] text-slate-500 truncate">admin@factory.com</div>
            </button>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-400 hover:underline font-semibold">
            Register User
          </Link>
        </div>
      </div>
    </div>
  );
};
