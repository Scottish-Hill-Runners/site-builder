'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import RaceDetailsTabs from '@/components/RaceDetailsTabs';
import { fetchJsonWithApiFallback } from '@/lib/client-results-fetch';
import type { RaceImageItem } from '@/lib/imageCollections';
import type { RaceData } from '@/types/datatable';

type RaceImageForRender = RaceImageItem & { imageUrl: string };

interface RaceImagesForRender {
  hero: RaceImageForRender[];
  gallery: RaceImageForRender[];
}

interface RacePageClientProps {
  raceId: string;
  raceImages: RaceImagesForRender | null;
}

export default function RacePageClient({
  raceId,
  raceImages,
}: RacePageClientProps) {
  const searchParams = useSearchParams();
  const initialYearFilter = searchParams.get('year') ?? '';
  const initialTab = initialYearFilter ? 'results' : undefined;
  const [data, setData] = useState<RaceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadRaceData() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsNotFound(false);

      try {
        const result = await fetchJsonWithApiFallback<RaceData>(
          `/api/races/${encodeURIComponent(raceId)}`,
          `/results/${encodeURIComponent(raceId)}.json.gz`
        );

        if (!isCancelled) {
          if (result.status === 'ok') {
            setData(result.data);
          } else if (result.status === 'not-found') {
            setIsNotFound(true);
            setData(null);
          } else {
            throw result.error;
          }
        }
      } catch (error) {
        console.error('Failed to fetch race data on client:', error);
        if (!isCancelled) {
          setErrorMessage(
            'Failed to load race results. Please try again later.'
          );
          setData(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadRaceData();
    return () => {
      isCancelled = true;
    };
  }, [raceId]);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 dark:from-slate-950 dark:to-slate-900 sm:px-6 lg:px-8"
    >
      <div className="max-w-6xl mx-auto">
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
            <li>
              <Link href="/races" className="text-blue-600 hover:text-blue-800">
                Races
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li
              className="font-semibold text-slate-900 dark:text-slate-100"
              aria-current="page"
            >
              {isLoading ? 'Loading...' : (data?.info.title ?? raceId)}
            </li>
          </ol>
        </nav>

        {isLoading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              Loading race results...
            </p>
          </div>
        ) : isNotFound ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              Race not found.
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
              Try again in a few minutes or choose another race.
            </p>
            <Link
              href="/races"
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Back to Races
            </Link>
          </div>
        ) : data ? (
          <>
            <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-slate-50">
              {data.info.title}
            </h1>
            <RaceDetailsTabs
              raceId={raceId}
              race={data.info}
              contents={data.contents}
              hasGpx={data.hasGpx}
              hasRaceMap={Boolean(data.hasRaceMap)}
              routeGeojson={data.routeGeojson}
              elevationChartData={data.elevationChartData}
              results={data.results}
              resultsError={null}
              heroImages={raceImages?.hero ?? []}
              galleryImages={raceImages?.gallery ?? []}
              initialTab={initialTab}
              initialYearFilter={initialYearFilter}
            />
          </>
        ) : (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              No race data available.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
