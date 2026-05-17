'use client';

import { useState, useMemo, useSyncExternalStore } from 'react';
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
const VIEW_CHANGE_EVENT = 'shr-race-list-view-change';

type RaceListView = 'list' | 'map';
type DistanceCategory = '' | 'S' | 'M' | 'L';
type AscentCategory = '' | 'A' | 'B' | 'C';

function matchesDistance(distance: number | undefined, filter: DistanceCategory): boolean {
  if (!filter) return true;
  if (distance == null) return false;
  if (filter === 'S') return distance < 10;
  if (filter === 'M') return distance >= 10 && distance < 20;
  return distance >= 20;
}

function matchesAscent(
  distance: number | undefined,
  climb: number | undefined,
  filter: AscentCategory,
): boolean {
  if (!filter) return true;
  if (distance == null || climb == null || distance === 0) return false;
  const ratio = climb / distance;
  if (filter === 'A') return ratio >= 50;
  if (filter === 'B') return ratio >= 25 && ratio < 50;
  return ratio >= 20 && ratio < 25;
}

function getStoredView(): RaceListView {
  if (typeof window === 'undefined') return 'list';
  try {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === 'map' ? 'map' : 'list';
  } catch {
    return 'list';
  }
}

function subscribeToStoredView(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleChange = () => onStoreChange();

  window.addEventListener('storage', handleChange);
  window.addEventListener(VIEW_CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener(VIEW_CHANGE_EVENT, handleChange);
  };
}

export default function RaceListFilter({ races, calendar }: RaceListFilterProps) {
  const { imperial } = useUnits();

  const view = useSyncExternalStore(subscribeToStoredView, getStoredView, () => 'list');

  const handleSetView = (newView: RaceListView) => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, newView);
      window.dispatchEvent(new Event(VIEW_CHANGE_EVENT));
    } catch {}
  };

  const [query, setQuery] = useState('');
  const [distanceFilter, setDistanceFilter] = useState<DistanceCategory>('');
  const [climbFilter, setClimbFilter] = useState<AscentCategory>('');
  const [championshipFilter, setChampionshipFilter] = useState('');

  const championshipOptions = useMemo(() => {
    const bySlug = new Map<string, string>();
    calendar.forEach((entry) => {
      Object.entries(entry.championships ?? {}).forEach(([slug, name]) => {
        if (!bySlug.has(slug)) {
          bySlug.set(slug, name);
        }
      });
    });

    return Array.from(bySlug.entries())
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [calendar]);

  const championshipRaceIds = useMemo(() => {
    if (!championshipFilter) return null;

    const raceIds = new Set<string>();
    calendar.forEach((entry) => {
      if (entry.raceId && entry.championships && championshipFilter in entry.championships) {
        raceIds.add(entry.raceId);
      }
    });

    return raceIds;
  }, [calendar, championshipFilter]);

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

    result = result.filter((r) => {
      if (!matchesDistance(r.distance, distanceFilter)) return false;
      if (!matchesAscent(r.distance, r.climb, climbFilter)) return false;
      if (championshipRaceIds && !championshipRaceIds.has(r.raceId)) return false;
      return true;
    });

    return result;
  }, [races, query, distanceFilter, climbFilter, championshipRaceIds]);

  const filteredCalendar = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return calendar.filter((entry) => {
      if (needle && !entry.raceName.toLowerCase().includes(needle)) return false;
      if (!matchesDistance(entry.distance, distanceFilter)) return false;
      if (!matchesAscent(entry.distance, entry.climb, climbFilter)) return false;
      if (championshipFilter && !(entry.championships && championshipFilter in entry.championships)) {
        return false;
      }
      return true;
    });
  }, [calendar, query, distanceFilter, climbFilter, championshipFilter]);

  const selectedChampionshipName = useMemo(() => {
    if (!championshipFilter) return null;
    const match = championshipOptions.find((option) => option.slug === championshipFilter);
    return match?.name ?? championshipFilter;
  }, [championshipFilter, championshipOptions]);

  const activeFilters = useMemo(() => {
    const filters: string[] = [];
    if (query.trim()) filters.push(`Search: ${query.trim()}`);
    if (selectedChampionshipName) filters.push(`Championship: ${selectedChampionshipName}`);
    if (distanceFilter) filters.push(`Distance: ${distanceFilter}`);
    if (climbFilter) filters.push(`Ascent: ${climbFilter}`);
    return filters;
  }, [query, selectedChampionshipName, distanceFilter, climbFilter]);

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

        <div className="flex flex-col gap-3 sm:grid sm:grid-cols-3">
          <select
            value={championshipFilter}
            onChange={(e) => setChampionshipFilter(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            aria-label="Filter by championship"
          >
            <option value="">All Championships</option>
            {championshipOptions.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>

          <select
            value={distanceFilter}
            onChange={(e) => setDistanceFilter(e.target.value as DistanceCategory)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            aria-label="Filter by distance category"
          >
            <option value="">All Distances</option>
            <option value="S">Category S (Short, &lt; 10 km)</option>
            <option value="M">Category M (Medium, 10–20 km)</option>
            <option value="L">Category L (Long, ≥ 20 km)</option>
          </select>

          <select
            value={climbFilter}
            onChange={(e) => setClimbFilter(e.target.value as AscentCategory)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            aria-label="Filter by ascent category"
          >
            <option value="">All Ascents</option>
            <option value="A">Category A (50+ m/km)</option>
            <option value="B">Category B (25–50 m/km)</option>
            <option value="C">Category C (20–25 m/km)</option>
          </select>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Active filters
            </span>
            {activeFilters.map((filterText) => (
              <span
                key={filterText}
                className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
              >
                {filterText}
              </span>
            ))}
          </div>
        )}
      </div>

      {view === 'list' ? (
        <>

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
        filteredCalendar.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-slate-400">
            No calendar races match your filters.
          </p>
        ) : (
          <CalendarMap entries={filteredCalendar} />
        )
      )}
    </div>
  );
}
