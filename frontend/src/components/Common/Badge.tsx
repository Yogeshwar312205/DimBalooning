import React from 'react';

interface BadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Badge: React.FC<BadgeProps> = ({ status, size = 'md' }) => {
  const normalizedStatus = status ? status.toUpperCase() : 'PENDING';

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm'
  };

  const getStatusStyles = () => {
    switch (normalizedStatus) {
      case 'PASS':
        return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold';
      case 'CHECK':
        return 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold';
      case 'FAIL':
        return 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-400 font-bold';
      case 'PENDING':
        return 'bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-400 font-bold';
      case 'DRAFT':
        return 'bg-slate-500/15 border-slate-500/40 text-slate-700 dark:text-slate-300 font-bold';
      case 'IN_PROGRESS':
        return 'bg-cyan-500/15 border-cyan-500/40 text-cyan-700 dark:text-cyan-400 font-bold';
      case 'COMPLETED':
        return 'bg-indigo-500/15 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 font-bold';
      case 'APPROVED':
        return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold';
      default:
        return 'bg-slate-500/15 border-slate-500/40 text-slate-700 dark:text-slate-300 font-bold';
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border uppercase tracking-wider font-mono shadow-sm ${sizeClasses[size]} ${getStatusStyles()}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
      {normalizedStatus}
    </span>
  );
};
