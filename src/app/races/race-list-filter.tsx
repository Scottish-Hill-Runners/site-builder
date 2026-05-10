'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { RaceInfo } from '@/types/datatable';
import type { CalendarEntry } from '@/lib/results-data';
import { useUnits } from '@/components/UnitsProvider';
import { formatDistance, formatClimb } from '@/lib/units';

const CalendarMap = dynamic(() => import('@/components/CalendarMap'), {
  loading: () => <div className="h-[600px] w-full animate-pulse bg-gray-200 dark:bg-slate-800 rounded-xl" />,
  ssr: false,
});

interface RaceListFilterProps {
  races: Array<RaceInfo & { raceId: string }>;
  calendar: CalendarEntry[];
}

const VIEW_STORAGE_KEY = 'shr-race-list-view';

export default function RaceListFilter({ races, calendar }: RaceListFilterProps) {
  const { imperial } = useUnits();
  
  const [view, setView] = useState<'list' | 'map'>(() => {
    if (typeof window === 'undefined') return 'list';
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === 'list' || saved === 'map') return saved;
    } catch {}
    return 'list';
  });

  const handleSetView = (newView: 'list' | 'map') => {
    setView(newView);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, newView);
    } catch {}
  };

  const [query, setQuery] = useState('');
  const [distanceFilter, setDistanceFilter] = useState('');
  const [climbFilter, setClimbFilter] = useState('');

  const filtered = useMemo(() => {
    let result = races;

    const needle = query.trim().toLowerCase();
    if (needle) {
      result = result.filter((r) => {
        const title = (r.title ?? '').toLowerCase();
        const venue = (r.venue ?? '').toLowerCase();
        return title.includes(needle) || venue.includes(needle);
      });
    }

    if (distanceFilter) {
      result = result.filter((r) => {
        if (r.distance == null) return false;
        if (distanceFilter === 'S') return r.distance < 10;
        if (distanceFilter === 'M') return r.distance >= 10 && r.distance < 20;
        if (distanceFilter === 'L') return r.distance >= 20;
        return true;
      });
    }

    if (climbFilter) {
      result = result.filter((r) => {
        if (r.climb == null || r.distance == null || r.distance === 0) return false;
        const ratio = r.climb / r.distance;
        if (climbFilter === 'A') return ratio >= 50;
        if (climbFilter === 'B') return ratio >= 25 && ratio < 50;
        if (climbFilter === 'C') return ratio >= 20 && ratio < 25;
        return true;
      });
    }

    return result;
  }, [races, query, distanceFilter, climbFilter]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 border-b border-gray-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => handleSetView('list')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            view === 'list'
              ? 'bg-white text-blue-600 border-b-2 border-blue-600 dark:bg-slate-900 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          All races
        </button>
        <button
          onClick={() => handleSetView('map')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            view === 'map'
              ? 'bg-white text-blue-600 border-b-2 border-blue-600 dark:bg-slate-900 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Calendar Map
        </button>
      </div>

      {view === 'list' ? (
        <>
          <div className="flex flex-col gap-3">
            <div>
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
            
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={distanceFilter}
                onChange={(e) => setDistanceFilter(e.target.value)}
                className="w-full sm:w-1/2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                aria-label="Filter by distance category"
              >
                <option value="">All Distances</option>
                <option value="S">Category S (Short, &lt; 10 km)</option>
                <option value="M">Category M (Medium, 10–20 km)</option>
                <option value="L">Category L (Long, ≥ 20 km)</option>
              </select>
              
              <select
                value={climbFilter}
                onChange={(e) => setClimbFilter(e.target.value)}
                className="w-full sm:w-1/2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                aria-label="Filter by ascent category"
              >
                <option value="">All Ascents</option>
                <option value="A">Category A (50+ m/km)</option>
                <option value="B">Category B (25–50 m/km)</option>
                <option value="C">Category C (20–25 m/km)</option>
              </select>
            </div>
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
                      {race.climb != null && ` • ${formatClimb(race.climb, imperial)}`}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <CalendarMap entries={calendar} />
      )}
    </div>
  );
}
