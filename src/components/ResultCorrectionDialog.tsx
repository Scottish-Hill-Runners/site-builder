'use client';

import { useEffect, useRef, useState } from 'react';
import type { RaceResult } from '@/types/datatable';
import { CORRECTIONS_EMAIL } from '@/lib/site-config';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';

export interface ResultCorrectionDialogProps {
  open: boolean;
  onClose: () => void;
  raceId: string;
  raceTitle: string;
  year: string;
  /** Pre-filtered to the relevant race + year by the caller. Used for position lookup. */
  results: RaceResult[];
  /** If a specific row is already selected, seed the form from it. */
  initialResult?: RaceResult | null;
}

interface FormState {
  position: string;
  originalName: string;
  originalCategory: string;
  originalClub: string;
  updatedName: string;
  updatedCategory: string;
  updatedClub: string;
  comments: string;
  someChangeMade: boolean;
}


const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300';

export default function ResultCorrectionDialog({
  open,
  onClose,
  raceId,
  raceTitle,
  year,
  results,
  initialResult,
}: ResultCorrectionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open / close the native dialog imperatively so the backdrop renders correctly.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

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

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-full max-w-lg rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-900"
    >
      <ResultCorrectionForm
        key={`${raceId}:${year}:${initialResult?.position ?? 'none'}:${initialResult?.name ?? ''}:${initialResult?.category ?? ''}:${initialResult?.club ?? ''}`}
        raceId={raceId}
        raceTitle={raceTitle}
        year={year}
        results={results}
        initialResult={initialResult}
        onClose={onClose}
      />
    </dialog>
  );
}

function ResultCorrectionForm({
  raceId,
  raceTitle,
  year,
  results,
  initialResult,
  onClose,
}: {
  raceId: string;
  raceTitle: string;
  year: string;
  results: RaceResult[];
  initialResult?: RaceResult | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    position: initialResult ? String(initialResult.position) : '',
    originalName: initialResult?.name ?? '',
    originalCategory: initialResult?.category ?? '',
    originalClub: initialResult?.club ?? '',
    updatedName: initialResult?.name ?? '',
    updatedCategory: initialResult?.category ?? '',
    updatedClub: initialResult?.club ?? '',
    comments: '',
    someChangeMade: false,
  });

  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);

  function handlePositionChange(value: string) {
    setForm((prev) => ({ ...prev, position: value }));
    const posNum = parseInt(value, 10);
    if (!Number.isNaN(posNum) && posNum > 0) {
      const match = results.find((r) => r.position === posNum);
      if (match) {
        setForm((prev) => ({
          ...prev,
          position: value,
          originalName: match.name,
          originalCategory: match.category,
          originalClub: match.club,
          updatedName: match.name,
          updatedCategory: match.category,
          updatedClub: match.club,
        }));
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!CORRECTIONS_EMAIL) return;

    const subject = `Results submission for ${raceTitle} (${raceId}) ${year}`;
    const body =
      `To ${toWhomItMayConcern()}:\n\n` +
      `I believe the result below is incorrect and should be corrected as indicated.\n\n` +
      `!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE!\n` +
      `File: races/${raceId}/${year}.csv\n` +
      `Position: ${form.position}\n` +
      `Name: ${form.originalName}\n` +
      `Category: ${form.originalCategory}\n` +
      `Club: ${form.originalClub}\n` +
      (form.originalName !== form.updatedName ? `Change Name to: ${form.updatedName}\n` : '') +
      (form.originalCategory !== form.updatedCategory ? `Change Category to: ${form.updatedCategory}\n` : '') +
      (form.originalClub !== form.updatedClub ? `Change Club to: ${form.updatedClub}\n` : '') +
      `!-- END OF SENSITIVE SECTION\n\n` +
      `${form.comments}\n`;

    window.location.href = `mailto:${CORRECTIONS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    onClose();
  }


  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Submit a correction
      </h2>
      <p className="text-sm text-gray-600 dark:text-slate-300">
        Enter the position of the result to correct — the runner&apos;s details
        will be looked up automatically. Edit any incorrect fields,
        then (optionally) add some comments.
      </p>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/60">
        <div className="font-medium text-gray-900 dark:text-white">{raceTitle} {year}</div>
        <div className="text-gray-600 dark:text-slate-300">Race ID: {raceId}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-1">
          <label className={labelClass} htmlFor="cd-position">
            Position
          </label>
          <input
            id="cd-position"
            type="number"
            min={1}
            value={form.position}
            onChange={(e) => handlePositionChange(e.target.value)}
            className={inputClass}
            placeholder="e.g. 42"
          />
        </div>

        <div className="col-span-2">
          <label className={labelClass} htmlFor="cd-name">
            Runner name
          </label>
          <input
            id="cd-name"
            type="text"
            value={form.updatedName ?? form.originalName}
            onChange={(e) => setForm((prev) => ({ ...prev, updatedName: e.target.value }))}
            className={inputClass}
            placeholder="Auto-filled from position"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="cd-category">
            Category
          </label>
          <input
            id="cd-category"
            value={form.updatedCategory ?? form.originalCategory}
            onChange={(e) => setForm((prev) => ({ ...prev, updatedCategory: e.target.value }))}
            type="text"
            className={inputClass}
            placeholder="e.g. M65"
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="cd-club">
            Club
          </label>
          <input
            id="cd-club"
            type="text"
            value={form.updatedClub ?? form.originalClub}
            onChange={(e) => setForm((prev) => ({ ...prev, updatedClub: e.target.value }))}
            className={inputClass}
            placeholder="Auto-filled from position"
          />
        </div>

        <div className="col-span-2">
          <label className={labelClass} htmlFor="cd-changes">
            Comments (optional)
          </label>
          <textarea
            id="cd-changes"
            value={form.comments}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, comments: e.target.value }))
            }
            rows={3}
            className={inputClass}
            placeholder="Please provide any additional comments about this correction."
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
        <input
          type="checkbox"
          checked={authorityConfirmed}
          onChange={(e) => setAuthorityConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
          required
        />
        <span>
          I attest I am correcting my own result, or I am acting with appropriate
          authority.
        </span>
      </label>

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
          disabled={!authorityConfirmed || (form.originalName === form.updatedName && form.originalCategory === form.updatedCategory && form.originalClub === form.updatedClub)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
        >
          Submit correction
        </button>
      </div>
    </form>
  );
}
