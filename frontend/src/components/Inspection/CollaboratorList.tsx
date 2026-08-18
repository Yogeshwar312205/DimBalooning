import React from 'react';
import { useInspectionStore } from '../../store/useInspectionStore';
import { Users, Circle } from 'lucide-react';

export const CollaboratorList: React.FC = () => {
  const { onlineCollaborators } = useInspectionStore();

  return (
    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
      <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
        <Users className="w-4 h-4 text-blue-400" />
        <span>Active Team:</span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {onlineCollaborators.length === 0 ? (
          <span className="text-slate-500 font-mono">1 Active (You)</span>
        ) : (
          onlineCollaborators.map((user, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-lg"
              title={`${user.name} (${user.role})`}
            >
              <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400 animate-pulse" />
              <span className="font-medium text-slate-200">{user.name}</span>
              <span className="text-[10px] text-cyan-400 font-mono">[{user.role}]</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
