'use client';

import { useState } from 'react';
import type { ClubItem } from '@/lib/clubs';
import { UPDATES_EMAIL } from '@/lib/site-config';
import ClubInfoEditDialog from '@/components/ClubInfoEditDialog';

export default function ClubEditSection({ slug, club }: { slug: string; club: ClubItem }) {
  const [open, setOpen] = useState(false);

  if (!UPDATES_EMAIL) return null;

  return (
    <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Are you a club official?{' '}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:decoration-blue-700 dark:hover:text-blue-300"
        >
          Edit this club&apos;s information
        </button>
        .
      </p>
      <ClubInfoEditDialog open={open} onClose={() => setOpen(false)} slug={slug} club={club} />
    </div>
  );
}
