'use client';

import { useEffect, useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import { markdownRehypePlugins, remarkInlineHtmlOnly } from '@/lib/markdown-html';
import type { RaceReport } from '@/types/race-report';

type ReportsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; reports: RaceReport[] };

export default function RaceReports({ raceId }: { raceId: string }) {
  const [state, setState] = useState<ReportsState>({ status: 'loading' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const panelId = useId();

  useEffect(() => {
    let cancelled = false;
    async function loadReports() {
      const result = await fetchGzipJson<RaceReport[]>(
        `/reports/${encodeURIComponent(raceId)}.json.gz`
      );
      if (cancelled) return;
      if (result.status === 'ok') {
        setState({ status: 'loaded', reports: result.data });
      } else {
        console.error('Failed to load race reports:', result.status === 'error' ? result.error : 'Report bundle not found');
        setState({ status: 'error' });
      }
    }
    loadReports();
    return () => { cancelled = true; };
  }, [raceId]);

  if (state.status === 'loading') {
    return <p role="status" className="text-sm text-gray-600 dark:text-slate-300">Loading race reports...</p>;
  }
  if (state.status === 'error') {
    return <p role="alert" className="text-sm text-red-700 dark:text-red-300">Failed to load race reports. Please try again later.</p>;
  }
  if (state.reports.length === 0) {
    return <p className="text-sm text-gray-600 dark:text-slate-300">No race reports available.</p>;
  }

  const reports = [...state.reports].sort(
    (a, b) => b.year - a.year || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
  );
  return (
    <div className="w-full space-y-3">
      {reports.map((report, index) => {
        const expanded = expandedId === report.slug;
        const reportPanelId = `${panelId}-${index}`;
        const title = report.title?.trim() || (report.slug === String(report.year) ? 'Race report' : `Race report (${report.slug.slice(5)})`);
        return (
          <article key={report.slug} className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3>
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : report.slug)}
                aria-expanded={expanded}
                aria-controls={reportPanelId}
                className="flex w-full items-start justify-between rounded-lg p-4 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:hover:bg-slate-800"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{report.year}</span>
                  <span className="mt-1 block text-lg font-semibold leading-tight text-gray-900 dark:text-slate-50">{title}</span>
                  {report.author && <span className="mt-1 block text-sm font-normal text-gray-600 dark:text-slate-300">By {report.author}</span>}
                  {!expanded && report.excerpt && <span className="mt-2 block line-clamp-2 text-sm font-normal text-gray-600 dark:text-slate-300">{report.excerpt}</span>}
                </span>
                <span aria-hidden="true" className={`ml-4 flex-shrink-0 text-xl text-gray-400 transition-transform dark:text-slate-500 ${expanded ? 'rotate-180' : ''}`}>▼</span>
              </button>
            </h3>
            <div id={reportPanelId} hidden={!expanded} className="border-t border-gray-100 bg-gray-50 px-4 pb-4 dark:border-slate-800 dark:bg-slate-800/60">
              {expanded && <div className="prose prose-sm mt-4 max-w-none text-gray-700 dark:prose-invert dark:text-slate-200">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkInlineHtmlOnly]} rehypePlugins={markdownRehypePlugins}>
                  {report.content}
                </ReactMarkdown>
              </div>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
