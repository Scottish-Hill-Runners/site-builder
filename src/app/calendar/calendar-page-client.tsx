'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import { useUnits } from '@/components/UnitsProvider';
import { formatDistance, formatClimb } from '@/lib/units';
import HighlightBar from './HighlightBar';

type CalendarEntry = {
  Date: string;
  raceName: string;
  raceId?: string;
  distance?: number;
  climb?: number;
  championships?: { [slug: string]: string };
};

type MonthGroup = {
  key: string;
  label: string;
  entries: CalendarEntry[];
  raceDays: number[];
  hasUpcomingRace: boolean;
};

function parseRaceDate(dateString: string): Date | null {
  const raceDate = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(raceDate.getTime())) {
    return null;
  }
  return raceDate;
}

function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatMonthLabel(monthKey: string): string {
  const monthDate = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(monthDate.getTime())) {
    return monthKey;
  }

  return monthDate.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

function formatRaceDate(dateString: string): string {
  const raceDate = parseRaceDate(dateString);
  if (raceDate === null) {
    return dateString;
  }

  return raceDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function sortEntriesByDate(a: CalendarEntry, b: CalendarEntry): number {
  const aDate = parseRaceDate(a.Date);
  const bDate = parseRaceDate(b.Date);

  if (aDate === null && bDate === null) return 0;
  if (aDate === null) return 1;
  if (bDate === null) return -1;
  return aDate.getTime() - bDate.getTime();
}

function buildMonthGroups(entries: CalendarEntry[]): MonthGroup[] {
  const grouped = new Map<string, CalendarEntry[]>();

  for (const entry of entries) {
    const raceDate = parseRaceDate(entry.Date);
    if (raceDate === null) {
      continue;
    }

    const monthKey = getMonthKey(raceDate);
    const monthEntries = grouped.get(monthKey) ?? [];
    monthEntries.push(entry);
    grouped.set(monthKey, monthEntries);
  }

  const today = startOfToday();

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, monthEntries]) => {
      const sortedEntries = [...monthEntries].sort(sortEntriesByDate);
      const raceDays = Array.from(
        new Set(
          sortedEntries
            .map((entry) => parseRaceDate(entry.Date)?.getDate())
            .filter((day): day is number => day !== undefined)
        )
      ).sort((a, b) => a - b);
      const hasUpcomingRace = sortedEntries.some((entry) => {
        const raceDate = parseRaceDate(entry.Date);
        return raceDate !== null && raceDate >= today;
      });

      return {
        key,
        label: formatMonthLabel(key),
        entries: sortedEntries,
        raceDays,
        hasUpcomingRace,
      };
    });
}

function isPastRace(dateString: string): boolean {
  const raceDate = parseRaceDate(dateString);
  if (raceDate === null) {
    return false;
  }
  const today = startOfToday();
  return raceDate < today;
}

function matchesHighlights(
  entry: CalendarEntry,
  active: Set<string>,
): boolean {
  if (active.size === 0) return true;

  // Championship group — OR within
  const champKeys = [...active].filter((k) => k.startsWith('champ:'));
  if (champKeys.length > 0) {
    const entryChamps = Object.keys(entry.championships ?? {});
    if (!champKeys.some((k) => entryChamps.includes(k.slice(6)))) return false;
  }

  // Distance group — OR within
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

  // Ascent group — OR within
  const ascKeys = [...active].filter((k) => k.startsWith('asc:'));
  if (ascKeys.length > 0) {
    const ratio =
      entry.climb !== undefined &&
      entry.distance !== undefined &&
      entry.distance > 0
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

export default function CalendarPageClient() {
  const { imperial } = useUnits();
  const [entries, setEntries] = useState<CalendarEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [activeHighlights, setActiveHighlights] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleHighlight = (key: string) => {
    setActiveHighlights((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearHighlights = () => setActiveHighlights(new Set());

  const availableChampionships = useMemo(() => {
    if (!entries) return [];
    const map = new Map<string, string>();
    for (const entry of entries) {
      for (const [slug, title] of Object.entries(entry.championships ?? {})) {
        map.set(slug, title);
      }
    }
    return [...map.entries()].map(([slug, title]) => ({ slug, title }));
  }, [entries]);

  const monthGroups = useMemo(() => {
    return entries ? buildMonthGroups(entries) : [];
  }, [entries]);

  const selectedMonth = useMemo(() => {
    if (selectedMonthKey === null) {
      return null;
    }
    return monthGroups.find((group) => group.key === selectedMonthKey) ?? null;
  }, [monthGroups, selectedMonthKey]);

  useEffect(() => {
    if (monthGroups.length === 0) {
      setSelectedMonthKey(null);
      return;
    }

    if (
      selectedMonthKey &&
      monthGroups.some((group) => group.key === selectedMonthKey)
    ) {
      return;
    }

    const currentMonthKey = getMonthKey(startOfToday());
    const currentMonth = monthGroups.find(
      (group) => group.key === currentMonthKey
    );
    const nextUpcoming = monthGroups.find((group) => group.hasUpcomingRace);
    const defaultMonth = currentMonth ?? nextUpcoming ?? monthGroups[0];
    setSelectedMonthKey(defaultMonth.key);
  }, [monthGroups, selectedMonthKey]);

  useEffect(() => {
    let isCancelled = false;

    async function loadCalendarData() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsNotFound(false);

      try {
        const calendarResult = await fetchGzipJson<CalendarEntry[]>('/calendar.json.gz');

        if (!isCancelled) {
          if (calendarResult.status === 'ok') {
            setEntries(calendarResult.data);
          } else if (calendarResult.status === 'not-found') {
            setIsNotFound(true);
            setEntries(null);
          } else {
            throw calendarResult.error;
          }
        }
      } catch (error) {
        console.error('Failed to fetch calendar data on client:', error);
        if (!isCancelled) {
          setErrorMessage(
            'Failed to load calendar data. Please try again later.'
          );
          setEntries(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadCalendarData();
    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 dark:from-slate-950 dark:to-slate-900 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-4 text-sm text-slate-500 dark:text-slate-400"
        >
          <ol role="list" className="flex flex-wrap gap-2">
            <li>
              <Link href="/" className="text-blue-600 hover:text-blue-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li
              className="font-semibold text-slate-900 dark:text-slate-100"
              aria-current="page"
            >
              Calendar
            </li>
          </ol>
        </nav>

        <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-slate-50">
          Race Calendar
        </h1>

        {isLoading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              Loading calendar...
            </p>
          </div>
        ) : isNotFound ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              Calendar data not found.
            </p>
          </div>
        ) : errorMessage ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-2 font-semibold text-red-600">{errorMessage}</p>
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              Try again in a few minutes.
            </p>
          </div>
        ) : entries && entries.length > 0 ? (
          <div className="space-y-8">
            <section
              aria-label="Calendar months"
              className="rounded-lg bg-white p-4 shadow-md dark:bg-slate-900 sm:p-6"
            >
              <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
                Browse By Month
              </h2>

              {/* Mobile/tablet: single month selector with prev/next navigation */}
              <div className="mb-6 lg:hidden">
                {selectedMonth && (
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const currentIndex = monthGroups.findIndex(
                          (g) => g.key === selectedMonthKey
                        );
                        if (currentIndex > 0) {
                          setSelectedMonthKey(
                            monthGroups[currentIndex - 1].key
                          );
                        }
                      }}
                      aria-label="Previous month"
                      disabled={
                        monthGroups.findIndex(
                          (g) => g.key === selectedMonthKey
                        ) === 0
                      }
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-slate-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      ← Prev
                    </button>
                    <div className="flex-1 rounded-lg border border-slate-200 bg-gradient-to-r from-blue-50 to-blue-50 px-4 py-3 text-center dark:border-slate-700 dark:from-blue-950/40 dark:to-blue-950/40">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {selectedMonth.label}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        {selectedMonth.entries.length} races
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const currentIndex = monthGroups.findIndex(
                          (g) => g.key === selectedMonthKey
                        );
                        if (currentIndex < monthGroups.length - 1) {
                          setSelectedMonthKey(
                            monthGroups[currentIndex + 1].key
                          );
                        }
                      }}
                      aria-label="Next month"
                      disabled={
                        monthGroups.findIndex(
                          (g) => g.key === selectedMonthKey
                        ) ===
                        monthGroups.length - 1
                      }
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-slate-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>

              {/* Desktop: full month grid */}
              <div className="hidden lg:block">
                <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {monthGroups.map((group) => {
                    const isSelected = group.key === selectedMonthKey;
                    const extraDays = Math.max(group.raceDays.length - 10, 0);

                    return (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => setSelectedMonthKey(group.key)}
                        aria-pressed={isSelected}
                        aria-label={`${group.label}, ${group.entries.length} races`}
                        className={[
                          'w-full rounded-lg border px-4 py-3 text-left transition-colors',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
                          isSelected
                            ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200 dark:border-blue-700 dark:bg-blue-950/40 dark:ring-blue-800'
                            : 'border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {group.label}
                          </div>
                          <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {group.entries.length} races
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {group.raceDays.slice(0, 10).map((day) => (
                            <span
                              key={`${group.key}-${day}`}
                              className={[
                                'rounded-full px-2 py-0.5 text-xs font-medium',
                                group.hasUpcomingRace
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                  : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                              ].join(' ')}
                            >
                              {day}
                            </span>
                          ))}
                          {extraDays > 0 && (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              +{extraDays}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <HighlightBar
              championships={availableChampionships}
              active={activeHighlights}
              onToggle={toggleHighlight}
              onClear={clearHighlights}
            />

            <section className="rounded-lg bg-white p-4 shadow-md dark:bg-slate-900 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {selectedMonth ? selectedMonth.label : 'Selected Month'}
                </h2>
                {selectedMonth && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {selectedMonth.entries.length} races
                  </span>
                )}
              </div>

              {selectedMonth && selectedMonth.entries.length > 0 ? (
                <div className="space-y-3">
                  {selectedMonth.entries.map((entry, index) => {
                    const pastRace = isPastRace(entry.Date);
                    const visible =
                      activeHighlights.size === 0 ||
                      matchesHighlights(entry, activeHighlights);
                    if (!visible) return null;
                    const champSeries = entry.championships
                      ? Object.entries(entry.championships).map(([slug, title]) => ({ slug, title }))
                      : [];

                    return (
                      <article
                        key={`${entry.Date}-${entry.raceId ?? entry.raceName}-${index}`}
                        className={[
                          'rounded-lg border px-4 py-3',
                          pastRace
                            ? 'border-stone-200 bg-stone-100 opacity-50 dark:border-slate-700 dark:bg-slate-800/80'
                            : 'border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-950',
                        ].join(' ')}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {formatRaceDate(entry.Date)}
                            </div>
                            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                              {entry.raceId ? (
                                <Link
                                  href={`/races/${encodeURIComponent(entry.raceId)}`}
                                  className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  {entry.raceName}
                                </Link>
                              ) : (
                                entry.raceName
                              )}
                            </div>
                            {champSeries.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {champSeries.map(({ slug, title }) => (
                                  <Link
                                    key={slug}
                                    href={`/championships/${encodeURIComponent(slug)}`}
                                    className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/70"
                                    title={title}
                                  >
                                    {title}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right text-sm text-slate-700 dark:text-slate-300">
                            <div>
                              {entry.distance !== undefined
                                ? formatDistance(entry.distance, imperial)
                                : 'Distance: —'}
                            </div>
                            <div>
                              {entry.climb !== undefined
                                ? `${formatClimb(entry.climb, imperial)} climb`
                                : 'Climb: —'}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No races available for the selected month.
                </p>
              )}
            </section>
          </div>
        ) : (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              No calendar entries available.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
