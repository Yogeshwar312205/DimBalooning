import React from 'react';
import { Shield, UserCheck } from 'lucide-react';

export const Users: React.FC = () => {
  const usersList = [
    { name: 'Yogeshwar (Chief Quality Lead)', email: 'admin@factory.com', role: 'ADMIN', status: 'Active' },
    { name: 'Amit Kumar (Senior QA Inspector)', email: 'inspector@factory.com', role: 'INSPECTOR', status: 'Active' },
    { name: 'Rahul Sharma (Manufacturing Engineer)', email: 'engineer@factory.com', role: 'ENGINEER', status: 'Active' },
    { name: 'External Auditor', email: 'viewer@factory.com', role: 'VIEWER', status: 'Active' },
  ];

  return (
    <div className="flex-1 p-6 overflow-auto dark:bg-slate-950 light:bg-slate-50 space-y-6 transition-colors">
      <div className="flex items-center justify-between dark:bg-slate-900 light:bg-white border dark:border-slate-800 light:border-slate-200 p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold dark:text-white light:text-slate-900 tracking-wide font-display">User & Role Management</h2>
          <p className="text-xs dark:text-slate-400 light:text-slate-600 mt-1">Manage quality team members, inspector roles, and system permission levels.</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl border dark:border-slate-800 light:border-slate-200 overflow-hidden">
        <table className="w-full text-left text-xs dark:text-slate-300 light:text-slate-700">
          <thead className="dark:bg-slate-950 light:bg-slate-100 dark:text-slate-400 light:text-slate-600 font-semibold border-b dark:border-slate-800 light:border-slate-200 uppercase tracking-wider font-mono">
            <tr>
              <th className="py-3 px-4">User Name</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-slate-800/60 light:divide-slate-200 font-sans">
            {usersList.map((u, idx) => (
              <tr key={idx} className="dark:hover:bg-slate-900/40 light:hover:bg-slate-100">
                <td className="py-3.5 px-4 font-bold dark:text-white light:text-slate-900 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full dark:bg-slate-800 light:bg-slate-200 flex items-center justify-center dark:text-slate-300 light:text-slate-700">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  {u.name}
                </td>
                <td className="py-3.5 px-4 font-mono dark:text-slate-300 light:text-slate-700">{u.email}</td>
                <td className="py-3.5 px-4 font-mono text-cyan-500 font-bold">
                  <span className="inline-flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 rounded-full text-xs">
                    <Shield className="w-3 h-3" /> {u.role}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-emerald-500 font-semibold">
                  ● {u.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
