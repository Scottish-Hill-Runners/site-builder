'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { UPDATES_EMAIL } from '@/lib/site-config';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';
import { slugify } from '@/lib/slugify';

const MdxEditorClient = dynamic(
  () => import('@/components/mdx-editor-client').then((mod) => mod.MdxEditorClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[14rem] items-center justify-center rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
        Loading editor...
      </div>
    ),
  }
);

export interface EpicNewDialogProps {
  open: boolean;
  onClose: () => void;
}

// Defined outside the component so the React Compiler doesn't treat this
// navigation as a render-time mutation.
function navigateToMailto(url: string) {
  window.location.href = url;
}

const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300';

export default function EpicNewDialog({ open, onClose }: EpicNewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // Open / close the native dialog imperatively so the backdrop renders correctly.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Reset form each time the dialog opens; adjusting state during render
  // (rather than in an effect) avoids an extra render pass.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTitle('');
      setBody('');
    }
  }

  // Sync native Escape-key close with React state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  // Close when clicking the backdrop (outside the form).
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  const slug = slugify(title);
  const canSubmit = title.trim() !== '' && slug !== '' && body.trim() !== '';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!UPDATES_EMAIL || !canSubmit) return;

    const subject = `New epic: ${title.trim()}`;
    // Epics have no frontmatter, so the section carries the new content only.
    const emailBody =
      `To ${toWhomItMayConcern()}:\n\n` +
      `I would like to add a new epic.\n\n` +
      `!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE\n` +
      `File: long-distance/${slug}.md\n` +
      `---\n` +
      `title: ${title.trim()}\n` +
      `---\n` +
      `${body.trim()}\n` +
      `!-- END OF SENSITIVE SECTION\n`;

    navigateToMailto(
      `mailto:${UPDATES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`
    );
    onClose();
  }

  if (!UPDATES_EMAIL) return null;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-900"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          New article
        </h2>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Write the article below, then send it to us by email for review.
        </p>

        <div>
          <label htmlFor="epic-new-title" className={labelClass}>
            Title
          </label>
          <input
            id="epic-new-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          {slug && (
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              URL: /epics/{slug}
            </p>
          )}
        </div>

        <div>
          <label className={labelClass}>Article text</label>
          <MdxEditorClient
            markdown={body}
            onChange={setBody}
            placeholder="Write the article..."
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          >
            Send by email
          </button>
        </div>
      </form>
    </dialog>
  );
}
