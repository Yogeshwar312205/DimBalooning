import React from 'react';
import { useInspectionStore } from '../../store/useInspectionStore';
import { Users, Circle } from 'lucide-react';

export const CollaboratorList: React.FC = () => {
  const { onlineCollaborators } = useInspectionStore();

  return (
    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 text-xs transition-colors">
      <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 font-semibold text-[11px]">
        <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        <span>Active:</span>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto">
        {onlineCollaborators.length === 0 ? (
          <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] font-semibold">1 (You)</span>
        ) : (
          onlineCollaborators.map((user, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-1.5 py-0.5 rounded-lg"
              title={`${user.name} (${user.role})`}
            >
              <Circle className="w-1.5 h-1.5 fill-emerald-500 text-emerald-500 animate-pulse" />
              <span className="font-medium text-slate-800 dark:text-slate-200 text-[11px]">{user.name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};