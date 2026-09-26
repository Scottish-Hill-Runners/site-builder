'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { UPDATES_EMAIL } from '@/lib/site-config';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';
import { foldEmailBody } from '@/lib/email-line-fold';
import {
  countGpxTrackPoints,
  gpxToRouteGeoJson,
  type CheckpointInput,
} from '@/lib/gpx-route-processing';

const GpxCheckpointMap = dynamic(() => import('@/components/GpxCheckpointMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-800">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400" />
    </div>
  ),
});

// Fixed smoothing tolerance, matching shr-admin's race-assets upload flow.
const GPX_EPSILON_M = 50;
const MAX_GPX_BYTES = 20 * 1024 * 1024;

export interface RouteSubmitDialogProps {
  open: boolean;
  onClose: () => void;
  raceId: string;
  raceTitle: string;
}

interface GpxInfo {
  fileName: string;
  text: string;
  pointCount: number;
}

export default function RouteSubmitDialog({ open, onClose, raceId, raceTitle }: RouteSubmitDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [gpxInfo, setGpxInfo] = useState<GpxInfo | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointInput[]>([]);
  const [notes, setNotes] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      setGpxInfo(null);
      setCheckpoints([]);
      setNotes('');
      setFileError(null);
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

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  const loadGpxFile = useCallback((file: File) => {
    setFileError(null);
    setSubmitError(null);
    if (!/\.gpx$/i.test(file.name)) {
      setFileError('Please choose a .gpx file.');
      return;
    }
    if (file.size > MAX_GPX_BYTES) {
      setFileError('That file is larger than 20 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== 'string') {
        setFileError('Could not read that file.');
        return;
      }
      const pointCount = countGpxTrackPoints(text);
      if (pointCount === 0) {
        setFileError('No track points were found in that GPX file.');
        return;
      }
      setGpxInfo({ fileName: file.name, text, pointCount });
      setCheckpoints([]);
    };
    reader.onerror = () => setFileError('Could not read that file.');
    reader.readAsText(file);
  }, []);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadGpxFile(file);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadGpxFile(file);
    e.target.value = '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!UPDATES_EMAIL || !gpxInfo) return;

    let geojson: string;
    try {
      ({ geojson } = gpxToRouteGeoJson(gpxInfo.text, GPX_EPSILON_M, checkpoints));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not process that GPX file.');
      return;
    }

    const subject = `Route submission for ${raceTitle} (${raceId})`;
    const trimmedNotes = notes.trim();
    const body =
      `To ${toWhomItMayConcern()}:\n\n` +
      `Please find below a route for ${raceTitle} (${raceId}).\n` +
      (trimmedNotes ? `\nAdditional notes:\n${trimmedNotes}\n` : '') +
      `\n---\n\n` +
      `!-- PLEASE DO NOT EDIT BELOW THIS LINE --\n` +
      `File: races/${raceId}/route.geojson\n` +
      `${geojson}\n` +
      `!-- END OF SENSITIVE SECTION\n`;

    window.location.href = `mailto:${UPDATES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(foldEmailBody(body))}`;
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
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Submit a route for {raceTitle}</h2>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Upload a GPX file of the route, optionally mark checkpoints, then send it to us by
          email for review. The track will be smoothed automatically and timestamps or other
          device data are never included.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex min-h-[8rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-6 text-center transition ${
            isDragging
              ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
              : 'border-gray-300 bg-gray-50/60 hover:border-gray-400 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-slate-500'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml"
            className="sr-only"
            onChange={handleFileInputChange}
          />
          {gpxInfo ? (
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-slate-200 break-all">{gpxInfo.fileName}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                {gpxInfo.pointCount.toLocaleString()} track points loaded — click or drag to replace
              </p>
            </div>
          ) : (
            <div className="text-gray-500 dark:text-slate-400">
              <p className="text-sm font-medium">Drop your .gpx file here</p>
              <p className="text-xs">or click to browse (max 20 MB)</p>
            </div>
          )}
        </div>

        {fileError && <p className="text-sm text-red-700 dark:text-red-300">{fileError}</p>}

        {gpxInfo && <GpxCheckpointMap gpxText={gpxInfo.text} onChange={setCheckpoints} />}

        <div>
          <label htmlFor="route-notes" className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">
            Notes (optional)
          </label>
          <textarea
            id="route-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {submitError && <p className="text-sm text-red-700 dark:text-red-300">{submitError}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!gpxInfo}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send by email
          </button>
        </div>
      </form>
    </dialog>
  );
}
