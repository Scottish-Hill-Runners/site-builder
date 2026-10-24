'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Link from 'next/link';
import {
  RaceResult,
  RaceInfo,
  Era,
  ResultsFocusContext,
} from '@/types/datatable';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import raceTitle from '@/lib/race-title';

interface DataTableProps {
  data: Array<RaceResult>;
  races?: { [raceId: string]: RaceInfo };
  eras?: Era[];
  displayColumns: Set<DisplayColumn>;
  displayFilters: DisplayFilters;
  enableRowFocus?: boolean;
  onFocusContextChange?: (context: ResultsFocusContext | null) => void;
}

export type DisplayColumn =
  | 'raceTitle'
  | 'year'
  | 'position'
  | 'name'
  | 'club'
  | 'team'
  | 'leg'
  | 'category'
  | 'time'
  | 'points';
export type FilterColumn =
  | 'raceId'
  | 'year'
  | 'name'
  | 'club'
  | 'team'
  | 'leg'
  | 'category';
type SortDirection = 'asc' | 'desc';
export type DisplayFilters = Partial<Record<FilterColumn, string>>;
type YearVirtualItem =
  | { type: 'row'; data: RaceResult; dataIndex: number }
  | { type: 'year-header'; year: string; count: number };


const FILTER_VISIBILITY_STORAGE_KEY = 'raceResults.showFilters';
const MOBILE_BREAKPOINT = 640;
const FILTER_GRID_COLUMNS = [
  'lg:grid-cols-1',
  'lg:grid-cols-2',
  'lg:grid-cols-3',
  'lg:grid-cols-4',
  'lg:grid-cols-5',
  'lg:grid-cols-6',
  'lg:grid-cols-7',
] as const;

function eraContainsYear(era: Era, year: number): boolean {
  if (era.from !== undefined && year < era.from) return false;
  if (era.to !== undefined && year > era.to) return false;
  return true;
}

// A results filename like "2026-3K.csv" is stored verbatim as `year`. The part
// after the 4-digit year (if any) identifies a same-day race variant (e.g. a
// shorter junior course). Returns '' for the main/standard race.
function getYearVariant(year: string): string {
  let suffix = year.substring(4);
  if (suffix.endsWith('*')) suffix = suffix.slice(0, -1);
  if (suffix.startsWith('-')) suffix = suffix.slice(1);
  return suffix.length > 1 ? suffix : '';
}

export default function RaceResultsDataTable({
  data,
  races,
  eras,
  displayColumns,
  displayFilters,
  enableRowFocus = false,
  onFocusContextChange,
}: DataTableProps) {
  'use no memo';

  const filterCount = Object.entries(displayFilters).filter(
    ([filter, value]) =>
      filter === 'year' ? Boolean(value) : value !== undefined
  ).length;
  const filterGridColumns =
    FILTER_GRID_COLUMNS[
      Math.min(Math.max(filterCount, 1), FILTER_GRID_COLUMNS.length) - 1
    ];
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

  const [sortColumn, setSortColumn] = useState<DisplayColumn | null>(
    displayColumns.has('raceTitle') ? 'raceTitle' : 'year'
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    displayColumns.has('raceTitle') ? 'asc' : 'desc'
  );
  const [showFilters, setShowFilters] = useState(() => {
    if (typeof window === 'undefined') return true;
    const savedValue = window.localStorage.getItem(
      FILTER_VISIBILITY_STORAGE_KEY
    );
    return savedValue === 'true';
  });
  const [filters, setFilters] = useState<DisplayFilters>(displayFilters);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  // '' selects the main race; a suffix (e.g. "3K") selects that variant only.
  // Main and variant courses are never shown combined.
  const [selectedVariant, setSelectedVariant] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const lastFocusContextRef = useRef<ResultsFocusContext | null>(null);
  const [theadHeight, setTheadHeight] = useState(0);
  const [stickyHeader, setStickyHeader] = useState<{
    year: string;
    count: number;
  } | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(true);
  const [visibleLimit, setVisibleLimit] = useState(500);

  const getRowKey = (row: RaceResult) =>
    [row.raceId, row.year, row.position, row.name, row.time].join('|');

  // Persist filter panel preference for future visits.
  useEffect(() => {
    window.localStorage.setItem(
      FILTER_VISIBILITY_STORAGE_KEY,
      showFilters ? 'true' : 'false'
    );
  }, [showFilters]);

  // Distinct variant suffixes present in this race's results (e.g. "3K" for a
  // shorter same-day course). Only offered when the data also contains plain
  // main-race rows to switch back to — otherwise there's nothing to toggle,
  // and selectedVariant must not filter out races that only have suffixed
  // years (e.g. numbered legs with no plain-year file).
  const availableVariants = useMemo(() => {
    const variants = new Set<string>();
    let hasMain = false;
    for (const row of data) {
      const variant = getYearVariant(row.year);
      if (variant === '')
        hasMain = true;
      else
        variants.add(variant);
    }
    return hasMain ? Array.from(variants).sort() : [];
  }, [data]);

  useEffect(() => {
    if (selectedVariant !== '' && !availableVariants.includes(selectedVariant)) {
      setSelectedVariant('');
    }
  }, [availableVariants, selectedVariant]);

  // Filter and sort data
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply filters
    const eraLabel =
      displayColumns.has('year') && filters.year?.startsWith('era:')
        ? filters.year!.slice(4)
        : null;
    const activeEra =
      eraLabel != null ? (eras ?? []).find((e) => e.label === eraLabel) : null;
    result = result.filter((row) => {
      const raceMatch =
        !filters.raceId || raceTitle(filters.raceId, races) === raceTitle(row.raceId, races);
      const yearNum = parseInt(row.year.substring(0, 4), 10);
      const yearMatch =
        !filters.year
          ? true
          : activeEra != null
            ? eraContainsYear(activeEra, yearNum)
            : row.year.includes(filters.year ?? '');
      const variantMatch = availableVariants.length === 0 || getYearVariant(row.year) === selectedVariant;
      const nameMatch = !filters.name || row.name.toLowerCase().includes(filters.name!.toLowerCase());
      const clubMatch = !filters.club || (row.club ?? "").toLowerCase().includes(filters.club.toLowerCase());
      const teamMatch = !filters.team || (row.team ?? "").toLowerCase().includes(filters.team.toLowerCase());
      const categoryMatch = !filters.category || filters.category in row.categoryPos;
      const legsMatch = !filters.leg || filters.leg == row.leg;
      return (
        raceMatch &&
        yearMatch &&
        variantMatch &&
        nameMatch &&
        clubMatch &&
        teamMatch &&
        categoryMatch &&
        legsMatch
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
        aVal = raceTitle(a.raceId, races);
        bVal = raceTitle(b.raceId, races);
      } else if (typeof a[primaryCol] === 'number') {
        aVal = a[primaryCol] ?? 0;
        bVal = b[primaryCol] ?? 0;
      } else {
        aVal = a[primaryCol] ?? "";
        bVal = b[primaryCol] ?? "";
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        if (primaryCol === 'time') {
          if (a['year'].endsWith('*')) aVal = 'x' + aVal;
          if (b['year'].endsWith('*')) bVal = 'x' + bVal;
        }

        comparison =
          sortDirection === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        if (primaryCol === 'position' && filters.category !== '') {
          aVal = a.categoryPos[filters.category!];
          bVal = b.categoryPos[filters.category!];
        }

        comparison = sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      if (comparison === 0) {
        // Secondary sort: by position if primary sort is by year and values are equal
        if (primaryCol === 'year')
          return a.position - b.position;
        if (primaryCol === 'position' && a.leg && b.leg)
          return typeof a.leg === 'number' && typeof b.leg === 'number'
            ? a.leg - b.leg
            : String(a.leg).localeCompare(String(b.leg));
        // Secondary sort: by year if primary sort is by something else and values are equal
        return a.year.localeCompare(b.year);
      }

      return comparison;
    });

    return result;
  }, [
    data,
    filters,
    displayColumns,
    sortColumn,
    sortDirection,
    races,
    eras,
    selectedVariant,
    availableVariants,
  ]);
  const effectiveSortColumn = sortColumn ?? 'year';

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
        ? { initial: 500, step: 250, hardCap: 2500 }
        : { initial: 1000, step: 500, hardCap: 5000 },
    [isMobileViewport]
  );

  const isUnfilteredAllYearsMode =
    displayColumns.has('year') && !Object.keys(filters.year ?? {}).length;

  useEffect(() => {
    if (!isUnfilteredAllYearsMode) return;
    setVisibleLimit(capConfig.initial);
  }, [
    isUnfilteredAllYearsMode,
    capConfig.initial,
    filters,
    sortColumn,
    sortDirection,
  ]);

  const cappedMatchCount =
    isUnfilteredAllYearsMode
      ? Math.min(processedData.length, capConfig.hardCap)
      : processedData.length;
  const displayedMatchCount =
    isUnfilteredAllYearsMode
      ? Math.min(visibleLimit, cappedMatchCount)
      : processedData.length;
  const isCapActive = isUnfilteredAllYearsMode && processedData.length > displayedMatchCount;
  const canShowMore = isUnfilteredAllYearsMode && displayedMatchCount < cappedMatchCount;
  const displayData = useMemo(
    () =>
      isUnfilteredAllYearsMode && displayedMatchCount < processedData.length
        ? processedData.slice(0, displayedMatchCount)
        : processedData,
    [isUnfilteredAllYearsMode, displayedMatchCount, processedData]
  );

  const virtualItemList = useMemo((): YearVirtualItem[] => {
    if (effectiveSortColumn !== 'year') {
      return displayData.map((data, dataIndex) => ({
        type: 'row' as const,
        data,
        dataIndex,
      }));
    }
    const yearCounts: Record<string, number> = {};
    for (const row of displayData) {
      const y = row.year.substring(0, 4);
      yearCounts[y] = (yearCounts[y] ?? 0) + 1;
    }
    const items: YearVirtualItem[] = [];
    let lastYear: string | null = null;
    for (let i = 0; i < displayData.length; i++) {
      const row = displayData[i];
      const year = row.year.substring(0, 4);
      if (year !== lastYear) {
        items.push({ type: 'year-header', year, count: yearCounts[year] });
        lastYear = year;
      }
      items.push({ type: 'row', data: row, dataIndex: i });
    }
    return items;
  }, [displayData, effectiveSortColumn]);

  // Pre-compute the scroll offset of each year-header so the scroll listener
  // can determine which year is currently "behind" the sticky column header.
  // Formula: a year-header at offset `start` (with height 36) has fully scrolled
  // behind the sticky thead when scrollTop >= start + 36.
  const yearHeaderPositions = useMemo((): Array<{
    year: string;
    start: number;
    count: number;
  }> => {
    const positions: Array<{ year: string; start: number; count: number }> = [];
    let offset = 0;
    for (const item of virtualItemList) {
      if (item.type === 'year-header') {
        positions.push({ year: item.year, start: offset, count: item.count });
      }
      offset += item.type === 'year-header' ? 36 : 52;
    }
    return positions;
  }, [virtualItemList]);

  // Reset scroll position when filters/sort change
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0 });
  }, [processedData]);

  const handleSort = (column: DisplayColumn | null) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleFilterChange = (field: keyof DisplayFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };
  
  const clearFilters = () => {
    setFilters(displayFilters);
    setSelectedVariant('');
    setSortColumn(displayColumns.has('raceTitle')  ? 'raceTitle' : 'year');
    setSortDirection(displayColumns.has('raceTitle') ? 'asc' : 'desc');
  };

  const getSortIndicator = () => {
    if (sortColumn === null) return ' ⇅';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  // Get unique categories from currently filtered data (excluding category filter)
  const availableCategories = useMemo(() => {
    let result = [...data];

    // Apply all filters EXCEPT category
    const eraLabelCat =
      filters.year?.startsWith('era:')
        ? filters.year?.slice(4)
        : null;
    const activeEraCat =
      eraLabelCat != null
        ? (eras ?? []).find((e) => e.label === eraLabelCat)
        : null;
    result = result.filter((row) => {
      const yearNum = parseInt(row.year.substring(0, 4), 10);
      const yearMatch =
        !filters.year
          ? true
          : activeEraCat != null
            ? eraContainsYear(activeEraCat, yearNum)
            : row.year.includes(filters.year ?? '');
      return (
        yearMatch &&
        (!filters.raceId || row.raceId === filters.raceId) &&
        (!filters.name ||
          row.name.toLowerCase().includes(filters.name.toLowerCase())) &&
        (!filters.club ||
          (row.club ?? "").toLowerCase().includes(filters.club.toLowerCase()))
      );
    });

    // Get unique categories, sorted alphabetically
    const uniq = new Set<string>();
    result.forEach((row) => {
      Object.keys(row.categoryPos).forEach((cat) => uniq.add(cat));
    });
    return Array.from(uniq).sort();
  }, [data, filters, eras]);

  const availableRaces = useMemo(() => {
    return Array.from(new Set(data.map((row) => row.raceId)))
      .sort((a, b) => raceTitle(a, races).localeCompare(raceTitle(b, races)));
  }, [data, races]);

  const availableLegs = useMemo(() => {
    const uniq = new Set<string | number>();
    data.forEach((row) => {
      if (row.leg != null) uniq.add(row.leg);
    });
    return Array.from(uniq).sort();
  }, [data]);

  // useEffect(() => {
  //   if (filters.raceId) {
  //     setFilters((prev) => ({ ...prev, raceId: '' }));
  //     return;
  //   }

  //   const hasRace = data.some((row) => row.raceId === filters.raceId);
  //   setFilters((prev) => ({
  //     ...prev,
  //     raceId: hasRace ? filters.raceId : '',
  //   }));
  // }, [data, filters]);

  // Get unique years from data, sorted in ascending order
  const availableYears = useMemo(() => {
    const uniqueYears = Array.from(
      new Set(data.map((row) => row.year.substring(0, 4)))
    ).sort((a, b) => b.localeCompare(a));
    return uniqueYears;
  }, [data]);

  const selectedRow = useMemo(() => {
    if (!enableRowFocus || !selectedRowKey) return null;
    return displayData.find((row) => getRowKey(row) === selectedRowKey) ?? null;
  }, [displayData, enableRowFocus, selectedRowKey]);

  const activeFocusContext = useMemo<ResultsFocusContext | null>(() => {
    if (!onFocusContextChange || !enableRowFocus) return null;
    if (selectedRow)
      return {
        raceId: selectedRow.raceId,
        year: selectedRow.year,
      };

    const firstVisibleRow = displayData[0];
    if (!firstVisibleRow) return null;
    return {
      raceId: firstVisibleRow.raceId,
      year: firstVisibleRow.year,
    };
  }, [displayData, enableRowFocus, onFocusContextChange, selectedRow]);

  useEffect(() => {
    if (!onFocusContextChange) return;
    const prev = lastFocusContextRef.current;
    const next = activeFocusContext;
    const changed =
      prev?.raceId !== next?.raceId ||
      prev?.year !== next?.year;
    if (!changed) return;
    lastFocusContextRef.current = next;
    onFocusContextChange(activeFocusContext);
  }, [activeFocusContext, onFocusContextChange]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => {
      const scrollTop = el.scrollTop;
      let current: { year: string; count: number } | null = null;
      for (const { year, start, count } of yearHeaderPositions) {
        if (scrollTop >= start + 36) {
          current = { year, count };
        } else {
          break;
        }
      }
      setStickyHeader(current);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, [yearHeaderPositions]);

  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    setTheadHeight(el.offsetHeight);
    const observer = new ResizeObserver(() => {
      setTheadHeight(el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: virtualItemList.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) =>
      virtualItemList[index].type === 'year-header' ? 36 : 52,
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
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
              Filters
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters((prev) => !prev)}
                aria-expanded={showFilters}
                aria-controls="results-filter-controls"
                className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              {(Object.values(filters).some(Boolean) ||
                selectedVariant !== '' ||
                sortColumn) && (
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
              id="results-filter-controls"
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${filterGridColumns}`}
            >
              {displayFilters.year && (
                <select
                  value={filters.year}
                  onChange={(e) => handleFilterChange('year', e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All Years</option>
                  {eras && eras.length > 0 ? (
                    <>
                      <optgroup label="Eras">
                        {eras.map((era) => (
                          <option
                            key={`era:${era.label}`}
                            value={`era:${era.label}`}
                          >
                            {era.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Years">
                        {availableYears.map((year) => (
                          <option key={year} value={year.toString()}>
                            {year}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  ) : (
                    availableYears.map((year) => (
                      <option key={year} value={year.toString()}>
                        {year}
                      </option>
                    ))
                  )}
                </select>
              )}
              {availableVariants.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
                    Course:
                  </span>
                  {['', ...availableVariants].map((variant) => {
                    const selected = selectedVariant === variant;
                    return (
                      <button
                        key={variant || 'main'}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedVariant(variant)}
                        title={
                          variant === ''
                            ? 'Show the main race results'
                            : `Show only the "${variant}" variant results`
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'border-gray-300 bg-white text-gray-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400'
                        }`}
                      >
                        {variant === '' ? 'Main' : variant}
                      </button>
                    );
                  })}
                </div>
              )}
              {displayFilters.raceId !== undefined && (
                <select
                  value={filters.raceId}
                  onChange={(e) => handleFilterChange('raceId', e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All Races</option>
                  {availableRaces.map(raceId => (
                    <option key={raceId} value={raceId}>
                      {raceTitle(raceId, races)}
                    </option>
                  ))}
                </select>
              )}
              {displayFilters.name !== undefined && (
                <input
                  type="text"
                  placeholder="Filter by Name..."
                  value={filters.name}
                  onChange={(e) => handleFilterChange('name', e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              )}
              {displayFilters.club !== undefined && (
                <input
                  type="text"
                  placeholder="Filter by Club..."
                  value={filters.club}
                  onChange={(e) => handleFilterChange('club', e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              )}
              {displayFilters.team !== undefined && (
                <input
                  type="text"
                  placeholder="Filter by Team..."
                  value={filters.team}
                  onChange={(e) => handleFilterChange('team', e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              )}
              {displayFilters.leg !== undefined && (
                <select
                  value={filters.leg}
                  onChange={(e) => handleFilterChange('leg', e.target.value)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All Legs</option>
                  {availableLegs.map((leg) => (
                    <option key={leg} value={leg}>
                      Leg {leg}
                    </option>
                  ))}
                </select>
              )}
              {displayFilters.category !== undefined && (
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
              )}
            </div>
          )}
        </div>
      </div>

      {isCapActive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p>
            Showing {displayedMatchCount.toLocaleString()} of {processedData.length.toLocaleString()} matching results.
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
            {!canShowMore && processedData.length > capConfig.hardCap && (
              <span className="text-xs text-amber-800 dark:text-amber-300">
                Refine filters to see beyond {capConfig.hardCap.toLocaleString()} rows.
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
            {stickyHeader !== null && (
              <div
                style={{
                  position: 'sticky',
                  top: theadHeight,
                  height: 36,
                  marginBottom: -36,
                  zIndex: 15,
                  pointerEvents: 'none',
                }}
                className="flex items-center border-b-2 border-gray-300 bg-gray-100 px-2 sm:px-6 dark:border-slate-700 dark:bg-slate-800"
                aria-hidden
              >
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                  {stickyHeader.year}
                </span>
                <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">
                  — {stickyHeader.count} result
                  {stickyHeader.count !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            <table className="w-full border-collapse bg-white dark:bg-slate-900">
              <thead ref={theadRef}>
                <tr className="sticky top-0 border-b-2 border-gray-300 bg-gray-100 dark:border-slate-700 dark:bg-slate-800">
                  {(displayColumns.has('raceTitle')) && (
                    <th
                      onClick={() => handleSort('raceTitle')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Race {getSortIndicator()}
                    </th>
                  )}
                  {displayColumns.has('year') && (
                    <th
                      onClick={() => handleSort('year')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Year {getSortIndicator()}
                    </th>
                  )}
                  {displayColumns.has('position') && (
                    <th
                      onClick={() => handleSort('position')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {filters.category ? 'Category ' : ''}Position {getSortIndicator()}
                    </th>
                  )}
                  {displayColumns.has('name') && (
                    <th
                      onClick={() => handleSort('name')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Name {getSortIndicator()}
                    </th>
                  )}
                  {displayColumns.has('club') && (
                    <th
                      onClick={() => handleSort('club')}
                      className="hidden cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:table-cell sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Club {getSortIndicator()}
                    </th>
                  )}
                  {displayColumns.has('team') && (
                    <th
                      onClick={() => handleSort('team')}
                      className="hidden cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:table-cell sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Team {getSortIndicator()}
                    </th>
                  )}
                  {displayColumns.has('leg') && (
                    <th
                      onClick={() => handleSort('leg')}
                      className="hidden cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:table-cell sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Leg {getSortIndicator()}
                    </th>
                    )}
                  {displayColumns.has('category') && (
                    <th
                      onClick={() => handleSort('category')}
                      className="hidden cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 md:table-cell md:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Category {getSortIndicator()}
                    </th>
                  )}
                  {displayColumns.has('time') && (
                    <th
                      onClick={() => handleSort('time')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Time {getSortIndicator()}
                    </th>
                  )}
                  {displayColumns.has('points') && (
                    <th
                      onClick={() => handleSort('points')}
                      className="cursor-pointer px-2 py-3 text-left text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 sm:px-6 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Points {getSortIndicator()}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayData.length === 0 ? (
                  <tr>
                    <td
                      colSpan={displayColumns.size}
                      className="px-6 py-4 text-center text-sm text-gray-500 dark:text-slate-400"
                    >
                      No results match your filters
                    </td>
                  </tr>
                ) : (
                  <>
                    {paddingTop > 0 && (
                      <tr>
                        <td
                          colSpan={displayColumns.size}
                          style={{ height: paddingTop }}
                        />
                      </tr>
                    )}
                    {virtualItems.map((virtualRow) => {
                      const item = virtualItemList[virtualRow.index];
                      if (item.type === 'year-header') {
                        return (
                          <tr
                            key={virtualRow.key}
                            className="border-b-2 border-gray-300 bg-gray-100 dark:border-slate-700 dark:bg-slate-800"
                          >
                            <td
                              colSpan={displayColumns.size}
                              className="px-2 py-2 sm:px-6"
                            >
                              <span className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-slate-300">
                                {item.year}
                              </span>
                              <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">
                                — {item.count} result{item.count !== 1 ? 's' : ''}
                              </span>
                            </td>
                          </tr>
                        );
                      }
                      const row = item.data;
                      const rowKey = getRowKey(row);
                      const isSelected =
                        enableRowFocus && selectedRowKey === rowKey;
                      const zebraTone =
                        item.dataIndex % 2 === 0
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-gray-50 dark:bg-slate-950';
                      return (
                        <tr
                          key={virtualRow.key}
                          tabIndex={enableRowFocus ? 0 : -1}
                          onClick={(event) => {
                            if (!enableRowFocus) return;
                            if ((event.target as HTMLElement).closest('a'))
                              return;
                            setSelectedRowKey(rowKey);
                          }}
                          onKeyDown={(event) => {
                            if (!enableRowFocus) return;
                            if (event.key !== 'Enter' && event.key !== ' ')
                              return;
                            event.preventDefault();
                            setSelectedRowKey(rowKey);
                          }}
                          className={`border-b border-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 ${
                            isSelected
                              ? 'bg-blue-100 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-950/60'
                              : `${zebraTone} hover:bg-blue-50 dark:hover:bg-slate-800`
                          }`}
                        >
                          {displayColumns.has('raceTitle') && (
                            <td className="px-2 py-4 text-sm text-gray-800 sm:px-6 dark:text-slate-200">
                              <Link
                                href={`/races/${encodeURIComponent(row.raceId)}?year=${encodeURIComponent(row.year)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {raceTitle(row.raceId, races)}
                                {races?.[row.raceId]?.hasLegs && row.leg !== undefined && ` (Leg ${row.leg})`}
                              </Link>
                            </td>
                          )}
                          {displayColumns.has('year') && (
                            <td className="px-2 py-4 text-sm text-gray-800 sm:px-6 dark:text-slate-200">
                              <Link
                                href={`/years/${encodeURIComponent(row.year.substring(0, 4))}?race=${encodeURIComponent(row.raceId)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {row.year}
                                {races?.[row.raceId]?.hasLegs && row.leg !== undefined && ` (Leg ${row.leg})`}
                              </Link>
                            </td>
                          )}
                          {displayColumns.has('position') && (
                            <td className="px-2 py-4 text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">
                              {!filters.category
                                ? row.position
                                : row.categoryPos[filters.category]}
                            </td>
                          )}
                          {displayColumns.has('name') && (
                            <td className="px-2 py-4 text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">
                              <Link
                                href={`/runner?name=${encodeURIComponent(row.name)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {row.name}
                              </Link>
                            </td>
                          )}
                          {displayColumns.has('club') && (
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
                          )}
                          {displayColumns.has('team') && (
                            <td className="hidden px-2 py-4 text-sm text-gray-800 md:table-cell md:px-6 dark:text-slate-200">
                              {row.team}
                            </td>
                          )}
                          {displayColumns.has('leg') && (
                            <td className="hidden px-2 py-4 text-sm text-gray-800 md:table-cell md:px-6 dark:text-slate-200">
                              {row.leg}
                            </td>
                          )}
                          {displayColumns.has('category') && (
                            <td className="hidden px-2 py-4 text-sm text-gray-800 md:table-cell md:px-6 dark:text-slate-200">
                              {row.category}
                            </td>
                          )}
                          {displayColumns.has('time') && (
                            <td className="px-2 py-4 font-mono text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">
                              {row.time}
                            </td>
                          )}
                          {displayColumns.has('points') && (
                            <td className="px-2 py-4 font-mono text-sm font-semibold text-gray-800 sm:px-6 dark:text-slate-200">
                              {(filters.category == 'All'
                                ? row.points
                                : filters.category ? row.categoryPoints?.[filters.category] : '-') ?? '-'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {paddingBottom > 0 && (
                      <tr>
                        <td
                          colSpan={displayColumns.size}
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
          ? `Showing ${displayedMatchCount.toLocaleString()} of ${processedData.length.toLocaleString()} matching results (${data.length.toLocaleString()} total).`
          : `Showing ${displayData.length.toLocaleString()} of ${data.length.toLocaleString()} results`}
      </div>
    </div>
  );
}
