'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import type { OfficialColumn, OfficialStandingRow, OfficialStandings, RaceInfo } from '@/types/datatable';

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
  const [category, setCategory] = useState<string>('All');

  const showTeams = tab === 'teams' && teams.length > 0;
  const categories = Array.from(new Set(individuals.map((r) => r.category))).sort();
  const rows: OfficialStandingRow[] = showTeams
    ? teams
    : category === 'All'
      ? individuals
      : individuals.filter((r) => r.category === category);

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
        {!showTeams && categories.length > 1 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="official-category-select"
              className="text-sm font-semibold text-slate-700 dark:text-slate-200"
            >
              Category:
            </label>
            <select
              id="official-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              <option value="All">All</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow-md dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className={`${TH} text-left`}>Pos</th>
              <th className={`${TH} text-left`}>{showTeams ? 'Club' : 'Name'}</th>
              {!showTeams && <th className={`${TH} text-left`}>Club</th>}
              <th className={`${TH} text-left`}>Category</th>
              <th className={`${TH} text-right`}>Points</th>
              <th className={`${TH} hidden text-left sm:table-cell`}>Events</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {rows.map((row, idx) => (
              <tr key={`${row.position}-${row.name}-${idx}`}>
                <td className={`${TD} whitespace-nowrap`}>{row.position || idx + 1}</td>
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
    </div>
  );
}
