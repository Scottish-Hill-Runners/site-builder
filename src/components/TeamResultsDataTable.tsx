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
import raceTitle from '@/lib/race-title';

interface TeamResultsDataTableProps {
  data: Array<RaceResult>;
  races?: { [raceId: string]: RaceInfo };
  showRaceColumn?: boolean;
  initialRaceFilter?: string;
  showYearFilter?: boolean;
  initialYearFilter?: string;
  showCategoryFilter?: boolean;
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
  team: string;
  category: string;
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
  showCategoryFilter = true,
}: TeamResultsDataTableProps) {
  'use no memo';
  const filterCount =
    Number(showYearFilter) +
    Number(showRaceColumn) +
    Number(showCategoryFilter) + 1;
  const filterGridColumns = `lg:grid-cols-${filterCount}`;

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
    team: '',
    category: '',
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

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const result of data)
      if (result.category) cats.add(result.category);
    return Array.from(cats).sort();
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
      (!showYearFilter || filters.year === '' || r.year === filters.year) &&
      (!filters.category || r.category === filters.category) &&
      (!filters.team || r.team.toLowerCase().includes(filters.team.toLowerCase()))
    );

    // Aggregate into teams
    const teamMap = aggregateTeamResults(filteredData);
    const teams = sortAggregatedTeams(teamMap);

    // Sort teams by specified column
    teams.sort((a, b) => {
      let comparison = 0;

      const primaryCol = sortColumn || 'totalTime';

      if (primaryCol === 'raceTitle') {
        const aRace = a.runners[0] ? raceTitle(a.runners[0].raceId, races) : '';
        const bRace = b.runners[0] ? raceTitle(b.runners[0].raceId, races) : '';
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
    setFilters({ raceId: '', year: '', team: '', category: '' });
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
      if (typeof a === 'number' && typeof b === 'number')
        return a - b;
      return String(a).localeCompare(String(b));
    });
  }, [displayTeams]);

  // eslint-disable-next-line react-hooks/incompatible-library
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
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
              Filters
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters((prev) => !prev)}
                aria-expanded={showFilters}
                aria-controls="team-results-filter-controls"
                className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              {Object.values(filters).some(Boolean) && (
                <button
                  onClick={clearFilters}
                  className="rounded bg-red-100 px-3 py-1 text-xs text-red-700 transition-colors hover:bg-red-200 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-950"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

          {showFilters && (
            <div
              id="team-results-filter-controls"
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${filterGridColumns}`}
            >
              {showYearFilter && (
                <div>
                  <select
                    value={filters.year}
                    onChange={(e) => handleFilterChange('year', e.target.value)}
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    //"mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
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
                  <select
                    value={filters.raceId}
                    onChange={(e) =>
                      handleFilterChange('raceId', e.target.value)
                    }
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
              <div>
                <input
                  value={filters.team}
                  placeholder="Filter by team"
                  onChange={(e) => handleFilterChange('team', e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />  
              </div>
              {showCategoryFilter && (
                <div>
                  <select
                    value={filters.category}
                    onChange={(e) => handleFilterChange('category', e.target.value)}
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
