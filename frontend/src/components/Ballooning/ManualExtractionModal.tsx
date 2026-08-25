import React, { useState, useEffect } from 'react';
import { useInspectionStore } from '../../store/useInspectionStore';
import { X, CheckCircle2, AlertTriangle, Calculator } from 'lucide-react';
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

  const [actualValue, setActualValue] = useState<string>('');
  const [nominalValue, setNominalValue] = useState<string>('');
  const [upperTolerance, setUpperTolerance] = useState<string>('0.10');
  const [lowerTolerance, setLowerTolerance] = useState<string>('-0.10');
  const [dimensionText, setDimensionText] = useState('');
  const [unit, setUnit] = useState('mm');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill the form if the user clicked an existing AI-extracted balloon
  useEffect(() => {
    if (manualPendingCoord?.createdBalloon?.measurement) {
      const m = manualPendingCoord.createdBalloon.measurement;
      setNominalValue(m.nominalValue !== null ? String(m.nominalValue) : '');
      setUpperTolerance(m.upperTolerance !== null ? String(m.upperTolerance) : '0.0');
      setLowerTolerance(m.lowerTolerance !== null ? String(m.lowerTolerance) : '0.0');
      setDimensionText(m.dimensionText || '');
      setUnit(m.unit || 'mm');
      setActualValue(m.actualValue !== null ? String(m.actualValue) : '');
    } else {
      setNominalValue('');
      setActualValue('');
      setDimensionText('');
      setUpperTolerance('0.10');
      setLowerTolerance('-0.10');
    }
  }, [manualPendingCoord]);

  if (!manualFallbackModalOpen || !manualPendingCoord || !activeSession) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const nom = parseFloat(nominalValue);
    const upper = parseFloat(upperTolerance);
    const lower = parseFloat(lowerTolerance);
    const act = parseFloat(actualValue);

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
      
      if (createdBalloon && createdBalloon.measurement?.id) {
        // UPDATE EXISTING MEASUREMENT (This is what happens when Inspector inputs data)
        const res = await api.put(`/measurements/${createdBalloon.measurement.id}`, {
          nominalValue: nom,
          upperTolerance: upperTol,
          lowerTolerance: lowerTol,
          actualValue: isNaN(act) ? null : act,
          unit,
          dimensionText: rawText
        });
        
        if (res.data.measurement) updateMeasurementInStore(res.data.measurement);
      } else {
        // CREATE NEW MANUAL BALLOON
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
        
        if (res.data.balloon) addBalloon(res.data.balloon);
      }

      closeManualFallbackModal();
    } catch (err: any) {
      console.error('Measurement save error:', err);
      setError(err?.response?.data?.error || 'Failed to save measurement data');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAiExtracted = manualPendingCoord.createdBalloon?.isAiExtracted;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${isAiExtracted ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
              {isAiExtracted ? <Calculator className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {isAiExtracted ? 'Input Measurement' : 'Manual Dimension Entry'}
              </h3>
              <p className="text-xs text-slate-400">
                {isAiExtracted ? 'AI extracted this data. Please verify and input actuals.' : 'Vector text unreadable. Manual fallback.'}
              </p>
            </div>
          </div>
          <button onClick={closeManualFallbackModal} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-sm">
          {error && <div className="p-3 bg-rose-950/60 border border-rose-800/80 text-rose-300 rounded-xl text-xs font-medium">{error}</div>}

          {/* AI Pre-filled Section */}
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-4">
            <div className="flex items-center justify-between">
               <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Drawing Requirements</span>
               {isAiExtracted && <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-1 rounded-full uppercase tracking-wider font-bold flex items-center gap-1">✨ AI Extracted</span>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Nominal</label>
                <input type="number" step="any" required value={nominalValue} onChange={(e) => setNominalValue(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">+ Upper Tol</label>
                <input type="number" step="any" value={upperTolerance} onChange={(e) => setUpperTolerance(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-emerald-400 font-mono focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">- Lower Tol</label>
                <input type="number" step="any" value={lowerTolerance} onChange={(e) => setLowerTolerance(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-rose-400 font-mono focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="flex gap-3">
               <div className="flex-1">
                 <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Raw Text</label>
                 <input type="text" value={dimensionText} onChange={(e) => setDimensionText(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 font-mono focus:outline-none focus:border-blue-500 text-xs" />
               </div>
               <div className="w-24">
                 <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Unit</label>
                 <select value={unit} onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-slate-300 font-mono focus:outline-none focus:border-blue-500 text-xs">
                    <option value="mm">mm</option>
                    <option value="inch">in</option>
                    <option value="deg">deg</option>
                 </select>
               </div>
            </div>
          </div>

          {/* Actual Measurement Section (The most important part!) */}
          <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-900/40">
             <label className="block text-sm font-bold text-blue-300 uppercase tracking-wider mb-2">Inspector Input: Actual Value</label>
             <input type="number" step="any" value={actualValue} onChange={(e) => setActualValue(e.target.value)}
                placeholder="Enter physical measurement from caliper..."
                className="w-full bg-slate-950 border-2 border-blue-600/50 rounded-xl px-4 py-3 text-white font-mono text-lg focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20 transition-all placeholder:text-slate-600" />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button type="button" onClick={closeManualFallbackModal} className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save & Validate'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};