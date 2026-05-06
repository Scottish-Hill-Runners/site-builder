'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { RaceInfo } from '@/types/datatable';
import { useUnits } from '@/components/UnitsProvider';
import { formatDistance } from '@/lib/units';

interface RaceListFilterProps {
  races: Array<RaceInfo & { raceId: string }>;
}

export default function RaceListFilter({ races }: RaceListFilterProps) {
  const { imperial } = useUnits();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return races;
    return races.filter((r) => {
      const title = (r.title ?? '').toLowerCase();
      const venue = (r.venue ?? '').toLowerCase();
      return title.includes(needle) || venue.includes(needle);
    });
  }, [races, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="race-search" className="sr-only">
          Search races
        </label>
        <input
          id="race-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or venue…"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-slate-400">
          No races match your search.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((race) => (
            <li key={race.raceId}>
              <Link
                href={`/races/${encodeURIComponent(race.raceId)}`}
                className="block rounded-lg border border-gray-200 bg-white px-4 py-3 text-blue-600 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <div className="font-semibold dark:text-slate-100">
                  {race.title ?? race.raceId}
                </div>
                <div className="text-sm text-gray-600 dark:text-slate-300">
                  {race.venue ?? 'Unknown venue'} •{' '}
                  {formatDistance(race.distance, imperial)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
