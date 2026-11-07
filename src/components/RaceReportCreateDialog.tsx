'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { sendMailto } from '@/lib/navigate-to-mailto';
import { createRaceReportEmail, raceReportSubmissionError } from '@/lib/race-report-submission';
import { UPDATES_EMAIL } from '@/lib/site-config';

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

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300';

export default function RaceReportCreateDialog({
  open,
  onClose,
  raceId,
  raceTitle,
}: {
  open: boolean;
  onClose: () => void;
  raceId: string;
  raceTitle: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [year, setYear] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setYear(String(new Date().getFullYear()));
      setTitle('');
      setAuthor('');
      setExcerpt('');
      setBody('');
      setError(null);
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!UPDATES_EMAIL) return;
    const report = { raceId, raceTitle, year, title, author, excerpt, body };
    const validationError = raceReportSubmissionError(report);
    if (validationError) {
      setError(validationError);
      return;
    }
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = createRaceReportEmail(report, suffix);
    sendMailto({ to: UPDATES_EMAIL, ...email });
    onClose();
  }

  if (!UPDATES_EMAIL) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="race-report-dialog-title"
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
      className="m-auto w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-900"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
        <h2 id="race-report-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          Add a race report
        </h2>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Share a report for {raceTitle}. Send it by email for review before publication.
        </p>
        <div>
          <label className={labelClass} htmlFor="report-year">Race year</label>
          <input id="report-year" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4}
            value={year} onChange={(event) => setYear(event.target.value)} className={inputClass} required />
        </div>
        <div>
          <label className={labelClass} htmlFor="report-title">Title (optional)</label>
          <input id="report-title" type="text" value={title}
            onChange={(event) => setTitle(event.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="report-author">Author (optional)</label>
          <input id="report-author" type="text" value={author}
            onChange={(event) => setAuthor(event.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="report-excerpt">Excerpt (optional)</label>
          <input id="report-excerpt" type="text" value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)} className={inputClass}
            placeholder="A short summary shown in the reports list" />
        </div>
        <div role="group" aria-labelledby="report-body-label">
          <span id="report-body-label" className={labelClass}>Report</span>
          {open && <MdxEditorClient markdown={body} onChange={setBody} placeholder="Write the race report..." />}
        </div>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button type="submit" disabled={!body.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-400">
            Send by email
          </button>
        </div>
      </form>
    </dialog>
  );
}
