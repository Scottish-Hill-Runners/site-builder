'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChampionshipData {
  slug: string;
  title: string;
  contents: string;
  years: { [year: string]: string[] };
}

interface ChampionshipPageClientProps {
  series: string;
}

export default function ChampionshipPageClient({
  series,
}: ChampionshipPageClientProps) {
  const [data, setData] = useState<ChampionshipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadChampionshipData() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsNotFound(false);

      try {
        const result = await fetchGzipJson<ChampionshipData[]>(
          '/championships.json.gz'
        );

        if (!isCancelled) {
          if (result.status === 'ok') {
            const championship = result.data.find((c) => c.slug === series);
            if (championship) {
              setData(championship);
            } else {
              setIsNotFound(true);
            }
          } else if (result.status === 'not-found') {
            setIsNotFound(true);
          } else {
            throw result.error;
          }
        }
      } catch (error) {
        console.error('Failed to fetch championship data on client:', error);
        if (!isCancelled) {
          setErrorMessage(
            'Failed to load championship data. Please try again later.'
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadChampionshipData();
    return () => {
      isCancelled = true;
    };
  }, [series]);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 dark:from-slate-950 dark:to-slate-900 sm:px-6 lg:px-8"
    >
      <div className="max-w-4xl mx-auto">
        <nav
          aria-label="Breadcrumb"
          className="mb-6 text-sm text-slate-500 dark:text-slate-400"
        >
          <ol role="list" className="flex flex-wrap gap-2">
            <li>
              <Link href="/" className="text-blue-600 hover:text-blue-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href="/championships"
                className="text-blue-600 hover:text-blue-800"
              >
                Championships
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li
              className="font-semibold text-slate-900 dark:text-slate-100"
              aria-current="page"
            >
              {isLoading ? 'Loading...' : (data?.title ?? series)}
            </li>
          </ol>
        </nav>

        {isLoading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              Loading championship...
            </p>
          </div>
        ) : isNotFound ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              Championship not found.
            </p>
            <Link
              href="/championships"
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Back to Championships
            </Link>
          </div>
        ) : errorMessage ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-2 font-semibold text-red-600">{errorMessage}</p>
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              Try again in a few minutes or choose another championship.
            </p>
            <Link
              href="/championships"
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Back to Championships
            </Link>
          </div>
        ) : data ? (
          <div className="rounded-lg bg-white p-8 shadow-md dark:bg-slate-900">
            <h1 className="mb-2 text-4xl font-bold text-slate-900 dark:text-slate-100">
              {data.title}
            </h1>
            <div className="mb-6 flex flex-wrap gap-2">
              {Object.keys(data.years)
                .sort((a, b) => Number(b) - Number(a))
                .map((year) => (
                  <Link
                    key={year}
                    href={`/championships/${encodeURIComponent(series)}/${encodeURIComponent(year)}`}
                    className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {year}
                  </Link>
                ))}
            </div>
            <div className="prose dark:prose-invert prose-sm sm:prose-base max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data.contents}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
