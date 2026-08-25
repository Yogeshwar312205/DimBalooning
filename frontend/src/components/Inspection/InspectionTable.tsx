import React, { useState } from 'react';
import { useInspectionStore } from '../../store/useInspectionStore';
import { Balloon } from '../../types/balloon';
import { Badge } from '../Common/Badge';
import { Trash2, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';
import api from '../../services/api';

export const InspectionTable: React.FC = () => {
  const { balloons, selectedBalloonId, setSelectedBalloonId, deleteBalloonFromStore, updateMeasurementInStore, autoDetectAllBalloons } =
    useInspectionStore();

  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  const handleAutoDetectAll = async () => {
    setIsAutoDetecting(true);
    try {
      const res = await autoDetectAllBalloons();
      if (res && res.count > 0) {
        alert(`Successfully auto-detected ${res.count} dimension balloons!`);
      } else {
        alert(res?.message || 'No new dimension callouts found on this page.');
      }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to auto detect balloons.');
    } finally {
      setIsAutoDetecting(false);
    }
  };

  const sortedBalloons = [...balloons].sort((a, b) => a.balloonNumber - b.balloonNumber);

  const handleInputChange = (balloonId: string, val: string) => {
    setEditingValues({
      ...editingValues,
      [balloonId]: val
    });
  };

  const handleMeasurementSave = async (balloon: Balloon) => {
    const rawVal = editingValues[balloon.id];
    if (rawVal === undefined || rawVal === '') return;

    const actualVal = parseFloat(rawVal);
    if (isNaN(actualVal)) return;

    setSavingIds((prev) => ({ ...prev, [balloon.id]: true }));

    try {
      let updatedMeasurement: any = null;

      if (balloon.measurement?.id) {
        const res = await api.put(`/measurements/${balloon.measurement.id}`, {
          actualValue: actualVal
        });
        updatedMeasurement = res.data.measurement;
      } else {
        const res = await api.post('/measurements', {
          balloonId: balloon.id,
          actualValue: actualVal
        });
        updatedMeasurement = res.data.measurement;
      }

      if (updatedMeasurement) {
        updateMeasurementInStore(updatedMeasurement);
      }
    } catch (err) {
      console.error('Failed to save measurement:', err);
    } finally {
      setSavingIds((prev) => ({ ...prev, [balloon.id]: false }));
    }
  };

  const handleDeleteBalloon = async (balloonId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this balloon?')) return;

    try {
      await api.delete(`/balloons/${balloonId}`);
      deleteBalloonFromStore(balloonId);
    } catch (err) {
      console.error('Failed to delete balloon:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900 transition-colors text-slate-900 dark:text-slate-100">
      {/* Header Bar */}
      <div className="p-4 border-b border-slate-300 dark:border-slate-800 flex items-center justify-between bg-slate-100 dark:bg-slate-950/60">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white tracking-wide font-display">
            Inspection Characteristics Log
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Click row to focus on drawing canvas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoDetectAll}
            disabled={isAutoDetecting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
            title="Automatically detect all dimensions on this drawing page"
          >
            {isAutoDetecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>Auto Detect</span>
          </button>
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-blue-700 dark:text-cyan-400 border border-slate-300 dark:border-slate-700">
            {balloons.length} Dimensions
          </span>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        {sortedBalloons.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2 text-slate-600 dark:text-slate-400">
            <AlertCircle className="w-8 h-8 text-slate-400 dark:text-slate-600" />
            <p className="text-xs font-semibold">No Balloons Added Yet</p>
            <p className="text-[11px] max-w-xs">
              Click the <strong className="text-emerald-600 dark:text-emerald-400">Add Balloon</strong> tool and click any dimension callout on the engineering PDF.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-200 dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-extrabold border-b border-slate-300 dark:border-slate-800 uppercase tracking-wider font-mono">
              <tr>
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-3">Dimension</th>
                <th className="py-3 px-3">Nominal</th>
                <th className="py-3 px-3">+Tol</th>
                <th className="py-3 px-3">-Tol</th>
                <th className="py-3 px-3">Lower Limit</th>
                <th className="py-3 px-3">Upper Limit</th>
                <th className="py-3 px-3 min-w-[130px]">Actual Value</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 w-10 text-center">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-mono">
              {sortedBalloons.map((b) => {
                const isSelected = b.id === selectedBalloonId;
                const m = b.measurement;
                const status = m?.status || 'PENDING';
                const currentVal = editingValues[b.id] !== undefined ? editingValues[b.id] : m?.actualValue !== undefined && m?.actualValue !== null ? String(m.actualValue) : '';

                return (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBalloonId(b.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-100/90 dark:bg-blue-950/40 border-l-4 border-blue-500'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Balloon Badge Number */}
                    <td className="py-3 px-3 text-center">
                      <span className="w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-white bg-blue-600 shadow-sm text-xs">
                        {b.balloonNumber}
                      </span>
                    </td>

                    {/* Dimension Text */}
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white font-sans">
                      {m?.dimensionText || `Dim #${b.balloonNumber}`}
                    </td>

                    {/* Nominal */}
                    <td className="py-3 px-3 font-extrabold text-slate-900 dark:text-slate-100">
                      {m?.nominalValue !== null && m?.nominalValue !== undefined ? m.nominalValue.toFixed(3) : '-'}
                    </td>

                    {/* +Tolerance */}
                    <td className="py-3 px-3 text-emerald-600 dark:text-emerald-400 font-bold">
                      {m?.upperTolerance !== null && m?.upperTolerance !== undefined ? `+${m.upperTolerance.toFixed(3)}` : '-'}
                    </td>

                    {/* -Tolerance */}
                    <td className="py-3 px-3 text-rose-600 dark:text-rose-400 font-bold">
                      {m?.lowerTolerance !== null && m?.lowerTolerance !== undefined ? `-${Math.abs(m.lowerTolerance).toFixed(3)}` : '-'}
                    </td>

                    {/* Lower Limit */}
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                      {m?.lowerLimit !== null && m?.lowerLimit !== undefined ? m.lowerLimit.toFixed(3) : '-'}
                    </td>

                    {/* Upper Limit */}
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                      {m?.upperLimit !== null && m?.upperLimit !== undefined ? m.upperLimit.toFixed(3) : '-'}
                    </td>

                    {/* Actual Input */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="any"
                          value={currentVal}
                          onChange={(e) => handleInputChange(b.id, e.target.value)}
                          onBlur={() => handleMeasurementSave(b)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleMeasurementSave(b);
                          }}
                          placeholder="Enter Value"
                          className="w-24 bg-white dark:bg-slate-950 border border-slate-400 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white font-bold shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3 text-center">
                      <Badge status={status} size="sm" />
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={(e) => handleDeleteBalloon(b.id, e)}
                        className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Delete Balloon"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
