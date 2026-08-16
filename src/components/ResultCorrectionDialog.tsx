'use client';

import { useEffect, useRef, useState } from 'react';
import type { RaceResult } from '@/types/datatable';
import ChallengeQuestionBlock from '@/components/ChallengeQuestionBlock';
import {
  type ChallengeQuestion,
  getRandomChallengeQuestion,
} from '@/lib/challenge-questions';
import { NEXT_PUBLIC_MINOR_CORRECTION_URL } from '@/lib/site-config';

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

interface MinorCorrectionChange {
  field: 'name' | 'category' | 'club' | 'notes';
  value: string;
}

interface MinorCorrectionPayload {
  type: 'minor-correction';
  raceId: string;
  year: string;
  runnerPosition: string;
  challengeQuestionId: string;
  challengeAnswer: string;
  authorityConfirmed: boolean;
  changes: MinorCorrectionChange[];
}

function buildMinorCorrectionPayload(
  raceId: string,
  year: string,
  original: OriginalValues | null,
  challengeQuestionId: string,
  challengeAnswer: string,
  authorityConfirmed: boolean,
  form: FormState
): MinorCorrectionPayload {
  const changes: MinorCorrectionChange[] = [];

  if (original) {
    const newName = form.name.trim();
    const newCategory = form.category.trim();
    const newClub = form.club.trim();
    if (newName && newName !== original.name) {
      changes.push({ field: 'name', value: newName });
    }
    if (newCategory && newCategory !== original.category) {
      changes.push({ field: 'category', value: newCategory });
    }
    if (newClub && newClub !== original.club) {
      changes.push({ field: 'club', value: newClub });
    }
  }

  const extra = form.proposedChanges.trim();
  if (extra) changes.push({ field: 'notes', value: extra });

  return {
    type: 'minor-correction',
    raceId,
    year,
    runnerPosition: form.position || '',
    challengeQuestionId,
    challengeAnswer,
    authorityConfirmed,
    changes,
  };
}

async function submitMinorCorrection(payload: MinorCorrectionPayload): Promise<void> {
  if (!NEXT_PUBLIC_MINOR_CORRECTION_URL) {
    throw new Error('Correction submission endpoint is not configured.');
  }

  const response = await fetch(NEXT_PUBLIC_MINOR_CORRECTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Webhook request failed with ${response.status}`);
  }
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
    name: initialResult?.name ?? '',
    category: initialResult?.category ?? '',
    club: initialResult?.club ?? '',
    proposedChanges: '',
  });
  const [originalValues, setOriginalValues] = useState<OriginalValues | null>(
    initialResult
      ? { name: initialResult.name, category: initialResult.category, club: initialResult.club }
      : null
  );
  const [challengeQuestion] = useState<ChallengeQuestion>(() => getRandomChallengeQuestion());
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);

  function handlePositionChange(value: string) {
    setForm((prev) => ({ ...prev, position: value }));
    const posNum = parseInt(value, 10);
    if (!Number.isNaN(posNum) && posNum > 0) {
      const match = results.find((r) => r.position === posNum);
      if (match) {
        setOriginalValues({ name: match.name, category: match.category, club: match.club });
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
    const payload = buildMinorCorrectionPayload(
      raceId,
      year,
      originalValues,
      challengeQuestion.id,
      challengeAnswer,
      authorityConfirmed,
      form
    );
    void submitMinorCorrection(payload)
      .then(() => onClose())
      .catch(() => {
        window.alert('Unable to submit the correction right now. Please try again.');
      });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Submit a correction
      </h2>
      <p className="text-sm text-gray-600 dark:text-slate-300">
        Enter the position of the result to correct — the runner&apos;s details
        will be looked up automatically. Edit any incorrect fields,
        then (optionally) provide some contact details so we can get in touch
        if any clarifications are needed.
      </p>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/60">
        <div className="font-medium text-gray-900 dark:text-white">{raceTitle}</div>
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
            Contact details (optional)
          </label>
          <textarea
            id="cd-changes"
            value={form.proposedChanges}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, proposedChanges: e.target.value }))
            }
            rows={3}
            className={inputClass}
            placeholder="Please let us know how to get in touch if we need more information about this correction."
          />
        </div>
      </div>

      <ChallengeQuestionBlock
        question={challengeQuestion}
        value={challengeAnswer}
        onChange={setChallengeAnswer}
      />

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
          disabled={!authorityConfirmed}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Submit correction
        </button>
      </div>
    </form>
  );
}
