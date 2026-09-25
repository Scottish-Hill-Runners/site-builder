'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import YAML from 'yaml';
import { RESULTS_EMAIL } from '@/lib/site-config';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import { firstSentence } from '@/lib/news-excerpt';
import { foldEmailBody } from '@/lib/email-line-fold';
import { buildResultsNewsPrefill } from '@/lib/results-news-template';
import {
  applyInferredHeaders,
  inferColumnRoles,
  mergeSplitNameColumns,
  unresolvedRoles,
  type ColumnRole,
} from '@/lib/column-inference';
import {
  applyCategoryCorrections,
  buildCanonicalCsv,
  detectTrailingInvalidRows,
  findUnrecognizedCategories,
  parseDelimitedText,
  parseResultsFile,
  ResultsParseError,
  trimToValidRows,
  validateResultsData,
  type CategoryCorrection,
  type ParsedResultsData,
  type ResultsIssue,
  type TrailingRowsSuggestion,
} from '@/lib/results-submission';

const MdxEditorClient = dynamic(
  () => import('@/components/mdx-editor-client').then((mod) => mod.MdxEditorClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
        Loading editor...
      </div>
    ),
  }
);

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

type NewsPostMode = 'none' | 'blank' | 'template';

type CalendarEntry = {
  Date: string;
  raceName: string;
  raceId: string;
  distance: number;
  climb: number;
};

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
    'Ministère de la Régulation des Compétitions Sportives',
    'Direction Générale de l\'Homologation des Résultats',
    'Secrétariat d\'État aux Affaires Sportives et aux Classements',
    'Agence Nationale de Certification des Performances',
    'Bureau de Vérification des Données de Course',
    'Commission de Validation des Résultats Officiels',
    'Autorité de Contrôle des Épreuves et des Classements',
    'Département de l\'Intégrité des Compétitions et des Résultats',
    'Conseil Supérieur de la Gestion des Événements Sportifs',
    'Service Central de Traitement des Données de Course',
    'Inspection Générale des Classements et des Homologations',
    'Office National de la Transparence des Résultats',
    'Direction des Opérations de Chronométrage et de Classement',
    'Secrétariat à la Supervision des Compétitions Nationales',
    'Cellule de Coordination des Résultats et des Statistiques',
    'Commission Technique d\'Arbitrage et de Validation',
    'Bureau d\'Enregistrement des Performances Officielles',
    'Agence de Régulation des Épreuves de Vitesse et d\'Endurance',
    'Département de la Conformité des Résultats Sportifs',
    'Direction du Suivi et de l\'Archivage des Classements',
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

  const [parsedData, setParsedData] = useState<ParsedResultsData | null>(null);
  const [issues, setIssues] = useState<ResultsIssue[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [trailingRows, setTrailingRows] = useState<TrailingRowsSuggestion | null>(null);
  const [categoryCorrections, setCategoryCorrections] = useState<CategoryCorrection[]>([]);
  const [categoryEdits, setCategoryEdits] = useState<Record<string, string>>({});
  const [clubNames, setClubNames] = useState<string[]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [unresolvedColumns, setUnresolvedColumns] = useState<ColumnRole[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Partial<Record<ColumnRole, number>>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newsPostMode, setNewsPostMode] = useState<NewsPostMode>('none');
  const [newsTitle, setNewsTitle] = useState('');
  const [newsExcerpt, setNewsExcerpt] = useState('');
  const [newsBody, setNewsBody] = useState('');
  // MdxEditorClient only reads `markdown` as its initial value, so it must be remounted
  // (via this key) whenever newsBody is set programmatically rather than by typing.
  const [newsEditorKey, setNewsEditorKey] = useState(0);
  const [calendarEntries, setCalendarEntries] = useState<CalendarEntry[]>([]);

  const hasBlockingErrors = issues.some((issue) => issue.level === 'error');
  const canGenerateNewsTemplate = parsedData !== null && !hasBlockingErrors;
  const canSubmitNewsPost =
    newsPostMode === 'none' || (newsTitle.trim() !== '' && (newsExcerpt.trim() !== '' || newsBody.trim() !== ''));

  // Club names improve column inference (a repeated, recognizable value is a strong Club signal).
  useEffect(() => {
    fetchGzipJson<Array<{ name: string }>>('/clubs.json.gz')
      .then((result) => {
        if (result.status === 'ok') setClubNames(result.data.map((c) => c.name));
      })
      .catch(() => {});
  }, []);

  // The calendar supplies the race's actual date for the generated news report's lead sentence.
  useEffect(() => {
    fetchGzipJson<CalendarEntry[]>('/calendar.json.gz')
      .then((result) => {
        if (result.status === 'ok') setCalendarEntries(result.data);
      })
      .catch(() => {});
  }, []);

  function clearResultsData() {
    setParsedData(null);
    setIssues([]);
    setParseError(null);
    setTrailingRows(null);
    setCategoryCorrections([]);
    setCategoryEdits({});
    setRawHeaders([]);
    setUnresolvedColumns([]);
    setManualOverrides({});
  }

  function applyParsedData(data: ParsedResultsData, overrides = manualOverrides) {
    const merged = mergeSplitNameColumns(data);
    const roleMap = inferColumnRoles(merged, clubNames);
    for (const role of Object.keys(overrides) as ColumnRole[]) {
      const index = overrides[role];
      if (index !== undefined) roleMap[role] = { index, source: 'header' };
    }
    const finalData = applyInferredHeaders(merged, roleMap);

    setParsedData(finalData);
    setRawHeaders(merged.headers);
    setUnresolvedColumns(unresolvedRoles(roleMap));
    setIssues(validateResultsData(finalData));
    setTrailingRows(detectTrailingInvalidRows(finalData));
    const corrections = findUnrecognizedCategories(finalData);
    setCategoryCorrections(corrections);
    setCategoryEdits(
      Object.fromEntries(corrections.map((c) => [c.raw, c.suggestion ?? '']))
    );
  }

  async function handleParsedResults(loader: () => Promise<ParsedResultsData>) {
    setParseError(null);
    try {
      setManualOverrides({});
      applyParsedData(await loader(), {});
    } catch (err) {
      setParsedData(null);
      setIssues([]);
      setTrailingRows(null);
      setCategoryCorrections([]);
      setCategoryEdits({});
      setRawHeaders([]);
      setUnresolvedColumns([]);
      setParseError(
        err instanceof ResultsParseError ? err.message : 'Could not read that file.'
      );
    }
  }

  function handleColumnOverride(role: ColumnRole, columnIndex: number) {
    if (!parsedData) return;
    const newOverrides = { ...manualOverrides, [role]: columnIndex };
    setManualOverrides(newOverrides);
    applyParsedData(parsedData, newOverrides);
  }

  function handleTrimTrailingRows() {
    if (!parsedData || !trailingRows) return;
    applyParsedData(trimToValidRows(parsedData, trailingRows.validRowCount));
  }

  function handleApplyCategoryCorrections() {
    if (!parsedData) return;
    applyParsedData(applyCategoryCorrections(parsedData, categoryEdits));
  }

  // Selecting the template mode (re-)generates the fields; switching to blank clears them.
  function handleSelectNewsPostMode(mode: NewsPostMode) {
    setNewsPostMode(mode);
    if (mode === 'blank') {
      setNewsTitle('');
      setNewsExcerpt('');
      setNewsBody('');
      setNewsEditorKey((key) => key + 1);
    } else if (mode === 'template') {
      handleGenerateNewsTemplate();
    }
  }

  function handleGenerateNewsTemplate() {
    if (!parsedData || hasBlockingErrors) return;
    const year = form.year + form.suffix.trim() + (form.shortenedCourse ? '*' : '');
    const dateIso = calendarEntries.find(
      (entry) => entry.raceId === raceId && entry.Date.startsWith(form.year)
    )?.Date;
    const prefill = buildResultsNewsPrefill({
      raceId,
      raceTitle,
      year,
      canonicalCsv: buildCanonicalCsv(parsedData),
      dateIso,
    });
    setNewsTitle(prefill.title);
    setNewsExcerpt(prefill.excerpt);
    setNewsBody(prefill.content);
    setNewsEditorKey((key) => key + 1);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleParsedResults(() => parseResultsFile(file));
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleParsedResults(() => parseResultsFile(file));
    e.target.value = '';
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    e.preventDefault();
    void handleParsedResults(async () => parseDelimitedText(text));
  }

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
      setForm({
        year: new Date().getFullYear().toString(),
        suffix: '',
        shortenedCourse: false,
        notes: '',
      });
      clearResultsData();
      setNewsPostMode('none');
      setNewsTitle('');
      setNewsExcerpt('');
      setNewsBody('');
      setNewsEditorKey((key) => key + 1);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!RESULTS_EMAIL) return;
    if (parsedData && hasBlockingErrors) return;
    if (!canSubmitNewsPost) return;

    const yearLabel = form.year + form.suffix.trim() + (form.shortenedCourse ? '*' : '');
    const subject = `Results submission for ${raceTitle} (${raceId}) ${yearLabel}`;

    // When validated data is available it is embedded directly, replacing the manual attach checklist.
    const introAndChecklist = parsedData
      ? ''
      : 'These results were not able to be automatically validated,\n' +
        `so I have instead attached the results to this email for manual review.\n\n` +
        `Before sending, I confirm that I have checked that the attached spreadsheet:\n\n` +
        `[ ] Has a header row: Position,Name,Club,Category,Time\n` +
        `[ ] Times are in hh:mm:ss or mm:ss format\n` +
        `[ ] Category values are M, F, NB (or A), optionally followed by two digits (e.g. M45, F65)\n` +
        `[ ] Results are sorted by finish time (ascending)\n` +
        `[ ] Positions are numbered sequentially starting from 1\n\n` +
        `I understand that I need to actually attach the results spreadsheet before sending.\n\n`;
    const sensitiveSection = parsedData
      ? `File: races/${raceId}/${yearLabel}.csv\n\n${buildCanonicalCsv(parsedData)}\n`
      : `File: races/${raceId}/${yearLabel}.csv\n`;

    let newsSection = '';
    if (newsPostMode !== 'none') {
      const now = new Date();
      const isoDate = todayIsoDate(now);
      const newsYear = now.getFullYear();
      const newsPath = `news/${newsYear}/${isoDate}-${secondsSinceMidnight(now)}.md`;
      const finalExcerpt = newsExcerpt.trim() || firstSentence(newsBody);
      // Some email clients hard-wrap plain text at ~72 characters, which would
      // otherwise corrupt long title/excerpt values mid-line. Rendering them as
      // folded block scalars pre-wrapped well under that width means the email
      // client has nothing left to wrap, so the YAML survives round-tripping.
      const frontmatterDoc = new YAML.Document({
        title: newsTitle.trim(),
        excerpt: finalExcerpt,
        date: isoDate,
      });
      for (const key of ['title', 'excerpt']) {
        const node = frontmatterDoc.get(key, true);
        if (node instanceof YAML.Scalar) node.type = YAML.Scalar.BLOCK_FOLDED;
      }
      const frontmatterBlock = frontmatterDoc.toString({ lineWidth: 60 }).trimEnd();

      newsSection =
        `\n\n!-- PLEASE DO NOT EDIT BELOW THIS LINE\n` +
        `File: ${newsPath}\n` +
        `---\n${frontmatterBlock}\n---\n` +
        (newsBody.trim() ? `${newsBody.trim()}\n` : '') +
        `!-- END OF SENSITIVE SECTION\n`;
    }

    const notes = form.notes.trim();
    const body =
      `To ${toWhomItMayConcern()}:\n\n` +
      `Please find below the ${yearLabel} results for ${raceTitle} (${raceId})\n` +
      (notes ? `\nAdditional notes:\n${notes}\n` : '') +
      `\n---\n\n` +
      introAndChecklist +
      `!-- PLEASE DO NOT EDIT BELOW THIS LINE --\n` +
      sensitiveSection +
      `!-- END OF SENSITIVE SECTION\n` +
      newsSection;

    window.location.href = `mailto:${RESULTS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(foldEmailBody(body))}`;
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
          send your results.
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

        <div>
          <p className={labelClass}>Results data</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onPaste={handlePaste}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            tabIndex={0}
            role="button"
            aria-label="Drop a results file, paste CSV or TSV data, or click to browse files"
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 text-center text-sm transition focus:outline-none focus:ring-1 focus:ring-blue-500 ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
                : 'border-gray-300 bg-gray-50 dark:border-slate-600 dark:bg-slate-800'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.ods"
              className="hidden"
              onChange={handleFileInputChange}
            />
            {parsedData ? (
              <>
                <p className="font-medium text-gray-800 dark:text-slate-100">
                  {parsedData.rows.length} row(s) detected
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearResultsData();
                  }}
                  className="text-xs font-medium text-blue-600 underline hover:no-underline dark:text-blue-400"
                >
                  Remove and start again
                </button>
              </>
            ) : (
              <p className="text-gray-600 dark:text-slate-300">
                Drag a .csv, .xlsx or .ods file here, paste CSV/TSV data, or click to
                browse
              </p>
            )}
          </div>
          {parseError && (
            <p className="mt-1 text-sm text-red-700 dark:text-red-400">{parseError}</p>
          )}
        </div>

        {unresolvedColumns.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="mb-2 font-semibold">
              Couldn&apos;t automatically identify {unresolvedColumns.length} column(s). Please
              choose which column holds each of these:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {unresolvedColumns.map((role) => (
                <div key={role}>
                  <label className="mb-0.5 block font-medium">{role}</label>
                  <select
                    value={manualOverrides[role] ?? ''}
                    onChange={(e) => handleColumnOverride(role, Number(e.target.value))}
                    className="w-full rounded border border-amber-300 bg-white px-1.5 py-1 text-gray-900 focus:border-amber-500 focus:outline-none dark:border-amber-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="" disabled>
                      Choose column…
                    </option>
                    {rawHeaders.map((header, index) => (
                      <option key={index} value={index}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {trailingRows && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
            <p>
              The last {trailingRows.invalidRowCount} row(s) don&apos;t look like results
              (e.g. footer notes). Only the first {trailingRows.validRowCount} row(s)
              look valid.
            </p>
            <button
              type="button"
              onClick={handleTrimTrailingRows}
              className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
            >
              Use first {trailingRows.validRowCount} rows
            </button>
          </div>
        )}

        {categoryCorrections.length > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
            <p className="mb-2 font-semibold">
              {categoryCorrections.length} unrecognised category value(s) found. Review
              the suggested replacements below:
            </p>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-blue-700 dark:text-blue-300">
                  <th className="pb-1 pr-2 font-medium">Found</th>
                  <th className="pb-1 pr-2 font-medium">Count</th>
                  <th className="pb-1 font-medium">Replace with</th>
                </tr>
              </thead>
              <tbody>
                {categoryCorrections.map((correction) => (
                  <tr key={correction.raw}>
                    <td className="py-0.5 pr-2 font-mono">{correction.raw}</td>
                    <td className="py-0.5 pr-2">{correction.count}</td>
                    <td className="py-0.5">
                      <input
                        type="text"
                        value={categoryEdits[correction.raw] ?? ''}
                        onChange={(e) =>
                          setCategoryEdits((prev) => ({
                            ...prev,
                            [correction.raw]: e.target.value,
                          }))
                        }
                        placeholder="Leave blank to keep as-is"
                        className="w-28 rounded border border-blue-300 bg-white px-1.5 py-0.5 font-mono text-gray-900 focus:border-blue-500 focus:outline-none dark:border-blue-700 dark:bg-slate-800 dark:text-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={handleApplyCategoryCorrections}
              className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700"
            >
              Apply corrections
            </button>
          </div>
        )}

        {parsedData ? (
          <div
            className={`rounded-md border p-3 text-xs ${
              hasBlockingErrors
                ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
            }`}
          >
            <p className="mb-1 font-semibold">              {issues.length === 0
                ? 'All checks passed'
                : `${issues.filter((i) => i.level === 'error').length} error(s), ${issues.filter((i) => i.level === 'warning').length} warning(s)`}
            </p>
            {issues.length > 0 && (
              <ul className="max-h-32 space-y-0.5 overflow-y-auto pl-3">
                {issues.map((issue, i) => (
                  <li
                    key={i}
                    className={
                      issue.level === 'error'
                        ? 'text-red-800 dark:text-red-200'
                        : 'text-amber-800 dark:text-amber-200'
                    }
                  >
                    {issue.row ? `Row ${issue.row}: ` : ''}
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
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
        )}

        <div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={newsPostMode !== 'none'}
              onChange={(e) =>
                handleSelectNewsPostMode(
                  e.target.checked ? (canGenerateNewsTemplate ? 'template' : 'blank') : 'none'
                )
              }
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
            />
            Also submit a news post about these results
          </label>

          {newsPostMode !== 'none' && (
            <div className="mt-3 flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectNewsPostMode('template')}
                  disabled={!canGenerateNewsTemplate}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                    newsPostMode === 'template'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title={
                    canGenerateNewsTemplate
                      ? 'Generate a report from the results above'
                      : 'Add valid results above first to generate a report'
                  }
                >
                  Start from a generated report
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectNewsPostMode('blank')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    newsPostMode === 'blank'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Start from scratch
                </button>
              </div>

              <div>
                <label className={labelClass} htmlFor="rs-news-title">
                  Title
                </label>
                <input
                  id="rs-news-title"
                  type="text"
                  value={newsTitle}
                  onChange={(e) => setNewsTitle(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="rs-news-excerpt">
                  Excerpt
                </label>
                <input
                  id="rs-news-excerpt"
                  type="text"
                  value={newsExcerpt}
                  onChange={(e) => setNewsExcerpt(e.target.value)}
                  className={inputClass}
                  placeholder="A short summary shown in the news list (defaults to the story's first sentence)"
                />
              </div>

              <div>
                <label className={labelClass}>Story</label>
                <MdxEditorClient
                  key={newsEditorKey}
                  markdown={newsBody}
                  onChange={setNewsBody}
                  placeholder="Write the news story..."
                />
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 dark:text-slate-400">
          {parsedData
            ? 'This will open your email client with the validated results already included below.'
            : 'This will open your email client. Attach your results spreadsheet before sending.'}
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
            disabled={(parsedData ? hasBlockingErrors : false) || !canSubmitNewsPost}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            Open email client
          </button>
        </div>
      </form>
    </dialog>
  );
}
