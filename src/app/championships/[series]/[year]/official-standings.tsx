'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import type { OfficialColumn, OfficialStandingRow, OfficialStandings, RaceInfo } from '@/types/datatable';

type SortKey = 'pos' | 'name' | 'club' | 'points';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

const INPUT =
  'rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

interface OfficialStandingsViewProps {
  standings: OfficialStandings;
  raceMetadata: Record<string, RaceInfo>;
  clubSlugs: Record<string, string>;
  year: string;
}

const TAB_BASE = 'rounded-md px-4 py-2 text-sm font-semibold';
const TAB_ACTIVE = `${TAB_BASE} bg-blue-600 text-white`;
const TAB_INACTIVE = `${TAB_BASE} text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800`;
const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300';
const TD = 'px-4 py-3 text-sm text-slate-700 dark:text-slate-200';

/** Final standings exactly as published; nothing is recomputed. */
export default function OfficialStandingsView({
  standings,
  raceMetadata,
  clubSlugs,
  year,
}: OfficialStandingsViewProps) {
  const { columns, individuals, teams } = standings;
  const [tab, setTab] = useState<'individuals' | 'teams'>('individuals');
  const [category, setCategory] = useState<string>('F');
  const [teamCategory, setTeamCategory] = useState<string>('F');
  const [nameFilter, setNameFilter] = useState('');
  const [clubFilter, setClubFilter] = useState('');
  const [sort, setSort] = useState<SortState>(null);

  const showTeams = tab === 'teams' && teams.length > 0;
  const categories = Array.from(
    new Set((showTeams ? teams : individuals).map((r) => r.category))
  ).sort();
  const activeCategory = showTeams
    ? categories.includes(teamCategory) ? teamCategory : (categories[0] ?? '')
    : category;
  const baseRows: OfficialStandingRow[] = showTeams
    ? teams.filter((r) => r.category === activeCategory)
    : individuals.filter((r) => r.category === category);

  const nameNeedle = nameFilter.trim().toLowerCase();
  const clubNeedle = clubFilter.trim().toLowerCase();
  const rows = baseRows.filter(
    (r) =>
      (showTeams || !nameNeedle || r.name.toLowerCase().includes(nameNeedle)) &&
      (showTeams || !clubNeedle || r.club.toLowerCase().includes(clubNeedle))
  );

  const sortRows = (list: OfficialStandingRow[]) => {
    if (!sort) return list;
    const sign = sort.dir === 'asc' ? 1 : -1;
    const text = (r: OfficialStandingRow) =>
      (sort.key === 'name' && !showTeams ? r.name : sort.key === 'club' && !showTeams ? r.club : r.name);
    return [...list].sort((a, b) => {
      if (sort.key === 'pos' || sort.key === 'points') {
        const va = sort.key === 'pos' ? parseInt(a.position, 10) : a.total;
        const vb = sort.key === 'pos' ? parseInt(b.position, 10) : b.total;
        const na = va === null || Number.isNaN(va) ? null : va;
        const nb = vb === null || Number.isNaN(vb) ? null : vb;
        if (na === nb) return 0;
        if (na === null) return 1;
        if (nb === null) return -1;
        return sign * (na - nb);
      }
      return sign * text(a).localeCompare(text(b));
    });
  };

  const qualified = sortRows(rows.filter((r) => r.position));
  const unqualified = sortRows(rows.filter((r) => !r.position));

  const toggleSort = (key: SortKey) =>
    setSort((cur) =>
      cur?.key !== key
        ? { key, dir: key === 'points' ? 'desc' : 'asc' }
        : cur.dir === 'asc'
          ? { key, dir: 'desc' }
          : null
    );

  const sortHeader = (key: SortKey, label: string, align: 'left' | 'right') => {
    const active = sort?.key === key;
    return (
      <th
        className={`${TH} text-${align}`}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" onClick={() => toggleSort(key)} className="uppercase hover:underline">
          {label}
          {active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
        </button>
      </th>
    );
  };

  const clubCell = (club: string) =>
    clubSlugs[club] ? (
      <Link
        href={`/clubs/${encodeURIComponent(clubSlugs[club])}`}
        className="text-blue-600 hover:underline dark:text-blue-400"
      >
        {club}
      </Link>
    ) : (
      club
    );

  const renderEvents = (row: OfficialStandingRow) => {
    const events = columns
      .map((column, i) => ({ column, points: row.points[i] }))
      .filter((e): e is { column: OfficialColumn; points: number } => e.points !== null)
      .sort((a, b) => b.points - a.points);
    return events.map(({ column, points }, i) => {
      const title = column.kind === 'race' ? raceMetadata[column.id]?.title : undefined;
      return (
        <Fragment key={column.id}>
          {i > 0 ? ', ' : ''}
          {title ? (
            <Link
              href={`/races/${encodeURIComponent(column.id)}?year=${encodeURIComponent(year)}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {title}
            </Link>
          ) : (
            column.id
          )}
          {`: ${points}`}
        </Fragment>
      );
    });
  };

  const renderTable = (tableRows: OfficialStandingRow[], showPos: boolean) => (
    <div className="overflow-x-auto rounded-lg bg-white shadow-md dark:bg-slate-900">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead className="bg-slate-100 dark:bg-slate-800">
          <tr>
            {showPos && sortHeader('pos', 'Pos', 'left')}
            {showTeams ? sortHeader('club', 'Club', 'left') : sortHeader('name', 'Name', 'left')}
            {!showTeams && sortHeader('club', 'Club', 'left')}
            <th className={`${TH} text-left`}>Category</th>
            {sortHeader('points', 'Points', 'right')}
            <th className={`${TH} hidden text-left sm:table-cell`}>Events</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {tableRows.map((row, idx) => (
            <tr key={`${row.position}-${row.name}-${idx}`}>
              {showPos && <td className={`${TD} whitespace-nowrap`}>{row.position}</td>}
              <td className={TD}>
                {showTeams ? (
                  clubCell(row.name)
                ) : (
                  <Link
                    href={`/runner?name=${encodeURIComponent(row.name)}`}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {row.name}
                  </Link>
                )}
              </td>
              {!showTeams && <td className={TD}>{clubCell(row.club)}</td>}
              <td className={TD}>{row.category}</td>
              <td className={`${TD} whitespace-nowrap text-right font-semibold`}>
                {row.total ?? ''}
              </td>
              <td className={`${TD} hidden sm:table-cell`}>{renderEvents(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        {teams.length > 0 && (
          <div
            className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            role="tablist"
            aria-label="Championship view selector"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!showTeams}
              onClick={() => setTab('individuals')}
              className={!showTeams ? TAB_ACTIVE : TAB_INACTIVE}
            >
              Individual
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showTeams}
              onClick={() => setTab('teams')}
              className={showTeams ? TAB_ACTIVE : TAB_INACTIVE}
            >
              Teams
            </button>
          </div>
        )}
        {categories.length > 1 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="official-category-select"
              className="text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Category:
            </label>
            <select
              id="official-category-select"
              value={activeCategory}
              onChange={(e) =>
                showTeams ? setTeamCategory(e.target.value) : setCategory(e.target.value)
              }
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}
        {!showTeams && (
          <input
            type="search"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Filter by name"
            aria-label="Filter by name"
            className={INPUT}
          />
        )}
        {!showTeams && (
          <input
            type="search"
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
            placeholder="Filter by club"
            aria-label="Filter by club"
            className={INPUT}
          />
        )}
      </div>

      {renderTable(qualified, true)}

      {unqualified.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {showTeams ? 'Unqualified Teams' : 'Unqualified Runners'}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Below the minimum requirement
          </p>
          {renderTable(unqualified, false)}
        </div>
      )}
    </div>
  );
}
