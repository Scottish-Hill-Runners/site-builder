'use client';

import { useEffect, useState } from 'react';
import {
  clearSavedEmails,
  deleteSavedEmail,
  getSavedEmails,
  type SavedEmail,
} from '@/lib/saved-emails';
import { copyToClipboard } from '@/lib/clipboard';

export default function SavedDraftsClient() {
  const [drafts, setDrafts] = useState<SavedEmail[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setDrafts(getSavedEmails());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!drafts || drafts.length === 0) return null;

  async function handleCopy(draft: SavedEmail) {
    const text = `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedId(draft.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  function handleDelete(id: string) {
    deleteSavedEmail(id);
    setDrafts(getSavedEmails());
  }

  function handleClearAll() {
    clearSavedEmails();
    setDrafts(getSavedEmails());
  }

  return (
    <div className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-black dark:text-slate-50">
            Saved email drafts
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-slate-400">
            Copies of emails you&apos;ve started sending from this device, saved here in case your
            mail app didn&apos;t open correctly. These only exist in this browser.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          className="shrink-0 text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Clear all
        </button>
      </div>

      <ul className="mt-4 w-full divide-y divide-zinc-200 dark:divide-slate-800">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm text-zinc-500 dark:text-slate-400">
                {new Date(draft.createdAt).toLocaleString()}
              </p>
              <p className="font-medium text-black dark:text-slate-50">{draft.subject}</p>
            </div>
            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => handleCopy(draft)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {copiedId === draft.id ? 'Copied!' : 'Copy email text'}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(draft.id)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
