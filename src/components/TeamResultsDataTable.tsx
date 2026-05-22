'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Link from 'next/link';
import {
  RaceResult,
  RaceInfo,
} from '@/types/datatable';
import {
  aggregateTeamResults,
  sortAggregatedTeams,
  timeToSeconds,
} from '@/lib/team-results-aggregator';

interface TeamResultsDataTableProps {
  data: Array<RaceResult>;
  races?: { [raceId: string]: RaceInfo };
  showRaceColumn?: boolean;
  initialRaceFilter?: string;
  showYearFilter?: boolean;
  initialYearFilter?: string;
}

type SortColumn =
  | 'raceTitle'
  | 'year'
  | 'team'
  | 'totalTime'
  | null;
type SortDirection = 'asc' | 'desc';

interface Filters {
  raceId: string;
  year: string;
}

const FILTER_VISIBILITY_STORAGE_KEY = 'teamResults.showFilters';
const MOBILE_BREAKPOINT = 640;

export default function TeamResultsDataTable({
  data,
  races,
  showRaceColumn = false,
  initialRaceFilter = '',
  showYearFilter = true,
  initialYearFilter = '',
}: TeamResultsDataTableProps) {
  'use no memo';

  const [sortColumn, setSortColumn] = useState<SortColumn>('totalTime');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showFilters, setShowFilters] = useState(() => {
    if (typeof window === 'undefined') return false;
    const savedValue = window.localStorage.getItem(
      FILTER_VISIBILITY_STORAGE_KEY
    );
    return savedValue === 'true';
  });
  const [filters, setFilters] = useState<Filters>({
    raceId: initialRaceFilter,
    year: initialYearFilter,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(true);
  const [visibleLimit, setVisibleLimit] = useState(300);

  const teamYears = useMemo(() => {
    const years = new Set<string>();
    for (const result of data) {
      if (result.team) years.add(result.year);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [data]);

  useEffect(() => {
    if (filters.year && !teamYears.includes(filters.year)) {
      setFilters((prev) => ({ ...prev, year: '' }));
    }
  }, [filters.year, teamYears]);

  // Persist filter panel preference for future visits.
  useEffect(() => {
    window.localStorage.setItem(
      FILTER_VISIBILITY_STORAGE_KEY,
      showFilters ? 'true' : 'false'
    );
  }, [showFilters]);

  // Aggregate and sort team data
  const processedTeams = useMemo(() => {
    // Filter results by race/year and keep only rows with team data.
    const filteredData = data.filter((r) =>
      r.team !== undefined &&
      (!showRaceColumn || filters.raceId === '' || r.raceId === filters.raceId) &&
      (!showYearFilter || filters.year === '' || r.year === filters.year)
    );

    // Aggregate into teams
    const teamMap = aggregateTeamResults(filteredData);
    const teams = sortAggregatedTeams(teamMap);

    // Sort teams by specified column
    teams.sort((a, b) => {
      let comparison = 0;

      const primaryCol = sortColumn || 'totalTime';

      if (primaryCol === 'raceTitle') {
        const aRace = a.runners[0] ? races?.[a.runners[0].raceId]?.title ?? a.runners[0].raceId : '';
        const bRace = b.runners[0] ? races?.[b.runners[0].raceId]?.title ?? b.runners[0].raceId : '';
        comparison =
          sortDirection === 'asc'
            ? aRace.localeCompare(bRace)
            : bRace.localeCompare(aRace);
      } else if (primaryCol === 'year') {
        const aYear = a.runners[0]?.year ?? '';
        const bYear = b.runners[0]?.year ?? '';
        comparison =
          sortDirection === 'asc'
            ? aYear.localeCompare(bYear)
            : bYear.localeCompare(aYear);
      } else if (primaryCol === 'totalTime') {
        const aSeconds = timeToSeconds(a.totalTime);
        const bSeconds = timeToSeconds(b.totalTime);
        comparison = sortDirection === 'asc' ? aSeconds - bSeconds : bSeconds - aSeconds;
      } else if (primaryCol === 'team') {
        comparison =
          sortDirection === 'asc'
            ? a.team.localeCompare(b.team)
            : b.team.localeCompare(a.team);
      }

      return comparison;
    });

    return teams;
  }, [
    data,
    filters,
    sortColumn,
    sortDirection,
    showRaceColumn,
    showYearFilter,
    races,
  ]);

  // Reset scroll position when filters/sort change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [processedTeams]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleFilterChange = (field: keyof Filters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      raceId: '',
      year: '',
    });
  };

  function getSortIndicator(column: SortColumn): string {
    if (sortColumn !== column) return '⇅';
    return sortDirection === 'asc' ? '↑' : '↓';
  }

  const hasLegData = useMemo(
    () => data.some((result) => result.team && result.leg !== undefined),
    [data]
  );

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < MOBILE_BREAKPOINT);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const capConfig = useMemo(
    () =>
      isMobileViewport
        ? { initial: 300, step: 150, hardCap: 1500 }
        : { initial: 500, step: 250, hardCap: 3000 },
    [isMobileViewport]
  );

  const isUnfilteredAllYearsMode =
    showYearFilter && filters.year === '' && filters.raceId === '';

  useEffect(() => {
    if (!isUnfilteredAllYearsMode) return;
    setVisibleLimit(capConfig.initial);
  }, [
    isUnfilteredAllYearsMode,
    capConfig.initial,
    filters.year,
    filters.raceId,
    sortColumn,
    sortDirection,
  ]);

  const cappedMatchCount =
    isUnfilteredAllYearsMode
      ? Math.min(processedTeams.length, capConfig.hardCap)
      : processedTeams.length;
  const displayedMatchCount =
    isUnfilteredAllYearsMode
      ? Math.min(visibleLimit, cappedMatchCount)
      : processedTeams.length;
  const isCapActive =
    isUnfilteredAllYearsMode && processedTeams.length > displayedMatchCount;
  const canShowMore =
    isUnfilteredAllYearsMode && displayedMatchCount < cappedMatchCount;
  const displayTeams =
    isUnfilteredAllYearsMode && displayedMatchCount < processedTeams.length
      ? processedTeams.slice(0, displayedMatchCount)
      : processedTeams;

  // Get all unique leg identifiers across teams for column headers
  const allLegs = useMemo(() => {
    const legSet = new Set<number | string>();
    for (const team of displayTeams) {
      for (const leg of team.sortedLegs) {
        legSet.add(leg);
      }
    }
    return Array.from(legSet).sort((a, b) => {
      const aNum = typeof a === 'number' ? a : NaN;
      const bNum = typeof b === 'number' ? b : NaN;
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return String(a).localeCompare(String(b));
    });
  }, [displayTeams]);

  const rowVirtualizer = useVirtualizer({
    count: displayTeams.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() -
        virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="rounded-lg bg-white p-4 shadow-md dark:bg-slate-900">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 dark:text-slate-200">
              Team View
            </h3>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>

          {showFilters && (
            <div className="space-y-3 border-t border-gray-300 pt-3 dark:border-slate-700">
              {showYearFilter && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Year
                  </label>
                  <select
                    value={filters.year}
                    onChange={(e) => handleFilterChange('year', e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  >
                    <option value="">All team years</option>
                    {teamYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {showRaceColumn && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Race
                  </label>
                  <select
                    value={filters.raceId}
                    onChange={(e) =>
                      handleFilterChange('raceId', e.target.value)
                    }
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  >
                    <option value="">All races</option>
                    {Object.entries(races ?? {}).map(([id, info]) => (
                      <option key={id} value={id}>
                        {info.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {isCapActive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p>
            Showing {displayedMatchCount.toLocaleString()} of {processedTeams.length.toLocaleString()} matching teams.
          </p>
          <div className="mt-3 flex items-center gap-3">
            {canShowMore && (
              <button
                type="button"
                onClick={() =>
                  setVisibleLimit((prev) =>
                    Math.min(prev + capConfig.step, capConfig.hardCap)
                  )
                }
                className="rounded bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900/70"
              >
                Show {capConfig.step.toLocaleString()} more
              </button>
            )}
            {!canShowMore && processedTeams.length > capConfig.hardCap && (
              <span className="text-xs text-amber-800 dark:text-amber-300">
                Refine filters to see beyond {capConfig.hardCap.toLocaleString()} teams.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div
            className="max-h-screen overflow-y-auto"
            ref={scrollContainerRef}
          >
            <table className="w-full border-collapse bg-white dark:bg-slate-900">
              <thead>
                <tr className="sticky top-0 border-b-2 border-gray-300 bg-gray-100 dark:border-slate-700 dark:bg-slate-800">
                  {showRaceColumn && (
                    <th
                      onClick={() => handleSort('raceTitle')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Race {getSortIndicator(
                        sortColumn === 'raceTitle' ? 'raceTitle' : null
                      )}
                    </th>
                  )}
                  <th
                    onClick={() => handleSort('year')}
                    className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Year {getSortIndicator(sortColumn === 'year' ? 'year' : null)}
                  </th>
                  <th
                    onClick={() => handleSort('team')}
                    className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Team {getSortIndicator(
                      sortColumn === 'team' ? 'team' : null
                    )}
                  </th>
                  <th className="px-2 py-3 text-left text-sm font-semibold text-gray-700 sm:px-6 dark:text-slate-200">
                    Team Category
                  </th>
                  {hasLegData &&
                    allLegs.map((leg) => (
                      <th
                        key={`leg-${leg}`}
                        className="px-2 py-3 text-left text-sm font-semibold text-gray-700 sm:px-6 dark:text-slate-200"
                      >
                        Leg {leg}
                      </th>
                    ))}
                  <th
                    onClick={() => handleSort('totalTime')}
                    className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Total {getSortIndicator(
                      sortColumn === 'totalTime' ? 'totalTime' : null
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayTeams.length === 0 ? (
                  <tr>
                    <td
                      colSpan={(hasLegData ? allLegs.length : 0) + (showRaceColumn ? 5 : 4)}
                      className="px-6 py-4 text-center text-sm text-gray-500 dark:text-slate-400"
                    >
                      No team results
                    </td>
                  </tr>
                ) : (
                  <>
                    {paddingTop > 0 && (
                      <tr>
                        <td
                          colSpan={(hasLegData ? allLegs.length : 0) + (showRaceColumn ? 5 : 4)}
                          style={{ height: paddingTop }}
                        />
                      </tr>
                    )}
                    {virtualItems.map((virtualRow) => {
                      const team = displayTeams[virtualRow.index];
                      const zebraTone =
                        virtualRow.index % 2 === 0
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-gray-50 dark:bg-slate-950';
                      return (
                        <tr key={virtualRow.key} className={zebraTone}>
                          {showRaceColumn && (
                            <td className="px-2 py-4 text-sm text-gray-800 sm:px-6 dark:text-slate-200">
                              {team.runners[0] && (
                                <Link
                                  href={`/races/${encodeURIComponent(team.runners[0].raceId)}`}
                                  className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                >
                                  {races?.[team.runners[0].raceId]?.title ??
                                    team.runners[0].raceId}
                                </Link>
                              )}
                            </td>
                          )}
                          <td className="px-2 py-4 text-sm text-gray-800 sm:px-6 dark:text-slate-200">
                            {team.runners[0]?.year ?? '-'}
                          </td>
                          <td className="px-2 py-4 text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">
                            {team.team}
                          </td>
                          <td className="px-2 py-4 text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">
                            {team.teamCategory}
                          </td>
                          {hasLegData &&
                            allLegs.map((leg) => {
                              const legResult = team.legResults.get(leg);
                              return (
                                <td
                                  key={`${team.team}-${leg}`}
                                  className="px-2 py-4 font-mono text-sm text-gray-800 sm:px-6 dark:text-slate-200"
                                >
                                  {legResult ? (
                                    <>
                                      <div>{legResult.time}</div>
                                      {legResult.isIncomplete && (
                                        <div className="text-xs text-orange-600 dark:text-orange-400">
                                          (incomplete)
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              );
                            })}
                          <td className="px-2 py-4 font-mono text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">
                            {team.totalTime}
                            {team.hasIncomplete && (
                              <div className="text-xs text-orange-600 dark:text-orange-400">
                                (incomplete)
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {paddingBottom > 0 && (
                      <tr>
                        <td
                          colSpan={(hasLegData ? allLegs.length : 0) + (showRaceColumn ? 5 : 4)}
                          style={{ height: paddingBottom }}
                        />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Results Info */}
      <div className="text-sm text-gray-600 dark:text-slate-300">
        {isCapActive
          ? `Showing ${displayedMatchCount.toLocaleString()} of ${processedTeams.length.toLocaleString()} matching teams`
          : `Showing ${displayTeams.length.toLocaleString()} teams`}
      </div>
    </div>
  );
}
