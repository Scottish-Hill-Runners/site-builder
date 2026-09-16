'use client';

import { useState } from 'react';
import { UPDATES_EMAIL } from '@/lib/site-config';
import NewsItemCreateDialog from '@/components/NewsItemCreateDialog';

export default function AddNewsItemSection() {
  const [open, setOpen] = useState(false);

  if (!UPDATES_EMAIL) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
      >
        Add a news item
      </button>
      <NewsItemCreateDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
