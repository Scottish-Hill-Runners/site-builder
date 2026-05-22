'use client';

import { useUnits } from '@/components/UnitsProvider';

export default function UnitsToggle() {
  const { imperial, setImperial } = useUnits();

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <span className="sr-only">Distance units</span>
      <select
        aria-label="Distance units"
        value={imperial ? 'imperial' : 'metric'}
        onChange={(e) => setImperial(e.target.value === 'imperial')}
        className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 sm:w-auto sm:px-2.5 sm:py-1.5 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="metric">km / m</option>
        <option value="imperial">mi / ft</option>
      </select>
    </label>
  );
}
