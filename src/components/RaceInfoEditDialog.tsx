'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import YAML from 'yaml';
import type { RaceInfo } from '@/types/datatable';
import { UPDATES_EMAIL } from '@/lib/site-config';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';
import { sendMailto } from '@/lib/navigate-to-mailto';
import { createRaceInfoEmail, raceIdError, suggestRaceId } from '@/lib/race-info-creation';

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

export interface RaceInfoEditDialogProps {
  open: boolean;
  onClose: () => void;
  raceId: string;
  raceTitle: string;
  race: RaceInfo;
  /** Plain-text organiser (already base64-decoded by the caller). */
  organiser: string | null;
  contents: string;
}

interface FrontmatterFields {
  title: string;
  venue: string;
  distance: string;
  climb: string;
  maleRecord: string;
  femaleRecord: string;
  raceDate: string;
  web: string;
  organiser: string;
}

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300';

function toFields(race: RaceInfo, organiser: string | null): FrontmatterFields {
  return {
    title: race.title ?? '',
    venue: race.venue ?? '',
    distance: race.distance !== undefined && race.distance !== null ? String(race.distance) : '',
    climb: race.climb !== undefined && race.climb !== null ? String(race.climb) : '',
    maleRecord: race.maleRecord ?? '',
    femaleRecord: race.femaleRecord ?? '',
    raceDate: race.raceDate ?? (race.raceDates ? race.raceDates.join(', ') : ''),
    web: race.web ?? '',
    organiser: organiser ?? '',
  };
}

type RaceInfoDialogProps = RaceInfoEditDialogProps | {
  open: boolean;
  onClose: () => void;
  mode: 'create';
  existingIds: string[] | null;
  idsLoading: boolean;
};

const emptyFields: FrontmatterFields = {
  title: '', venue: '', distance: '', climb: '', maleRecord: '', femaleRecord: '',
  raceDate: '', web: '', organiser: '',
};

export default function RaceInfoEditDialog(props: RaceInfoEditDialogProps) {
  return <RaceInfoDialog {...props} />;
}

export function RaceInfoDialog(props: RaceInfoDialogProps) {
  const creating = 'mode' in props;
  const { open, onClose } = props;
  const contents = creating ? '' : props.contents;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [original, setOriginal] = useState<FrontmatterFields>(() =>
    creating ? emptyFields : toFields(props.race, props.organiser)
  );
  const [fields, setFields] = useState<FrontmatterFields>(original);
  const [body, setBody] = useState(contents);
  const [newRaceId, setNewRaceId] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formId = creating ? 'race-create' : 'ri';
  const effectiveRaceId = creating && !idEdited
    ? suggestRaceId(fields.title, props.existingIds ?? [])
    : newRaceId;

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
      const freshFields = creating ? emptyFields : toFields(props.race, props.organiser);
      setOriginal(freshFields);
      setFields(freshFields);
      setBody(contents);
      setNewRaceId('');
      setIdEdited(false);
      setSubmitError(null);
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

  function updateField<K extends keyof FrontmatterFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSubmitError(null);
  }

  const changedFrontmatter: Record<string, string | number | string[]> = {};
  (Object.keys(fields) as Array<keyof FrontmatterFields>).forEach((key) => {
    if (key === 'venue' && !creating) return;
    const value = fields[key].trim();
    if (!value || value === original[key].trim()) return;
    if (key === 'distance' || key === 'climb') {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) changedFrontmatter[key] = numeric;
    } else if (key === 'raceDate' && value.includes(',')) {
      changedFrontmatter.raceDates = value
        .split(',')
        .map((date) => date.trim())
        .filter(Boolean);
    } else {
      changedFrontmatter[key] = value;
    }
  });
  const bodyChanged = body.trim() !== contents.trim();
  const hasChanges = Object.keys(changedFrontmatter).length > 0 || bodyChanged;
  const idError = creating && !props.idsLoading && (effectiveRaceId || !props.existingIds)
    ? raceIdError(effectiveRaceId, props.existingIds)
    : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!UPDATES_EMAIL || !hasChanges) return;

    if (creating) {
      if (props.idsLoading) return;
      const error = raceIdError(effectiveRaceId, props.existingIds)
        ?? (!fields.title.trim() ? 'Enter a race title.' : null)
        ?? (/^\s*!--/m.test(body) ? 'The description cannot contain a line beginning with !--.' : null);
      if (error || !props.existingIds) {
        setSubmitError(error);
        return;
      }
      const email = createRaceInfoEmail(effectiveRaceId, changedFrontmatter, body, props.existingIds);
      sendMailto({ to: UPDATES_EMAIL, ...email });
      onClose();
      return;
    }

    const frontmatterBlock = Object.keys(changedFrontmatter).length
      ? YAML.stringify(changedFrontmatter).trimEnd()
      : '';

    const subject = `Race details update for ${props.raceTitle} (${props.raceId})`;
    const emailBody =
      `To ${toWhomItMayConcern()}:\n\n` +
      `I would like to update the details for the race below.\n\n` +
      `!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE\n` +
      `File: races/${props.raceId}/index.md\n` +
      `---\n${frontmatterBlock}\n---\n` +
      (bodyChanged ? `${body.trim()}\n` : '') +
      `!-- END OF SENSITIVE SECTION\n`;

    sendMailto({ to: UPDATES_EMAIL, subject, body: emailBody });
    onClose();
  }

  if (!UPDATES_EMAIL) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${formId}-dialog-title`}
      onClick={handleBackdropClick}
      className="m-auto w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-900"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
        <h2 id={`${formId}-dialog-title`} className="text-lg font-semibold text-gray-900 dark:text-white">
          {creating ? 'Add a race' : 'Edit race details'}
        </h2>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          {creating ? 'Enter the race details, then send them by email for review.' : 'Update any of the fields below, then send us the changes by email for review.'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelClass} htmlFor={`${formId}-title`}>
              Race title
            </label>
            <input
              id={`${formId}-title`}
              type="text"
              value={fields.title}
              onChange={(e) => updateField('title', e.target.value)}
              className={inputClass}
              required={creating}
            />
          </div>

          {creating && (
            <>
              <div className="col-span-2">
                <label className={labelClass} htmlFor="race-create-id">Race ID</label>
                <input id="race-create-id" type="text" value={effectiveRaceId} required
                  onChange={(e) => { setNewRaceId(e.target.value); setIdEdited(true); setSubmitError(null); }}
                  className={inputClass} aria-describedby="race-create-id-help" aria-invalid={Boolean(idError)} />
                <p id="race-create-id-help" className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Letters, numbers, hyphens and underscores only. This becomes part of the race URL.
                </p>
              </div>
              <div className="col-span-2">
                <label className={labelClass} htmlFor="race-create-venue">Venue</label>
                <input id="race-create-venue" type="text" value={fields.venue}
                  onChange={(e) => updateField('venue', e.target.value)} className={inputClass} />
              </div>
            </>
          )}

          <div>
            <label className={labelClass} htmlFor={`${formId}-distance`}>
              Distance (km)
            </label>
            <input
              id={`${formId}-distance`}
              type="number"
              step="0.1"
              min={0}
              value={fields.distance}
              onChange={(e) => updateField('distance', e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor={`${formId}-climb`}>
              Climb (m)
            </label>
            <input
              id={`${formId}-climb`}
              type="number"
              step="1"
              min={0}
              value={fields.climb}
              onChange={(e) => updateField('climb', e.target.value)}
              className={inputClass}
            />
          </div>

          {!creating && <div>
            <label className={labelClass} htmlFor="ri-male-record">
              Male record
            </label>
            <input
              id="ri-male-record"
              type="text"
              value={fields.maleRecord}
              onChange={(e) => updateField('maleRecord', e.target.value)}
              className={inputClass}
              placeholder="Name, time (year)"
            />
          </div>}

          {!creating && <div>
            <label className={labelClass} htmlFor="ri-female-record">
              Female record
            </label>
            <input
              id="ri-female-record"
              type="text"
              value={fields.femaleRecord}
              onChange={(e) => updateField('femaleRecord', e.target.value)}
              className={inputClass}
              placeholder="Name, time (year)"
            />
          </div>}

          <div className="col-span-2">
            <label className={labelClass} htmlFor={`${formId}-race-date`}>
              Race date rule
            </label>
            <input
              id={`${formId}-race-date`}
              type="text"
              value={fields.raceDate}
              onChange={(e) => updateField('raceDate', e.target.value)}
              className={inputClass}
              placeholder="e.g. 5th June 2027"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Omit the year to get a perpetual date.
              Perpetual dates can be used to work out future dates automatically.
              Supported formats:
                &quot;2nd Sunday in May&quot;,
                &quot;Last Saturday in June&quot;,
                &quot;25th December&quot;, or
                &quot;Day after some-other-race-id&quot;.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor={`${formId}-web`}>
              Website
            </label>
            <input
              id={`${formId}-web`}
              type="text"
              value={fields.web}
              onChange={(e) => updateField('web', e.target.value)}
              className={inputClass}
              placeholder="https://..."
            />
          </div>

          <div>
            <label className={labelClass} htmlFor={`${formId}-organiser`}>
              Organiser
            </label>
            <input
              id={`${formId}-organiser`}
              type="text"
              value={fields.organiser}
              onChange={(e) => updateField('organiser', e.target.value)}
              className={inputClass}
              placeholder="Name <email>"
            />
          </div>
        </div>

        <div role="group" aria-labelledby={`${formId}-description-label`}>
          <span id={`${formId}-description-label`} className={labelClass}>Race description</span>
          <MdxEditorClient
            markdown={body}
            onChange={(value) => { setBody(value); setSubmitError(null); }}
            placeholder={creating ? 'Describe the new race...' : 'Describe the race...'}
          />
        </div>

        {creating && props.idsLoading && <p className="text-sm text-gray-600 dark:text-slate-300">Checking existing race IDs...</p>}
        {creating && !props.idsLoading && (submitError || idError) && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {submitError || idError}
          </p>
        )}
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
            disabled={!hasChanges || (creating && (props.idsLoading || !props.existingIds))}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:hover:bg-gray-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          >
            {creating ? 'Send new race by email' : 'Send update by email'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
