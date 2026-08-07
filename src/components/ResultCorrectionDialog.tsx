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
  name: string;
  category: string;
  club: string;
  proposedChanges: string;
}

interface OriginalValues {
  name: string;
  category: string;
  club: string;
}

function buildCorrectionText(
  original: OriginalValues | null,
  form: FormState
): string {
  const changes: string[] = [];
  if (original) {
    const newName = form.name.trim();
    const newCategory = form.category.trim();
    const newClub = form.club.trim();
    if (newName && newName !== original.name) changes.push(`name to ${newName}`);
    if (newCategory && newCategory !== original.category) changes.push(`category to ${newCategory}`);
    if (newClub && newClub !== original.club) changes.push(`club to ${newClub}`);
  }

  let correctionText =
    changes.length > 0 ? `Change ${changes.join(', ')}` : '';
  const extra = form.proposedChanges.trim();
  if (extra) {
    correctionText = correctionText ? `${correctionText}. ${extra}` : extra;
  }
  return correctionText || '[Insert correction details]';
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

  const [form, setForm] = useState<FormState>({
    position: '',
    name: '',
    category: '',
    club: '',
    proposedChanges: '',
  });
  const [originalValues, setOriginalValues] = useState<OriginalValues | null>(null);

  // Open / close the native dialog imperatively so the backdrop renders correctly.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Reset form each time the dialog opens, seeding from initialResult if provided.
  useEffect(() => {
    if (!open) return;
    const orig = initialResult
      ? { name: initialResult.name, category: initialResult.category, club: initialResult.club }
      : null;
    setOriginalValues(orig);
    setForm({
      position: initialResult ? String(initialResult.position) : '',
      name: initialResult?.name ?? '',
      category: initialResult?.category ?? '',
      club: initialResult?.club ?? '',
      proposedChanges: '',
    });
  }, [open, initialResult]);

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

  // When the user types a position, look it up and auto-fill name / category / club.
  function handlePositionChange(value: string) {
    setForm((prev) => ({ ...prev, position: value }));
    const posNum = parseInt(value, 10);
    if (!isNaN(posNum) && posNum > 0) {
      const match = results.find((r) => r.position === posNum);
      if (match) {
        const orig = { name: match.name, category: match.category, club: match.club };
        setOriginalValues(orig);
        setForm((prev) => ({
          ...prev,
          position: value,
          name: match.name,
          category: match.category,
          club: match.club,
        }));
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!CORRECTIONS_EMAIL) return;

    const correctionText = buildCorrectionText(originalValues, form);
    const subject = `Correction for ${raceTitle} (${raceId}) ${year}`;
    const body =
      `To ${toWhomItMayConcern()}:\n\n` +
      `I would like to submit the following correction to the ${year} results for ${raceTitle}.\n\n` +
      `- raceId: ${raceId}\n` +
      `- year: ${year}\n` +
      `- name: ${originalValues?.name?.trim() || '[not specified]'}\n` +
      `- position: ${form.position || '[not specified]'}\n` +
      `- category: ${originalValues?.category?.trim() || '[not specified]'}\n` +
      `- club: ${originalValues?.club?.trim() || '[not specified]'}\n` +
      `- correction: ${correctionText}\n\n` +
      `I attest that the above information is accurate to the best of my knowledge.\n`;

    window.location.href = `mailto:${CORRECTIONS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-full max-w-lg rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-900"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Email the results editor
        </h2>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Enter the position of the result to correct — the runner&apos;s details
          will be looked up automatically. Edit any incorrect fields, then describe
          the change below.
        </p>

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
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
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
              type="text"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
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
              value={form.club}
              onChange={(e) => setForm((prev) => ({ ...prev, club: e.target.value }))}
              className={inputClass}
              placeholder="Auto-filled from position"
            />
          </div>

          <div className="col-span-2">
            <label className={labelClass} htmlFor="cd-changes">
              Additional details (optional)
            </label>
            <textarea
              id="cd-changes"
              value={form.proposedChanges}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, proposedChanges: e.target.value }))
              }
              rows={3}
              className={inputClass}
              placeholder="Any extra context for the editor"
            />
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-slate-400">
          This will open your email client with the details pre-filled.
        </p>

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
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Open email client
          </button>
        </div>
      </form>
    </dialog>
  );
}
