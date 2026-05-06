'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import RaceResultsDataTable from '@/components/RaceResultsDataTable';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import type { RaceInfo, RaceResult } from '@/types/datatable';

interface ChampionshipYearPageClientProps {
  series: string;
  year: string;
}

type ChampionshipTab = 'results' | 'standings';

type DistanceBucket = 'short' | 'medium' | 'long' | 'unknown';

type RaceMetadata = Record<string, RaceInfo>;

type RunnerEvent = {
  raceId: string;
  points: number;
  bucket: DistanceBucket;
};

type StandingRow = {
  key: string;
  name: string;
  club: string;
  categories: string[];
  points: number;
  events: Array<{ raceId: string; points: number }>;
  runnerEvents?: RunnerEvent[];
  isQualified?: boolean;
};

function parseCategoryAge(category: string): number | null {
  const match = category.match(/(\d+)/);
  if (!match) {
    return null;
  }

  const age = Number.parseInt(match[1], 10);
  return Number.isNaN(age) ? null : age;
}

function isSixtyOrOlder(categories: string[]): boolean {
  return categories.some((category) => {
    const age = parseCategoryAge(category);
    return age !== null && age >= 60;
  });
}

function getDistanceBucket(distance?: number): DistanceBucket {
  if (typeof distance !== 'number' || Number.isNaN(distance)) {
    return 'unknown';
  }

  if (distance < 10) {
    return 'short';
  }
  if (distance > 20) {
    return 'long';
  }
  return 'medium';
}

function meetsMinimumRequirements(
  series: string,
  categories: string[],
  events: RunnerEvent[]
): boolean {
  if (series === 'BogAndBurn') {
    return events.length >= 6;
  }

  if (series === 'LongClassics') {
    return events.length >= 5;
  }

  if (series === 'SHR') {
    if (events.length < 4) {
      return false;
    }

    if (isSixtyOrOlder(categories)) {
      return true;
    }

    const buckets = new Set(events.map((e) => e.bucket));
    return buckets.has('short') && buckets.has('medium') && buckets.has('long');
  }

  // Other series have no minimum requirement
  return true;
}

function totalRunnerPoints(
  series: string,
  categories: string[],
  events: RunnerEvent[]
): number {
  if (series === 'Under23') {
    return [...events]
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .reduce((sum, event) => sum + event.points, 0);
  }

  if (series === 'BogAndBurn') {
    // BogAndBurn: best 6 results (lower points are better since points = position)
    return [...events]
      .sort((a, b) => a.points - b.points)
      .slice(0, 6)
      .reduce((sum, event) => sum + event.points, 0);
  }

  if (series === 'LongClassics') {
    return events
      .sort((a, b) => b.points - a.points)
      .slice(0, 5)
      .reduce((sum, event) => sum + event.points, 0);
  }

  if (isSixtyOrOlder(categories)) {
    return [...events]
      .sort((a, b) => b.points - a.points)
      .slice(0, 4)
      .reduce((sum, event) => sum + event.points, 0);
  }

  const selected = new Set<number>();
  const scoredBuckets: DistanceBucket[] = ['short', 'medium', 'long'];

  scoredBuckets.forEach((bucket) => {
    let bestIndex = -1;
    let bestPoints = Number.NEGATIVE_INFINITY;

    events.forEach((event, index) => {
      if (event.bucket !== bucket) {
        return;
      }

      if (event.points > bestPoints) {
        bestPoints = event.points;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0) {
      selected.add(bestIndex);
    }
  });

  let bestRemainingIndex = -1;
  let bestRemainingPoints = Number.NEGATIVE_INFINITY;
  events.forEach((event, index) => {
    if (selected.has(index)) {
      return;
    }
    if (event.points > bestRemainingPoints) {
      bestRemainingPoints = event.points;
      bestRemainingIndex = index;
    }
  });

  if (bestRemainingIndex >= 0) {
    selected.add(bestRemainingIndex);
  }

  return Array.from(selected).reduce(
    (sum, index) => sum + events[index].points,
    0
  );
}

function buildRunnerResultsMap(
  rows: RaceResult[],
  runnerName: string,
  runnerClub: string
): Map<string, RaceResult> {
  const map = new Map<string, RaceResult>();
  const normalizedSearchName = runnerName.toLowerCase();
  const normalizedSearchClub = runnerClub.toLowerCase();
  rows.forEach((row) => {
    if (
      row.name.toLowerCase() === normalizedSearchName &&
      row.club.toLowerCase() === normalizedSearchClub
    ) {
      map.set(row.raceId, row);
    }
  });
  return map;
}

function countHeadToHeadWins(
  runnerA: StandingRow,
  runnerB: StandingRow,
  allResults: RaceResult[]
): number {
  const resultsMapA = buildRunnerResultsMap(
    allResults,
    runnerA.name,
    runnerA.club
  );
  const resultsMapB = buildRunnerResultsMap(
    allResults,
    runnerB.name,
    runnerB.club
  );

  let aWins = 0;
  let totalShared = 0;

  // Find shared races
  resultsMapA.forEach((resultA, raceId) => {
    const resultB = resultsMapB.get(raceId);
    if (resultB) {
      totalShared++;
      if (resultA.position < resultB.position) aWins++;
    }
  });

  // Return number of wins; will be used in sort as tiebreaker
  // Negative means A is better (more wins)
  return totalShared > 0 ? aWins : 0;
}

function formatPoints(points: number): string {
  return String(Math.round(points));
}

function buildStandings(
  series: string,
  rows: RaceResult[],
  raceMetadata: RaceMetadata
): StandingRow[] {
  const grouped = new Map<
    string,
    StandingRow & { runnerEvents: RunnerEvent[] }
  >();

  rows.forEach((row) => {
    const normalizedName = row.name.trim() || 'Unknown';
    const normalizedClub = row.club.trim();
    const groupKey = `${normalizedName.toLowerCase()}|${normalizedClub.toLowerCase()}`;
    const racePoints = row.points ?? 0;
    const bucket = getDistanceBucket(raceMetadata[row.raceId]?.distance);
    const existing = grouped.get(groupKey);

    if (existing) {
      if (!existing.categories.includes(row.category)) {
        existing.categories.push(row.category);
      }
      existing.runnerEvents.push({
        raceId: row.raceId,
        points: racePoints,
        bucket,
      });
      existing.events.push({ raceId: row.raceId, points: racePoints });
      return;
    }

    grouped.set(groupKey, {
      key: groupKey,
      name: normalizedName,
      club: normalizedClub,
      categories: [row.category],
      points: 0,
      runnerEvents: [{ raceId: row.raceId, points: racePoints, bucket }],
      events: [{ raceId: row.raceId, points: racePoints }],
    });
  });

  const finalized = Array.from(grouped.values()).map((runner) => {
    const sortedEvents = [...runner.events].sort((a, b) =>
      a.raceId.localeCompare(b.raceId)
    );
    return {
      key: runner.key,
      name: runner.name,
      club: runner.club,
      categories: runner.categories,
      points: totalRunnerPoints(series, runner.categories, runner.runnerEvents),
      events: sortedEvents,
      runnerEvents: runner.runnerEvents,
      isQualified: meetsMinimumRequirements(
        series,
        runner.categories,
        runner.runnerEvents
      ),
    };
  });

  return finalized.sort((a, b) => {
    const pointsDiff =
      series === 'BogAndBurn' ? a.points - b.points : b.points - a.points;
    if (pointsDiff !== 0) {
      return pointsDiff;
    }

    // Tie-breaker: head-to-head comparison in shared races
    const aHeadToHeadWins = countHeadToHeadWins(a, b, rows);
    const bHeadToHeadWins = countHeadToHeadWins(b, a, rows);

    if (aHeadToHeadWins !== bHeadToHeadWins) {
      return bHeadToHeadWins - aHeadToHeadWins;
    }

    // Final tie-breaker: alphabetical by name
    return a.name.localeCompare(b.name);
  });
}

const CHAMP_TAB_STORAGE_KEY = 'championship.activeTab';

export default function ChampionshipYearPageClient({
  series,
  year,
}: ChampionshipYearPageClientProps) {
  const [results, setResults] = useState<RaceResult[] | null>(null);
  const [raceMetadata, setRaceMetadata] = useState<RaceMetadata>({});
  const [activeTab, setActiveTab] = useState<ChampionshipTab>(() => {
    try {
      const saved = window.localStorage.getItem(CHAMP_TAB_STORAGE_KEY);
      if (saved === 'standings' || saved === 'results') return saved;
    } catch {}
    return 'standings';
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(CHAMP_TAB_STORAGE_KEY, activeTab);
    } catch {}
  }, [activeTab]);

  const [selectedRunnerName, setSelectedRunnerName] = useState('');
  const [selectedCategoryPos, setSelectedCategoryPos] = useState<string>('All');
  const [selectedClub, setSelectedClub] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [clubNameToSlug, setClubNameToSlug] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    fetchGzipJson<Array<{ name: string; slug: string }>>('/clubs.json.gz')
      .then((result) => {
        if (result.status === 'ok') {
          const map: Record<string, string> = {};
          for (const c of result.data) map[c.name] = c.slug;
          setClubNameToSlug(map);
        }
      })
      .catch(() => {});
  }, []);

  const allStandings = useMemo(
    () => buildStandings(series, results ?? [], raceMetadata),
    [results, raceMetadata, series]
  );

  const availableCategoryPos = useMemo(() => {
    const categories = new Set<string>();
    results?.forEach((row) => {
      Object.keys(row.categoryPos).forEach((cat) => categories.add(cat));
    });
    return Array.from(categories).sort();
  }, [results]);

  const availableClubs = useMemo(() => {
    const clubs = new Set<string>();
    results?.forEach((row) => {
      if (row.club?.trim()) {
        clubs.add(row.club.trim());
      }
    });
    return Array.from(clubs).sort((a, b) => a.localeCompare(b));
  }, [results]);

  const filteredStandings = useMemo(() => {
    if (selectedCategoryPos === 'All' || !results) {
      return allStandings;
    }

    const filteredRows = results.filter(
      (row) => selectedCategoryPos in row.categoryPos
    );
    const grouped = new Map<
      string,
      StandingRow & { runnerEvents: RunnerEvent[] }
    >();

    filteredRows.forEach((row) => {
      const normalizedName = row.name.trim() || 'Unknown';
      const normalizedClub = row.club.trim();
      const groupKey = `${normalizedName.toLowerCase()}|${normalizedClub.toLowerCase()}`;

      const racePoints = row.points ?? 0;

      const bucket = getDistanceBucket(raceMetadata[row.raceId]?.distance);
      const existing = grouped.get(groupKey);

      if (existing) {
        existing.runnerEvents.push({
          raceId: row.raceId,
          points: racePoints,
          bucket,
        });
        existing.events.push({ raceId: row.raceId, points: racePoints });
        return;
      }

      grouped.set(groupKey, {
        key: groupKey,
        name: normalizedName,
        club: normalizedClub,
        categories: [selectedCategoryPos],
        points: 0,
        runnerEvents: [{ raceId: row.raceId, points: racePoints, bucket }],
        events: [{ raceId: row.raceId, points: racePoints }],
        isQualified: false,
      });
    });

    const finalized = Array.from(grouped.values()).map((runner) => {
      const sortedEvents = [...runner.events].sort((a, b) =>
        a.raceId.localeCompare(b.raceId)
      );
      return {
        key: runner.key,
        name: runner.name,
        club: runner.club,
        categories: runner.categories,
        points: totalRunnerPoints(
          series,
          runner.categories,
          runner.runnerEvents
        ),
        events: sortedEvents,
        runnerEvents: runner.runnerEvents,
        isQualified: meetsMinimumRequirements(
          series,
          runner.categories,
          runner.runnerEvents
        ),
      };
    });

    return finalized.sort((a, b) => {
      const pointsDiff =
        series === 'BogAndBurn' ? a.points - b.points : b.points - a.points;
      if (pointsDiff !== 0) {
        return pointsDiff;
      }

      // Tie-breaker: head-to-head comparison in shared races
      const aHeadToHeadWins = countHeadToHeadWins(a, b, results ?? []);
      const bHeadToHeadWins = countHeadToHeadWins(b, a, results ?? []);

      if (aHeadToHeadWins !== bHeadToHeadWins) {
        return bHeadToHeadWins - aHeadToHeadWins;
      }

      // Final tie-breaker: alphabetical by name
      return a.name.localeCompare(b.name);
    });
  }, [selectedCategoryPos, allStandings, results, series, raceMetadata]);

  const clubFilteredStandings = useMemo(() => {
    if (selectedClub === 'All') {
      return filteredStandings;
    }

    return filteredStandings.filter((runner) => runner.club === selectedClub);
  }, [filteredStandings, selectedClub]);

  const qualifiedStandings = useMemo(
    () => clubFilteredStandings?.filter((r) => r.isQualified) ?? [],
    [clubFilteredStandings]
  );
  const unqualifiedStandings = useMemo(
    () => clubFilteredStandings?.filter((r) => !r.isQualified) ?? [],
    [clubFilteredStandings]
  );

  const handleRunnerClick = (runnerName: string) => {
    setSelectedRunnerName(runnerName);
    setActiveTab('results');
  };

  useEffect(() => {
    let isCancelled = false;

    async function loadChampionshipYearData() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsNotFound(false);

      try {
        const [result, racesResult] = await Promise.all([
          fetchGzipJson<RaceResult[]>(
            `/results/${encodeURIComponent(series)}-${encodeURIComponent(year)}.json.gz`
          ),
          fetchGzipJson<RaceMetadata>('/results/races.json.gz'),
        ]);

        if (!isCancelled) {
          if (result.status === 'ok') {
            setResults(result.data);
          } else if (result.status === 'not-found') {
            setIsNotFound(true);
            setResults(null);
          } else {
            throw result.error;
          }

          if (racesResult.status === 'ok') {
            setRaceMetadata(racesResult.data);
          } else {
            setRaceMetadata({});
          }
        }
      } catch (error) {
        console.error(
          'Failed to fetch championship year data on client:',
          error
        );
        if (!isCancelled) {
          setErrorMessage(
            'Failed to load championship results. Please try again later.'
          );
          setResults(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadChampionshipYearData();
    return () => {
      isCancelled = true;
    };
  }, [series, year]);

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
            <li>
              <Link
                href="/championships"
                className="text-blue-600 hover:text-blue-800"
              >
                Championships
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/championships/${encodeURIComponent(series)}`}
                className="text-blue-600 hover:text-blue-800"
              >
                {series}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li
              className="font-semibold text-slate-900 dark:text-slate-100"
              aria-current="page"
            >
              {year}
            </li>
          </ol>
        </nav>

        <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-slate-50">
          {series} {year}
        </h1>

        {isLoading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              Loading championship results...
            </p>
          </div>
        ) : isNotFound ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              No championship results found for {series} {year}.
            </p>
            <Link
              href={`/championships/${encodeURIComponent(series)}`}
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Back to Championship
            </Link>
          </div>
        ) : errorMessage ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-2 font-semibold text-red-600">{errorMessage}</p>
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              Try again in a few minutes.
            </p>
          </div>
        ) : results ? (
          <div className="space-y-4">
            <div
              className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              role="tablist"
              aria-label="Championship view selector"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'standings'}
                onClick={() => setActiveTab('standings')}
                className={
                  activeTab === 'standings'
                    ? 'rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-md px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }
              >
                Standings
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'results'}
                onClick={() => setActiveTab('results')}
                className={
                  activeTab === 'results'
                    ? 'rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-md px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }
              >
                Results
              </button>
            </div>

            {activeTab === 'standings' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="categorypos-select"
                      className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Category:
                    </label>
                    <select
                      id="categorypos-select"
                      value={selectedCategoryPos}
                      onChange={(e) => setSelectedCategoryPos(e.target.value)}
                      className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="All">All</option>
                      {availableCategoryPos.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="club-select"
                      className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Club:
                    </label>
                    <select
                      id="club-select"
                      value={selectedClub}
                      onChange={(e) => setSelectedClub(e.target.value)}
                      className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="All">All</option>
                      {availableClubs.map((club) => (
                        <option key={club} value={club}>
                          {club}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {qualifiedStandings.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                      Qualified Runners
                    </h3>
                    <div className="overflow-x-auto rounded-lg bg-white shadow-md dark:bg-slate-900">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Club
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Category
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Points
                            </th>
                            <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 sm:table-cell dark:text-slate-300">
                              Events
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {qualifiedStandings.map((runner) => (
                            <tr
                              key={runner.key}
                              tabIndex={0}
                              onClick={() => handleRunnerClick(runner.name)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' ||
                                  event.key === ' '
                                ) {
                                  event.preventDefault();
                                  handleRunnerClick(runner.name);
                                }
                              }}
                              className="cursor-pointer bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                            >
                              <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                <Link
                                  href={`/runner?name=${encodeURIComponent(runner.name)}`}
                                  className="text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  {runner.name}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                {runner.club && clubNameToSlug[runner.club] ? (
                                  <Link
                                    href={`/clubs/${encodeURIComponent(clubNameToSlug[runner.club])}`}
                                    className="text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    {runner.club}
                                  </Link>
                                ) : (
                                  runner.club
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                {runner.categories.join(', ')}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {formatPoints(runner.points)}
                              </td>
                              <td className="hidden px-4 py-3 text-sm text-slate-700 sm:table-cell dark:text-slate-200">
                                {runner.events
                                  .map(
                                    (event) =>
                                      `${event.raceId}: ${formatPoints(event.points)}`
                                  )
                                  .join(', ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {unqualifiedStandings.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                      Unqualified Runners
                    </h3>
                    {series === 'SHR' && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Runners below minimum requirement (4 races, at least one
                        in each distance category for under-60)
                      </p>
                    )}
                    {series === 'LongClassics' && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Runners below minimum requirement (5 races)
                      </p>
                    )}
                    {series === 'BogAndBurn' && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Runners below minimum requirement (6 races)
                      </p>
                    )}
                    <div className="overflow-x-auto rounded-lg bg-white shadow-md dark:bg-slate-900">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Club
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Category
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Points
                            </th>
                            <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 sm:table-cell dark:text-slate-300">
                              Events
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {unqualifiedStandings.map((runner) => (
                            <tr
                              key={runner.key}
                              tabIndex={0}
                              onClick={() => handleRunnerClick(runner.name)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' ||
                                  event.key === ' '
                                ) {
                                  event.preventDefault();
                                  handleRunnerClick(runner.name);
                                }
                              }}
                              className="cursor-pointer bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                            >
                              <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {runner.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                {runner.club && clubNameToSlug[runner.club] ? (
                                  <Link
                                    href={`/clubs/${encodeURIComponent(clubNameToSlug[runner.club])}`}
                                    className="text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    {runner.club}
                                  </Link>
                                ) : (
                                  runner.club
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                {runner.categories.join(', ')}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {formatPoints(runner.points)}
                              </td>
                              <td className="hidden px-4 py-3 text-sm text-slate-700 sm:table-cell dark:text-slate-200">
                                {runner.events
                                  .map(
                                    (event) =>
                                      `${event.raceId}: ${formatPoints(event.points)}`
                                  )
                                  .join(', ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {qualifiedStandings.length === 0 &&
                  unqualifiedStandings.length === 0 && (
                    <div className="rounded-lg bg-slate-50 p-6 text-center dark:bg-slate-800">
                      <p className="text-slate-600 dark:text-slate-400">
                        No standings data available for this selection.
                      </p>
                    </div>
                  )}
              </div>
            ) : (
              <RaceResultsDataTable
                data={results}
                showRaceColumn
                showYearFilter={false}
                initialNameFilter={selectedRunnerName}
                showPointsColumn
              />
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              No championship data available.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
