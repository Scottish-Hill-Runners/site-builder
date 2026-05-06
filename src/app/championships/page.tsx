'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchGzipJson } from '@/lib/client-results-fetch';

interface ChampionshipData {
  slug: string;
  title: string;
  contents: string;
  years: { [year: string]: string[] };
}

export default function ChampionshipsPage() {
  const [championships, setChampionships] = useState<ChampionshipData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadChampionships() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await fetchGzipJson<ChampionshipData[]>(
          '/championships.json.gz'
        );

        if (!isCancelled) {
          if (result.status === 'ok') {
            setChampionships(result.data);
          } else if (result.status === 'not-found') {
            setErrorMessage('Championship data not found.');
          } else {
            throw result.error;
          }
        }
      } catch (error) {
        console.error('Failed to fetch championships:', error);
        if (!isCancelled) {
          setErrorMessage(
            'Failed to load championships. Please try again later.'
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadChampionships();
    return () => {
      isCancelled = true;
    };
  }, []);

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
            <li
              className="font-semibold text-slate-900 dark:text-slate-100"
              aria-current="page"
            >
              Championships
            </li>
          </ol>
        </nav>

        <h1 className="mb-8 text-4xl font-bold text-slate-900 dark:text-slate-100">
          Championships
        </h1>

        {isLoading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              Loading championships...
            </p>
          </div>
        ) : errorMessage ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-2 font-semibold text-red-600">{errorMessage}</p>
            <p className="text-gray-600 dark:text-slate-300">
              Try again in a few minutes.
            </p>
          </div>
        ) : championships.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              No championships available.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {championships.map((championship) => (
              <Link
                key={championship.slug}
                href={`/championships/${championship.slug}`}
                className="group rounded-lg bg-white p-6 shadow-md transition-all hover:shadow-lg hover:scale-105 dark:bg-slate-900"
              >
                <h2 className="text-xl font-semibold text-blue-600 group-hover:text-blue-800 dark:text-blue-400 dark:group-hover:text-blue-300">
                  {championship.title}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {Object.keys(championship.years).length} years of championship
                  data
                </p>
                <div className="mt-4 inline-block rounded-md bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                  View →
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
