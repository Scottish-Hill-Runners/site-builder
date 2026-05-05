'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Link from 'next/link';
import { RaceResult, RaceInfo, Era, ResultsFocusContext } from '@/types/datatable';
import { normalizeResultYear } from '@/lib/results-correction-link';
import { fetchGzipJson } from '@/lib/client-results-fetch';

interface DataTableProps {
  data: Array<RaceResult>;
  races?: { [raceId: string]: RaceInfo };
  eras?: Era[];
  showRaceColumn?: boolean;
  showRaceTitle?: boolean;
  showYearFilter?: boolean;
  initialNameFilter?: string;
  initialYearFilter?: string;
  enableRowFocus?: boolean;
  onFocusContextChange?: (context: ResultsFocusContext | null) => void;
}

type SortColumn = 'raceTitle' | 'year' | 'position' | 'name' | 'club' | 'category' | 'time' | null;
type SortDirection = 'asc' | 'desc';

interface Filters {
  year: string;
  name: string;
  club: string;
  category: string;
}

const FILTER_VISIBILITY_STORAGE_KEY = 'raceResults.showFilters';

function eraContainsYear(era: Era, year: number): boolean {
  if (era.from !== undefined && year < era.from) return false;
  if (era.to !== undefined && year > era.to) return false;
  return true;
}

export default function RaceResultsDataTable({
  data,
  races,
  eras,
  showRaceColumn = false,
  showRaceTitle = false,
  showYearFilter = true,
  initialNameFilter = '',
  initialYearFilter = '',
  enableRowFocus = false,
  onFocusContextChange,
}: DataTableProps) {
  "use no memo";
  const [clubNameToSlug, setClubNameToSlug] = useState<Record<string, string>>({});

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

  const [sortColumn, setSortColumn] = useState<SortColumn>(showRaceColumn ? 'raceTitle' : 'year');
  const [sortDirection, setSortDirection] = useState<SortDirection>(showRaceColumn ? 'asc' : 'desc');
  const [showFilters, setShowFilters] = useState(() => {
    if (typeof window === 'undefined') return true;
    const savedValue = window.localStorage.getItem(FILTER_VISIBILITY_STORAGE_KEY);
    return savedValue === 'true';
  });
  const [filters, setFilters] = useState<Filters>({
    year: initialYearFilter,
    name: initialNameFilter,
    club: '',
    category: '',
  });
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const getRowKey = (row: RaceResult) => [
    row.raceId,
    row.year,
    row.position,
    row.name,
    row.time,
  ].join('|');

  // Persist filter panel preference for future visits.
  useEffect(() => {
    window.localStorage.setItem(FILTER_VISIBILITY_STORAGE_KEY, showFilters ? 'true' : 'false');
  }, [showFilters]);

  // Filter and sort data
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply filters
    const eraLabel = showYearFilter && filters.year.startsWith('era:') ? filters.year.slice(4) : null;
    const activeEra = eraLabel != null ? (eras ?? []).find((e) => e.label === eraLabel) : null;
    result = result.filter((row) => {
      const yearNum = parseInt(row.year.substring(0, 4), 10);
      const yearMatch = !showYearFilter || filters.year === ''
        ? true
        : activeEra != null
          ? eraContainsYear(activeEra, yearNum)
          : row.year.toString().includes(filters.year);
      return (
        yearMatch &&
        (filters.name === '' || row.name.toLowerCase().includes(filters.name.toLowerCase())) &&
        (filters.club === '' || row.club.toLowerCase().includes(filters.club.toLowerCase())) &&
        (filters.category === '' || (filters.category in row.categoryPos))
      );
    });

    // Apply sorting - year then position as secondary sort
    result.sort((a, b) => {
      let comparison = 0;

      // Primary sort: by sortColumn (or year if no custom sort)
      const primaryCol = sortColumn || 'year';
      let aVal: string | number;
      let bVal: string | number;

      if (primaryCol === 'raceTitle') {
        aVal = races?.[a.raceId]?.title ?? a.raceId;
        bVal = races?.[b.raceId]?.title ?? b.raceId;
      } else {
        aVal = a[primaryCol];
        bVal = b[primaryCol];
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        if (primaryCol === 'time') {
          if (a['year'].endsWith("*")) aVal = "x" + aVal;
          if (b['year'].endsWith("*")) bVal = "x" + bVal;
        }

        comparison = sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        if (primaryCol === 'position' && filters.category !== '') {
          aVal = a.categoryPos[filters.category];
          bVal =b.categoryPos[filters.category]
        }
        
        comparison = sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // Secondary sort: by position if primary sort is by year and values are equal
      if (comparison === 0 && primaryCol === 'year')
        return a.position - b.position;

      // Secondary sort: by year if primary sort is by something else and values are equal
      if (comparison === 0 && primaryCol !== 'year')
        return a.year.localeCompare(b.year);

      return comparison;
    });

    return result;
  }, [data, filters, sortColumn, sortDirection, showYearFilter, races, eras]);

  // Reset scroll position when filters/sort change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [processedData]);

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
    setFilters({ year: '', name: '', club: '', category: '' });
    setSortColumn(showRaceColumn ? 'raceTitle' : 'year');
    setSortDirection(showRaceColumn ? 'asc' : 'desc');
  };

  const getSortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return ' ↕️';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  // Get unique categories from currently filtered data (excluding category filter)
  const availableCategories = useMemo(() => {
    let result = [...data];

    // Apply all filters EXCEPT category
    const eraLabelCat = showYearFilter && filters.year.startsWith('era:') ? filters.year.slice(4) : null;
    const activeEraCat = eraLabelCat != null ? (eras ?? []).find((e) => e.label === eraLabelCat) : null;
    result = result.filter((row) => {
      const yearNum = parseInt(row.year.substring(0, 4), 10);
      const yearMatch = !showYearFilter || filters.year === ''
        ? true
        : activeEraCat != null
          ? eraContainsYear(activeEraCat, yearNum)
          : row.year.includes(filters.year);
      return (
        yearMatch &&
        (filters.name === '' || row.name.toLowerCase().includes(filters.name.toLowerCase())) &&
        (filters.club === '' || row.club.toLowerCase().includes(filters.club.toLowerCase()))
      );
    });

    // Get unique categories, sorted alphabetically
    const uniq = new Set<string>();
    result.forEach((row) => {
      Object.keys(row.categoryPos).forEach((cat) => uniq.add(cat));
    });
    return Array.from(uniq).sort();
  }, [data, filters.year, filters.name, filters.club, showYearFilter, eras]);

  // Get unique years from data, sorted in ascending order
  const availableYears = useMemo(() => {
    const uniqueYears = Array.from(new Set(data.map((row) => row.year.substring(0, 4)))).sort((a, b) => b.localeCompare(a));
    return uniqueYears;
  }, [data]);

  const selectedRow = useMemo(() => {
    if (!enableRowFocus || !selectedRowKey) return null;
    return processedData.find((row) => getRowKey(row) === selectedRowKey) ?? null;
  }, [enableRowFocus, processedData, selectedRowKey]);

  const activeFocusContext = useMemo<ResultsFocusContext | null>(() => {
    if (!onFocusContextChange || !enableRowFocus) return null;

    if (selectedRow) {
      const normalizedYear = normalizeResultYear(selectedRow.year);
      if (!normalizedYear) return null;
      return {
        raceId: selectedRow.raceId,
        year: normalizedYear,
        source: 'selected-row',
      };
    }

    const firstVisibleRow = processedData[0];
    if (!firstVisibleRow) return null;
    const normalizedYear = normalizeResultYear(firstVisibleRow.year);
    if (!normalizedYear) return null;

    return {
      raceId: firstVisibleRow.raceId,
      year: normalizedYear,
      source: 'table-visible',
    };
  }, [enableRowFocus, onFocusContextChange, processedData, selectedRow]);

  useEffect(() => {
    if (!onFocusContextChange) return;
    onFocusContextChange(activeFocusContext);
  }, [activeFocusContext, onFocusContextChange]);

  const rowVirtualizer = useVirtualizer({
    count: processedData.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="rounded-lg bg-white p-4 shadow-md dark:bg-slate-900">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Filters</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters((prev) => !prev)}
                aria-expanded={showFilters}
                aria-controls="results-filter-controls"
                className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              {((showYearFilter && filters.year) || filters.name || filters.club || filters.category || sortColumn) && (
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
            <div id="results-filter-controls" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {showYearFilter && (
                <select
                  value={filters.year}
                  onChange={(e) => handleFilterChange('year', e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All Years</option>
                  {eras && eras.length > 0 && (
                    <optgroup label="Eras">
                      {eras.map((era) => (
                        <option key={`era:${era.label}`} value={`era:${era.label}`}>
                          {era.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {eras && eras.length > 0 ? (
                    <optgroup label="Years">
                      {availableYears.map((year) => (
                        <option key={year} value={year.toString()}>
                          {year}
                        </option>
                      ))}
                    </optgroup>
                  ) : (
                    availableYears.map((year) => (
                      <option key={year} value={year.toString()}>
                        {year}
                      </option>
                    ))
                  )}
                </select>
              )}
              <input
                type="text"
                placeholder="Filter by Name..."
                value={filters.name}
                onChange={(e) => handleFilterChange('name', e.target.value)}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <input
                type="text"
                placeholder="Filter by Club..."
                value={filters.club}
                onChange={(e) => handleFilterChange('club', e.target.value)}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <select
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">All Categories</option>
                {availableCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-screen overflow-y-auto" ref={scrollContainerRef}>
            <table className="w-full border-collapse bg-white dark:bg-slate-900">
              <thead>
                <tr className="sticky top-0 border-b-2 border-gray-300 bg-gray-100 dark:border-slate-700 dark:bg-slate-800">
                  {showRaceColumn && (
                    <th
                      onClick={() => handleSort('raceTitle')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Race {getSortIndicator(sortColumn === 'raceTitle' ? 'raceTitle' : null)}
                    </th>
                  )}
                  {!showRaceColumn && (
                    <th
                      onClick={() => handleSort('year')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Year {getSortIndicator(sortColumn === 'year' ? 'year' : null)}
                    </th>
                  )}
                  <th
                    onClick={() => handleSort('position')}
                    className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {filters.category === '' ? '' : "Category "}Position {getSortIndicator(sortColumn === 'position' ? 'position' : null)}
                  </th>
                  {showRaceTitle ? (
                    <th
                      onClick={() => handleSort('raceTitle')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Race {getSortIndicator(sortColumn === 'raceTitle' ? 'raceTitle' : null)}
                    </th>
                  ) : (
                    <th
                      onClick={() => handleSort('name')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Name {getSortIndicator(sortColumn === 'name' ? 'name' : null)}
                    </th>
                  )}
                  <th
                    onClick={() => handleSort('club')}
                    className="hidden cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:table-cell sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Club {getSortIndicator(sortColumn === 'club' ? 'club' : null)}
                  </th>
                  <th
                    onClick={() => handleSort('category')}
                    className="hidden cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 md:table-cell md:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Category {getSortIndicator(sortColumn === 'category' ? 'category' : null)}
                  </th>
                  <th
                    onClick={() => handleSort('time')}
                    className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Time {getSortIndicator(sortColumn === 'time' ? 'time' : null)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {processedData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-slate-400">
                      No results match your filters
                    </td>
                  </tr>
                ) : (
                  <>
                    {paddingTop > 0 && <tr><td colSpan={6} style={{ height: paddingTop }} /></tr>}
                    {virtualItems.map((virtualRow) => {
                      const row = processedData[virtualRow.index];
                      const rowKey = getRowKey(row);
                      const isSelected = enableRowFocus && selectedRowKey === rowKey;
                      const zebraTone = virtualRow.index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-950';
                      return (
                        <tr
                          key={virtualRow.key}
                          tabIndex={enableRowFocus ? 0 : -1}
                          onClick={(event) => {
                            if (!enableRowFocus) return;
                            if ((event.target as HTMLElement).closest('a')) return;
                            setSelectedRowKey(rowKey);
                          }}
                          onKeyDown={(event) => {
                            if (!enableRowFocus) return;
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            setSelectedRowKey(rowKey);
                          }}
                          className={`border-b border-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 ${
                            isSelected
                              ? 'bg-blue-100 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-950/60'
                              : `${zebraTone} hover:bg-blue-50 dark:hover:bg-slate-800`
                          }`}
                        >
                          {showRaceColumn && (
                            <td className="px-2 py-4 text-sm text-gray-800 sm:px-6 dark:text-slate-200">
                              <Link
                                href={`/races/${encodeURIComponent(row.raceId)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {races?.[row.raceId]?.title ?? row.raceId}
                              </Link>
                            </td>
                          )}
                          {!showRaceColumn && (
                            <td className="px-2 py-4 text-sm text-gray-800 sm:px-6 dark:text-slate-200">
                              <Link
                                href={`/years/${encodeURIComponent(row.year.substring(0, 4))}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {row.year}
                              </Link>
                            </td>
                          )}
                          <td className="px-2 py-4 text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">{filters.category === '' ? row.position : row.categoryPos[filters.category]}</td>
                          {showRaceTitle ? (
                            <td className="px-2 py-4 text-sm text-gray-800 sm:px-6 dark:text-slate-200">
                              <Link
                                href={`/races/${encodeURIComponent(row.raceId)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {races?.[row.raceId]?.title ?? row.raceId}
                              </Link>
                            </td>
                          ) : (
                            <td className="px-2 py-4 text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">
                              <Link
                                href={`/runner?name=${encodeURIComponent(row.name)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {row.name}
                              </Link>
                            </td>
                          )}
                          <td className="hidden px-2 py-4 text-sm text-gray-800 sm:table-cell sm:px-6 dark:text-slate-200">
                            {row.club ? (
                              clubNameToSlug[row.club] ? (
                                <Link
                                  href={`/clubs/${encodeURIComponent(clubNameToSlug[row.club])}`}
                                  className="text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  {row.club}
                                </Link>
                              ) : row.club
                            ) : null}
                          </td>
                          <td className="hidden px-2 py-4 text-sm text-gray-800 md:table-cell md:px-6 dark:text-slate-200">{row.category}</td>
                          <td className="px-2 py-4 font-mono text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">{row.time}</td>
                        </tr>
                      );
                    })}
                    {paddingBottom > 0 && <tr><td colSpan={6} style={{ height: paddingBottom }} /></tr>}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

        {/* Results Info */}
        <div className="text-sm text-gray-600 dark:text-slate-300">
          Showing {processedData.length} of {data.length} results
        </div>
      </div>
    );
  }
