'use client';

import { useState } from 'react';
import { UPDATES_EMAIL } from '@/lib/site-config';
import EpicInfoEditDialog from '@/components/EpicInfoEditDialog';

export default function EpicEditSection({
  slug,
  title,
  contents,
}: {
  slug: string;
  title: string;
  contents: string;
}) {
  const [open, setOpen] = useState(false);

  if (!UPDATES_EMAIL) return null;

  return (
    <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Spot an error?{' '}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:decoration-blue-700 dark:hover:text-blue-300"
        >
          Edit this article
        </button>
        .
      </p>
      <EpicInfoEditDialog
        open={open}
        onClose={() => setOpen(false)}
        slug={slug}
        title={title}
        contents={contents}
      />
    </div>
  );
}
