'use client';

import { useEffect, useRef, useState } from 'react';
import { RESULTS_EMAIL } from '@/lib/site-config';

export interface ResultsSubmitDialogProps {
  open: boolean;
  onClose: () => void;
  raceId: string;
  raceTitle: string;
}

interface FormState {
  year: string;
  suffix: string;
  shortenedCourse: boolean;
  notes: string;
}

function toWhomItMayConcern() {
  const titles = [
    'Bureau of Administrative Rectification',
    'Commission for Regulatory Accuracy',
    'Department of Procedural Integrity',
    'Secretariat for Data Validation',
    'Office of Oversight and Correction',
    'Authority for Statistical Adjustment',
    'Council on Administrative Review',
    'Division of Compliance and Remediation',
    'Ministry of Public Record Verification',
    'Agency for Outcome Harmonization',
    'Bureau of Procedural Standards',
    'Department of Correction and Oversight',
    'Commission for Evidence Review',
    'Office of Policy Alignment',
    'Secretariat for Audit and Rectification',
    'Council for Administrative Consistency',
    'Authority for Systematic Correction',
    'Division of Quality Assurance and Review',
    'Bureau of Record Amendment',
    'Office of Procedural Reconciliation',
  ];
  return titles[Math.floor(Math.random() * titles.length)];
}

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300';

export default function ResultsSubmitDialog({
  open,
  onClose,
  raceId,
  raceTitle,
}: ResultsSubmitDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [form, setForm] = useState<FormState>({
    year: '',
    suffix: '',
    shortenedCourse: false,
    notes: '',
  });

  // Open / close the native dialog imperatively so the backdrop renders correctly.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Reset form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm({
      year: new Date().getFullYear().toString(),
      suffix: '',
      shortenedCourse: false,
      notes: '',
    });
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!RESULTS_EMAIL) return;

    const yearLabel = form.year + form.suffix.trim() + (form.shortenedCourse ? '*' : '');
    const subject = `Results submission for ${raceTitle} (${raceId}) ${yearLabel}`;
    const body =
      `To ${toWhomItMayConcern()}:\n\n` +
      `Please find attached the results for the following race.\n\n` +
      `Race: ${raceTitle}\n` +
      `RaceId: ${raceId}\n` +
      `Year: ${yearLabel}\n` +
      `Shortened course: ${form.shortenedCourse ? 'Yes' : 'No'}\n` +
      `\nAdditional notes:\n${form.notes.trim() || '(none)'}\n` +
      `\n---\n\n` +
      `Before sending, I confirm that I have checked that the attached spreadsheet:\n\n` +
      `[ ] Has a header row: Position,Name,Club,Category,Time\n` +
      `[ ] Times are in hh:mm:ss or mm:ss format\n` +
      `[ ] Category values are M, F, NB (or A), optionally followed by two digits (e.g. M45, F65)\n` +
      `[ ] Results are sorted by finish time (ascending)\n` +
      `[ ] Positions are numbered sequentially starting from 1\n\n` +
      `I understand that I need to actually attach the results spreadsheet before sending.\n`;

    window.location.href = `mailto:${RESULTS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
          Submit race results
        </h2>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Confirm the year and any options below, then open your email client to
          attach your results spreadsheet before sending.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="rs-year">
              Year
            </label>
            <input
              id="rs-year"
              type="number"
              min={1900}
              max={new Date().getFullYear() + 1}
              value={form.year}
              onChange={(e) => setForm((prev) => ({ ...prev, year: e.target.value }))}
              className={inputClass}
              placeholder={String(new Date().getFullYear())}
              required
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="rs-suffix">
              Year suffix{' '}
              <span className="font-normal text-gray-500 dark:text-slate-400">
                (optional)
              </span>
            </label>
            <input
              id="rs-suffix"
              type="text"
              value={form.suffix}
              onChange={(e) => setForm((prev) => ({ ...prev, suffix: e.target.value }))}
              className={inputClass}
              placeholder="e.g. -s, -w, -1"
            />
          </div>

          <div className="col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.shortenedCourse}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, shortenedCourse: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
              />
              Race was run over a shortened course
            </label>
          </div>

          <div className="col-span-2">
            <label className={labelClass} htmlFor="rs-notes">
              Additional notes{' '}
              <span className="font-normal text-gray-500 dark:text-slate-400">
                (optional)
              </span>
            </label>
            <textarea
              id="rs-notes"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className={inputClass}
              placeholder="Any extra context for the results editor"
            />
          </div>
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="mb-1 font-semibold">Before sending, please check your spreadsheet:</p>
          <ul className="space-y-0.5 pl-3">
            <li>
              Header row:{' '}
              <code className="font-mono">Position,Name,Club,Category,Time</code>
            </li>
            <li>
              Times:{' '}
              <code className="font-mono">hh:mm:ss</code> or{' '}
              <code className="font-mono">mm:ss</code>
            </li>
            <li>
              Category:{' '}
              <code className="font-mono">M</code>,{' '}
              <code className="font-mono">F</code>,{' '}
              <code className="font-mono">NB</code> (or{' '}
              <code className="font-mono">A</code>), optionally followed by two digits
              (e.g. <code className="font-mono">M45</code>,{' '}
              <code className="font-mono">F65</code>)
            </li>
            <li>Results sorted by finish time (ascending)</li>
            <li>Positions numbered sequentially starting from 1</li>
          </ul>
        </div>

        <p className="text-xs text-gray-500 dark:text-slate-400">
          This will open your email client. Attach your results spreadsheet before
          sending.
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
