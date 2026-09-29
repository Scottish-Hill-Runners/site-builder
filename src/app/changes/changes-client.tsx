'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getRecentUpdates, updatePathToRoute, type UpdateEntry } from '@/lib/updates';

export default function ChangesClient() {
  const [updates, setUpdates] = useState<UpdateEntry[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRecentUpdates()
      .then((items) => {
        if (!cancelled) setUpdates(items);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('Recent changes could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (errorMessage)
    return <p className="text-zinc-500 dark:text-slate-400">{errorMessage}</p>;

  if (!updates)
    return <p className="text-zinc-500 dark:text-slate-400">Loading…</p>;

  if (updates.length === 0)
    return (
      <p className="text-zinc-500 dark:text-slate-400">
        No recent changes to show.
      </p>
    );

  return (
    <ul className="w-full divide-y divide-zinc-200 dark:divide-slate-800">
      {updates.map((update, index) => {
        const route = update.path ? updatePathToRoute(update.path) : undefined;
        return (
          <li key={index} className="py-4">
            <p className="text-sm text-zinc-500 dark:text-slate-400">
              {new Date(update.created_at).toLocaleDateString()} {update.status && `- ${update.status}`}
            </p>
            {route ? (
              <Link
                href={route}
                className="text-lg font-medium text-black underline dark:text-slate-50"
              >
                {update.subject}
              </Link>
            ) : (
              <p className="text-lg font-medium text-black dark:text-slate-50">
                {update.subject}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
