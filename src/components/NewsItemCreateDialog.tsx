'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import YAML from 'yaml';
import { UPDATES_EMAIL } from '@/lib/site-config';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';
import { firstSentence } from '@/lib/news-excerpt';

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

export interface NewsItemCreateDialogProps {
  open: boolean;
  onClose: () => void;
}

// Defined outside the component so the React Compiler doesn't treat this
// navigation as a render-time mutation.
function navigateToMailto(url: string) {
  window.location.href = url;
}

function pad(value: number, length: number) {
  return String(value).padStart(length, '0');
}

function todayIsoDate(now: Date) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

function secondsSinceMidnight(now: Date) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - startOfDay.getTime()) / 1000);
}

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300';

export default function NewsItemCreateDialog({ open, onClose }: NewsItemCreateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
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
      setExcerpt('');
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

  const canSubmit = title.trim() !== '' && (excerpt.trim() !== '' || body.trim() !== '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!UPDATES_EMAIL || !canSubmit) return;

    const now = new Date();
    const isoDate = todayIsoDate(now);
    const year = now.getFullYear();
    const path = `news/${year}/${isoDate}-${secondsSinceMidnight(now)}.md`;

    const finalExcerpt = excerpt.trim() || firstSentence(body);

    const frontmatterBlock = YAML.stringify({
      title: title.trim(),
      excerpt: finalExcerpt,
      date: isoDate,
    }).trimEnd();

    const subject = `New news item: ${title.trim()}`;
    const emailBody =
      `To ${toWhomItMayConcern()}:\n\n` +
      `I would like to add the following news item.\n\n` +
      `!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE\n` +
      `File: ${path}\n` +
      `---\n${frontmatterBlock}\n---\n` +
      (body.trim() ? `${body.trim()}\n` : '') +
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
          Add a news item
        </h2>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Fill in the details below, then send us the new item by email for
          review. It will be dated today.
        </p>

        <div>
          <label className={labelClass} htmlFor="nc-title">
            Title
          </label>
          <input
            id="nc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="nc-excerpt">
            Excerpt
          </label>
          <input
            id="nc-excerpt"
            type="text"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            className={inputClass}
            placeholder="A short summary shown in the news list (defaults to the story's first sentence)"
          />
        </div>

        <div>
          <label className={labelClass}>Story</label>
          <MdxEditorClient
            markdown={body}
            onChange={setBody}
            placeholder="Write the news story..."
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
