'use client';

import { useState, useMemo } from 'react';
import NewsList from '@/components/NewsList';

interface NewsItem {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
}

interface NewsFilterProps {
  items: NewsItem[];
}

function currentYearRange() {
  const year = new Date().getFullYear();
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

export default function NewsFilter({ items }: NewsFilterProps) {
  const defaults = currentYearRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const fromMs = from ? new Date(from).getTime() : -Infinity;
    const toMs = to ? new Date(to).getTime() + 86_400_000 - 1 : Infinity; // inclusive of end date
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const t = new Date(item.date).getTime();
      if (t < fromMs || t > toMs) return false;
      if (
        needle &&
        !item.title.toLowerCase().includes(needle) &&
        !item.excerpt.toLowerCase().includes(needle) &&
        !item.content.toLowerCase().includes(needle)
      )
        return false;
      return true;
    });
  }, [items, from, to, query]);

  function reset() {
    setFrom(defaults.from);
    setTo(defaults.to);
    setQuery('');
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="news-search"
            className="text-sm font-medium text-gray-700 dark:text-slate-300"
          >
            Search
          </label>
          <input
            id="news-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, excerpt or content…"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <fieldset className="flex flex-wrap items-end gap-4">
          <legend className="sr-only">Date range</legend>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="news-from"
              className="text-sm font-medium text-gray-700 dark:text-slate-300"
            >
              From
            </label>
            <input
              id="news-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="news-to"
              className="text-sm font-medium text-gray-700 dark:text-slate-300"
            >
              To
            </label>
            <input
              id="news-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Reset
          </button>
          <p className="self-end pb-1.5 text-sm text-gray-500 dark:text-slate-400">
            {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
          </p>
        </fieldset>
      </div>

      <NewsList items={filtered} />
    </div>
  );
}
