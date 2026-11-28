'use client';

import { useEffect, useState } from 'react';
import { RaceInfoDialog } from '@/components/RaceInfoEditDialog';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import { UPDATES_EMAIL } from '@/lib/site-config';

export function RaceInfoCreateLink() {
  const [open, setOpen] = useState(false);

  if (!UPDATES_EMAIL) return null;

  return (
    <>
      <div className="mb-6 text-sm text-gray-600 dark:text-slate-300">
        Organising a new race?{' '}
        <button type="button" onClick={() => setOpen(true)}
          className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200">
          Add a race
        </button>
      </div>
      {open && <RaceInfoCreateDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export default function RaceInfoCreateDialog({ onClose }: { onClose: () => void }) {
  const [existingIds, setExistingIds] = useState<string[] | null>(null);
  const [idsLoading, setIdsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchGzipJson<unknown>('/race-ids.json.gz').then((result) => {
      if (cancelled) return;
      if (result.status === 'ok' && Array.isArray(result.data) &&
          result.data.every((id) => typeof id === 'string')) {
        setExistingIds(result.data);
      } else {
        console.error('Failed to load existing race IDs:', result);
      }
      setIdsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return <RaceInfoDialog mode="create" open onClose={onClose} existingIds={existingIds} idsLoading={idsLoading} />;
}
