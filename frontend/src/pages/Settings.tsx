import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export const Settings: React.FC = () => {
  const [checkMargin, setCheckMargin] = useState('10');
  const [autoExtract, setAutoExtract] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="flex-1 p-6 overflow-auto dark:bg-slate-950 light:bg-slate-50 space-y-6 transition-colors">
      <div className="flex items-center justify-between dark:bg-slate-900 light:bg-white border dark:border-slate-800 light:border-slate-200 p-6 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold dark:text-white light:text-slate-900 tracking-wide font-display">System Settings & Tolerance Configuration</h2>
          <p className="text-xs dark:text-slate-400 light:text-slate-600 mt-1">Configure global inspection parameters, CHECK status threshold margins, and microservice endpoints.</p>
        </div>
      </div>

      <div className="max-w-2xl glass-panel rounded-2xl border dark:border-slate-800 light:border-slate-200 p-6 space-y-6">
        {saved && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Configuration settings saved successfully!
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6 text-sm">
          <div>
            <label className="block font-bold dark:text-white light:text-slate-900 mb-1">
              CHECK Status Warning Threshold (%)
            </label>
            <p className="text-xs dark:text-slate-400 light:text-slate-600 mb-2">
              If an actual physical measurement falls within this % margin of the upper or lower tolerance limit, the status will automatically flag as <span className="text-amber-500 font-bold">CHECK (Yellow)</span> instead of PASS.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="30"
                value={checkMargin}
                onChange={(e) => setCheckMargin(e.target.value)}
                className="w-32 dark:bg-slate-950 light:bg-slate-100 border dark:border-slate-800 light:border-slate-300 rounded-xl px-3 py-2 dark:text-white light:text-slate-900 font-mono font-bold"
              />
              <span className="text-xs dark:text-slate-400 light:text-slate-600 font-mono">% of Tolerance Range</span>
            </div>
          </div>

          <div className="pt-4 border-t dark:border-slate-800 light:border-slate-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoExtract}
                onChange={(e) => setAutoExtract(e.target.checked)}
                className="w-4 h-4 rounded dark:bg-slate-950 light:bg-slate-100 border-slate-700 text-blue-600 focus:ring-0"
              />
              <div>
                <div className="font-bold dark:text-white light:text-slate-900">Enable Automatic PyMuPDF Vector Text Extraction</div>
                <p className="text-xs dark:text-slate-400 light:text-slate-600">Attempts to automatically read selectable dimension text and tolerance bounds near clicked canvas coordinates.</p>
              </div>
            </label>
          </div>

          <div className="pt-4 border-t dark:border-slate-800 light:border-slate-200 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
