import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { Layers, User, Mail, Lock, Shield, ArrowRight } from 'lucide-react';
import api from '../services/api';

export const Register: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('INSPECTOR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginStore = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/auth/register', { name, email, password, role });
      loginStore(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="max-w-md w-full glass-panel rounded-3xl p-8 border border-slate-800 shadow-2xl relative z-10">
        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white font-display">Create Quality Account</h2>
          <p className="text-xs text-slate-400">Join the industrial inspection team</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/70 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Yogeshwar Patil"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yogeshwar@factory.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Role Permission
            </label>
            <div className="relative">
              <Shield className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
              >
                <option value="INSPECTOR">INSPECTOR (Quality Control)</option>
                <option value="ENGINEER">ENGINEER (Manufacturing)</option>
                <option value="ADMIN">ADMIN (Quality Lead)</option>
                <option value="VIEWER">VIEWER (Auditor)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-4"
          >
            <span>{loading ? 'Creating Account...' : 'Register User'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-400 hover:underline font-semibold">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
