'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { fetchDocuments, type RemoteDocument } from '@/lib/documents-api';

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function matchCount(doc: RemoteDocument, tags: string[]): number {
  if (tags.length === 0) return 0;
  const docTags = new Set(
    // tags may come through as non-strings (e.g. unquoted numbers in YAML)
    (doc.tags ?? []).map((tag) => String(tag).toLowerCase())
  );
  return tags.reduce((count, tag) => count + (docTags.has(tag) ? 1 : 0), 0);
}

export default function DocumentsPageClient() {
  const searchParams = useSearchParams();
  const tags = parseTags(searchParams.get('tags'));
  const [documents, setDocuments] = useState<RemoteDocument[]>([]);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchDocuments(controller.signal)
      .then((result) => {
        setDocuments(result.documents);
        setStale(result.stale);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError('Documents are temporarily unavailable.');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const matchingDocuments = useMemo(
    () => documents
      .map((doc) => ({ doc, matches: matchCount(doc, tags) }))
      .filter((entry) => tags.length === 0 || entry.matches > 0)
      .sort((a, b) => b.matches - a.matches)
      .map((entry) => entry.doc),
    [documents, tags]
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-4 text-sm text-slate-500 dark:text-slate-400"
      >
        <ol role="list" className="flex flex-wrap gap-2">
          <li>
            <Link href="/" className="text-blue-600 hover:text-blue-800">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li
            className="font-semibold text-slate-900 dark:text-slate-100"
            aria-current="page"
          >
            Documents
          </li>
        </ol>
      </nav>
      <h1 className="mb-8 text-3xl font-bold text-slate-900 dark:text-slate-50">
        {tags.length > 0 ? "Matching documents" : 'All Documents'}
      </h1>
      {stale && (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">
          Showing the last available document list.
        </p>
      )}
      {loading ? (
        <p className="text-slate-600 dark:text-slate-300">
          Loading documents…
        </p>
      ) : error ? (
        <p className="text-slate-600 dark:text-slate-300">{error}</p>
      ) : (
        <div className="mb-8">
          <ul className="space-y-6">
            {matchingDocuments.length > 0 ? (
              matchingDocuments.map((doc) => (
                <li key={doc.assetId}>
                  <Link
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-semibold text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    {doc.title ?? doc.publicId}
                  </Link>
                  {doc.description && (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {doc.description}
                    </p>
                  )}
                </li>
              ))
            ) : (
              <li>
                {tags.length === 0
                  ? 'No documents available.'
                  : `No documents match the selected tags: ${tags.join(', ')}.`}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
