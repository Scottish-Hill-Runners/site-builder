'use client';

import { useState } from 'react';
import { UPDATES_EMAIL } from '@/lib/site-config';
import EpicNewDialog from '@/components/EpicNewDialog';

export default function EpicNewSection() {
  const [open, setOpen] = useState(false);

  if (!UPDATES_EMAIL) return null;

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:decoration-blue-700 dark:hover:text-blue-300"
      >
        Add a new epic.
      </button>
      <EpicNewDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
