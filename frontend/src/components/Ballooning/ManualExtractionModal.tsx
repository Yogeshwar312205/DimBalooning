import React, { useState } from 'react';
import { useInspectionStore } from '../../store/useInspectionStore';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../../services/api';

export const ManualExtractionModal: React.FC = () => {
  const {
    activeSession,
    manualFallbackModalOpen,
    manualPendingCoord,
    closeManualFallbackModal,
    addBalloon,
    updateMeasurementInStore
  } = useInspectionStore();

  const [dimType, setDimType] = useState<'Linear' | 'Diameter' | 'Radial' | 'Angular'>('Linear');
  const [dimensionText, setDimensionText] = useState('25.00 ± 0.10');
  const [nominalValue, setNominalValue] = useState<string>('25.00');
  const [upperTolerance, setUpperTolerance] = useState<string>('0.10');
  const [lowerTolerance, setLowerTolerance] = useState<string>('-0.10');
  const [unit, setUnit] = useState('mm');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!manualFallbackModalOpen || !manualPendingCoord || !activeSession) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const nom = parseFloat(nominalValue);
    const upper = parseFloat(upperTolerance);
    const lower = parseFloat(lowerTolerance);

    if (isNaN(nom)) {
      setError('Please enter a valid nominal numerical value');
      setIsSubmitting(false);
      return;
    }

    const rawText = dimensionText || `${nom} ${upper >= 0 ? '+' : ''}${upper}/${lower}`;
    const upperTol = isNaN(upper) ? 0 : upper;
    const lowerTol = isNaN(lower) ? 0 : lower;

    try {
      const createdBalloon = manualPendingCoord.createdBalloon;
      const measurementId = createdBalloon?.measurement?.id;

      if (createdBalloon && measurementId) {
        // Update the EXISTING balloon measurement instead of creating a second balloon!
        const res = await api.put(`/measurements/${measurementId}`, {
          nominalValue: nom,
          upperTolerance: upperTol,
          lowerTolerance: lowerTol,
          unit,
          dimensionText: rawText
        });

        if (res.data.measurement) {
          updateMeasurementInStore(res.data.measurement);
        }
      } else {
        // Fallback if no balloon was created yet
        const res = await api.post('/balloons', {
          inspectionSessionId: activeSession.id,
          pageNumber: manualPendingCoord.pageNumber,
          x: manualPendingCoord.x,
          y: manualPendingCoord.y,
          manualDimension: {
            rawText,
            nominalValue: nom,
            upperTolerance: upperTol,
            lowerTolerance: lowerTol,
            unit
          }
        });

        if (res.data.balloon) {
          addBalloon(res.data.balloon);
        }
      }

      closeManualFallbackModal();
    } catch (err: any) {
      console.error('Manual balloon save error:', err);
      setError(err?.response?.data?.error || 'Failed to save manual dimension balloon');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Manual Dimension Entry</h3>
              <p className="text-xs text-slate-400">Vector text unreadable or scanned drawing detected</p>
            </div>
          </div>
          <button
            onClick={closeManualFallbackModal}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-800/80 text-rose-300 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Dimension Type
            </label>
            <select
              value={dimType}
              onChange={(e: any) => setDimType(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="Linear">Linear Dimension (e.g. 25.00)</option>
              <option value="Diameter">Diameter (Ø 25.00)</option>
              <option value="Radial">Radial (R 10.00)</option>
              <option value="Angular">Angular (°)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Dimension Raw String
            </label>
            <input
              type="text"
              value={dimensionText}
              onChange={(e) => setDimensionText(e.target.value)}
              placeholder="e.g. 25 ± 0.10"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Nominal
              </label>
              <input
                type="number"
                step="any"
                required
                value={nominalValue}
                onChange={(e) => setNominalValue(e.target.value)}
                placeholder="25.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                + Upper Tol
              </label>
              <input
                type="number"
                step="any"
                value={upperTolerance}
                onChange={(e) => setUpperTolerance(e.target.value)}
                placeholder="+0.10"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                - Lower Tol
              </label>
              <input
                type="number"
                step="any"
                value={lowerTolerance}
                onChange={(e) => setLowerTolerance(e.target.value)}
                placeholder="-0.10"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-rose-400 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Measurement Unit
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
            >
              <option value="mm">Millimeters (mm)</option>
              <option value="inch">Inches (in)</option>
              <option value="deg">Degrees (°)</option>
              <option value="rad">Radians</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={closeManualFallbackModal}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving Balloon...' : 'Save Balloon'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
