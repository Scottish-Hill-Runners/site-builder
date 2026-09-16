'use client';

import { useEffect, useRef, useState } from 'react';
import YAML from 'yaml';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import { UPDATES_EMAIL } from '@/lib/site-config';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';

interface CalendarEntry {
  Date: string;
  raceName: string;
  raceId?: string;
}

export interface ChampionshipRacesEditDialogProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  title: string;
  /** Selectable years, most relevant first (e.g. the current season, then next season). */
  years: string[];
  raceIdsByYear: { [year: string]: string[] };
}

const raceIdPattern = /^[-\w]+$/;

// Defined outside the component so the React Compiler doesn't treat this
// navigation as a render-time mutation.
function navigateToMailto(url: string) {
  window.location.href = url;
}

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300';

export default function ChampionshipRacesEditDialog({
  open,
  onClose,
  slug,
  title,
  years,
  raceIdsByYear,
}: ChampionshipRacesEditDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedYear, setSelectedYear] = useState(years[0]);
  const [selected, setSelected] = useState<string[]>(raceIdsByYear[years[0]] ?? []);
  const [calendarOptions, setCalendarOptions] = useState<
    Array<CalendarEntry & { raceId: string }>
  >([]);
  const [overrideText, setOverrideText] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

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
      setSelectedYear(years[0]);
      setSelected(raceIdsByYear[years[0]] ?? []);
      setOverrideText('');
      setOverrideError(null);
    }
  }

  function changeYear(nextYear: string) {
    setSelectedYear(nextYear);
    setSelected(raceIdsByYear[nextYear] ?? []);
    setOverrideText('');
    setOverrideError(null);
  }

  // Load the selected year's calendar entries once the dialog is opened.
  useEffect(() => {
    if (!open) return;
    let isCancelled = false;
    fetchGzipJson<CalendarEntry[]>('/calendar.json.gz').then((result) => {
      if (isCancelled || result.status !== 'ok') return;
      const entries = result.data
        .filter(
          (entry): entry is CalendarEntry & { raceId: string } =>
            Boolean(entry.raceId) && entry.Date.startsWith(`${selectedYear}-`)
        )
        .sort((a, b) => a.Date.localeCompare(b.Date));
      // The calendar can list the same race more than once (e.g. reschedules);
      // keep only the earliest entry per raceId so each race gets one checkbox.
      const uniqueByRaceId = new Map<string, CalendarEntry & { raceId: string }>();
      for (const entry of entries) {
        if (!uniqueByRaceId.has(entry.raceId)) uniqueByRaceId.set(entry.raceId, entry);
      }
      setCalendarOptions([...uniqueByRaceId.values()]);
    });
    return () => {
      isCancelled = true;
    };
  }, [open, selectedYear]);

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

  function toggleRace(raceId: string) {
    setSelected((prev) =>
      prev.includes(raceId) ? prev.filter((id) => id !== raceId) : [...prev, raceId]
    );
  }

  function removeRace(raceId: string) {
    setSelected((prev) => prev.filter((id) => id !== raceId));
  }

  function addOverride() {
    const raceId = overrideText.trim();
    if (!raceId) return;
    if (!raceIdPattern.test(raceId)) {
      setOverrideError('Use only letters, numbers, - and _.');
      return;
    }
    if (!selected.includes(raceId)) setSelected((prev) => [...prev, raceId]);
    setOverrideText('');
    setOverrideError(null);
  }

  const sortedSelected = [...selected].sort((a, b) => a.localeCompare(b));
  const sortedOriginal = [...(raceIdsByYear[selectedYear] ?? [])].sort((a, b) =>
    a.localeCompare(b)
  );
  const hasChanges =
    sortedSelected.length !== sortedOriginal.length ||
    sortedSelected.some((id, index) => id !== sortedOriginal[index]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!UPDATES_EMAIL || !hasChanges) return;

    const frontmatterBlock = YAML.stringify({ [selectedYear]: sortedSelected }).trimEnd();
    const subject = `Race schedule update for ${title} (${slug}) ${selectedYear}`;
    const emailBody =
      `To ${toWhomItMayConcern()}:\n\n` +
      `I would like to update the ${selectedYear} race schedule for this championship.\n\n` +
      `!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE\n` +
      `File: championships/${slug}.md\n` +
      `---\n${frontmatterBlock}\n---\n` +
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
      className="m-auto w-full max-w-lg rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-900"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Edit race schedule
        </h2>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Choose the season, then pick its races from the calendar below and send
          us the changes by email for review.
        </p>

        {years.length > 1 && (
          <div>
            <label className={labelClass} htmlFor="cr-year">
              Season
            </label>
            <select
              id="cr-year"
              value={selectedYear}
              onChange={(e) => changeYear(e.target.value)}
              className={inputClass}
            >
              {years.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>Selected races</label>
          {sortedSelected.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              No races selected yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {sortedSelected.map((raceId) => (
                <li
                  key={raceId}
                  className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"
                >
                  {raceId}
                  <button
                    type="button"
                    onClick={() => removeRace(raceId)}
                    aria-label={`Remove ${raceId}`}
                    className="ml-1 font-bold text-blue-500 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className={labelClass}>{selectedYear} calendar races</label>
          {calendarOptions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">
              No {selectedYear} races found in the calendar yet.
            </p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2 dark:border-slate-700">
              {calendarOptions.map((entry) => (
                <li key={entry.raceId}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={selected.includes(entry.raceId)}
                      onChange={() => toggleRace(entry.raceId)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
                    />
                    {entry.raceName} — {entry.Date}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="cr-override">
            Add a race without a firm date yet
          </label>
          <div className="flex gap-2">
            <input
              id="cr-override"
              type="text"
              value={overrideText}
              onChange={(e) => {
                setOverrideText(e.target.value);
                setOverrideError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addOverride();
                }
              }}
              className={inputClass}
              placeholder="e.g. BenLomond"
            />
            <button
              type="button"
              onClick={addOverride}
              className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Add
            </button>
          </div>
          {overrideError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {overrideError}
            </p>
          )}
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
            disabled={!hasChanges}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          >
            Send update by email
          </button>
        </div>
      </form>
    </dialog>
  );
}
