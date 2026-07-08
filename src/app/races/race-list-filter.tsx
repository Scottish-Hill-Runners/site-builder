'use client';

import { useState, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { RaceInfo } from '@/types/datatable';
import type { CalendarEntry } from '@/lib/results-data';
import { useUnits } from '@/components/UnitsProvider';
import { formatDistance, formatClimb } from '@/lib/units';
import HighlightBar from '@/app/calendar/HighlightBar';

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

function matchesHighlights(
  entry: { distance?: number; climb?: number; championships?: Record<string, string> },
  active: Set<string>,
): boolean {
  if (active.size === 0) return true;

  const champKeys = [...active].filter((k) => k.startsWith('champ:'));
  if (champKeys.length > 0) {
    const entryChamps = Object.keys(entry.championships ?? {});
    if (!champKeys.some((k) => entryChamps.includes(k.slice(6)))) return false;
  }

  const distKeys = [...active].filter((k) => k.startsWith('dist:'));
  if (distKeys.length > 0) {
    const d = entry.distance;
    const matches = distKeys.some((k) => {
      if (d === undefined) return false;
      const cat = k.slice(5);
      if (cat === 'S') return d < 10;
      if (cat === 'M') return d >= 10 && d < 20;
      if (cat === 'L') return d >= 20;
      return false;
    });
    if (!matches) return false;
  }

  const ascKeys = [...active].filter((k) => k.startsWith('asc:'));
  if (ascKeys.length > 0) {
    const ratio =
      entry.climb !== undefined && entry.distance !== undefined && entry.distance > 0
        ? entry.climb / entry.distance
        : undefined;
    const matches = ascKeys.some((k) => {
      if (ratio === undefined) return false;
      const cat = k.slice(4);
      if (cat === 'A') return ratio >= 50;
      if (cat === 'B') return ratio >= 25 && ratio < 50;
      if (cat === 'C') return ratio >= 20 && ratio < 25;
      return false;
    });
    if (!matches) return false;
  }

  return true;
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
  const [activeHighlights, setActiveHighlights] = useState<Set<string>>(new Set());

  const toggleHighlight = (key: string) => {
    setActiveHighlights((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearHighlights = () => setActiveHighlights(new Set());

  const championshipOptions = useMemo(() => {
    const bySlug = new Map<string, string>();
    calendar.forEach((entry) => {
      Object.entries(entry.championships ?? {}).forEach(([slug, title]) => {
        if (!bySlug.has(slug)) bySlug.set(slug, title);
      });
    });
    return Array.from(bySlug.entries())
      .map(([slug, title]) => ({ slug, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [calendar]);

  // Map raceId → championship slugs so we can filter the race list by championship.
  const raceChampionships = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    calendar.forEach((entry) => {
      if (entry.raceId && entry.championships) {
        map.set(entry.raceId, entry.championships);
      }
    });
    return map;
  }, [calendar]);

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

    result = result.filter((r) =>
      matchesHighlights(
        { distance: r.distance, climb: r.climb, championships: raceChampionships.get(r.raceId) },
        activeHighlights,
      )
    );

    return result;
  }, [races, query, activeHighlights, raceChampionships]);

  const filteredCalendar = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return calendar.filter((entry) => {
      if (needle && !entry.raceName.toLowerCase().includes(needle)) return false;
      return matchesHighlights(entry, activeHighlights);
    });
  }, [calendar, query, activeHighlights]);

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
          List
        </button>
        <button
          onClick={() => handleSetView('map')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            view === 'map'
              ? 'bg-white text-blue-600 border-b-2 border-blue-600 dark:bg-slate-900 dark:text-blue-400'
              : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Map
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

        <HighlightBar
          championships={championshipOptions}
          active={activeHighlights}
          onToggle={toggleHighlight}
          onClear={clearHighlights}
        />
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
