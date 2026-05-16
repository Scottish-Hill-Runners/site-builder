'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import RaceResultsDataTable from '@/components/RaceResultsDataTable';
import {
  fetchJsonWithApiFallback,
  fetchGzipJson,
} from '@/lib/client-results-fetch';
import {
  buildResultsEditUrl,
  normalizeResultYear,
} from '@/lib/results-correction-link';
import type { RaceInfo, RaceResult } from '@/types/datatable';
import type { ResultsFocusContext } from '@/types/datatable';

interface YearPageClientProps {
  year: string;
}

export default function YearPageClient({ year }: YearPageClientProps) {
  const searchParams = useSearchParams();
  const initialRaceFilter = searchParams.get('race') ?? '';
  const [results, setResults] = useState<RaceResult[] | null>(null);
  const [races, setRaces] = useState<{ [raceId: string]: RaceInfo }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [focusedResultContext, setFocusedResultContext] =
    useState<ResultsFocusContext | null>(null);
  const fallbackRaceId = results?.[0]?.raceId ?? null;
  const fallbackYear = normalizeResultYear(year);
  const correctionRaceId = focusedResultContext?.raceId ?? fallbackRaceId;
  const correctionYear = focusedResultContext?.year ?? fallbackYear;
  const correctionLink =
    correctionRaceId && correctionYear
      ? buildResultsEditUrl(correctionRaceId, correctionYear)
      : null;

  useEffect(() => {
    let isCancelled = false;

    async function loadYearData() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsNotFound(false);

      try {
        const [result, racesResponse] = await Promise.all([
          fetchJsonWithApiFallback<RaceResult[]>(
            `/api/years/${encodeURIComponent(year)}`,
            `/results/${encodeURIComponent(year)}.json.gz`
          ),
          fetchGzipJson<{ [raceId: string]: RaceInfo }>(
            '/results/races.json.gz'
          ),
        ]);
        if (!isCancelled) {
          if (result.status === 'ok') {
            setRaces(racesResponse.status === 'ok' ? racesResponse.data : {});
            setResults(result.data);
          } else if (result.status === 'not-found') {
            setIsNotFound(true);
            setResults(null);
          } else {
            throw result.error;
          }
        }
      } catch (error) {
        console.error('Failed to fetch year data on client:', error);
        if (!isCancelled) {
          setErrorMessage(
            'Failed to load year results. Please try again later.'
          );
          setResults(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadYearData();
    return () => {
      isCancelled = true;
    };
  }, [year]);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 dark:from-slate-950 dark:to-slate-900 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
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
              {year} Results
            </li>
          </ol>
        </nav>

        <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-slate-50">
          {year} Results
        </h1>

        {isLoading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              Loading year results...
            </p>
          </div>
        ) : isNotFound ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              No results found for {year}.
            </p>
            <Link
              href="/races"
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Back to Races
            </Link>
          </div>
        ) : errorMessage ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-2 font-semibold text-red-600">{errorMessage}</p>
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              Try again in a few minutes.
            </p>
          </div>
        ) : results ? (
          <div className="space-y-4">
            <RaceResultsDataTable
              data={results}
              races={races}
              showRaceColumn
              showRaceFilter
              initialRaceFilter={initialRaceFilter}
              showYearFilter={false}
              enableRowFocus
              onFocusContextChange={setFocusedResultContext}
            />
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
              <p className="font-semibold">Spot an error in these results?</p>
              {correctionLink ? (
                <>
                  <p className="mt-1">
                    Submit a correction via{' '}
                    <a
                      href={correctionLink}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:decoration-blue-700 dark:hover:text-blue-200"
                    >
                      the results editor
                    </a>
                    .
                  </p>
                  {focusedResultContext?.source === 'selected-row' && (
                    <p className="mt-2 text-xs text-blue-800 dark:text-blue-200">
                      Using selected row context: {focusedResultContext.raceId}{' '}
                      ({focusedResultContext.year}).
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1">
                  Select a result row to generate an edit link for the correct
                  race and year.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              No year data available.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
