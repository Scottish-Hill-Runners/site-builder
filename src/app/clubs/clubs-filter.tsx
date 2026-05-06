'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ClubItem } from '@/lib/clubs';
import { stripMarkdown, highlightMatch } from '@/lib/search-highlight';

interface ClubsFilterProps {
  items: ClubItem[];
}

export default function ClubsFilter({ items }: ClubsFilterProps) {
  const [query, setQuery] = useState('');

  const trimmed = query.trim();

  const filtered = trimmed
    ? items.filter((club) => {
        const q = trimmed.toLowerCase();
        if (club.name.toLowerCase().includes(q)) return true;
        return stripMarkdown(club.content).toLowerCase().includes(q);
      })
    : items;

  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor="club-search" className="sr-only">
          Search clubs
        </label>
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <svg
            aria-hidden="true"
            className="h-4 w-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
        </div>
        <input
          id="club-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clubs…"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
        />
      </div>

      {trimmed && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {filtered.length === 0
            ? 'No matches'
            : `${filtered.length} of ${items.length}`}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No clubs match your search.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((club) => (
            <li
              key={club.slug}
              className={club.active === false ? 'opacity-50' : undefined}
            >
              <Link
                href={`/clubs/${club.slug}`}
                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                {highlightMatch(club.name, trimmed)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
