'use client';

import { useUnits } from '@/components/UnitsProvider';

export default function UnitsToggle() {
  const { imperial, setImperial } = useUnits();

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-100 p-1 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <span className="sr-only">Distance units</span>

      <button
        onClick={() => setImperial(false)}
        aria-label="Metric units (km/m)"
        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm ${
          !imperial
            ? 'bg-white text-blue-500 shadow-sm dark:bg-slate-700 dark:text-blue-400'
            : 'hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        }`}
      >
        km/m
      </button>

      <button
        onClick={() => setImperial(true)}
        aria-label="Imperial units (mi/ft)"
        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm ${
          imperial
            ? 'bg-white text-blue-500 shadow-sm dark:bg-slate-700 dark:text-blue-400'
            : 'hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        }`}
      >
        mi/ft
      </button>
    </div>
  );
}
