'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';

const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-800">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 dark:border-slate-600 dark:border-t-blue-400" />
    </div>
  ),
});

const ElevationProfile = dynamic(
  () => import('@/components/ElevationProfile'),
  {
    ssr: false,
  }
);
import remarkGfm from 'remark-gfm';
import RaceResultsDataTable from '@/components/RaceResultsDataTable';
import {
  buildResultsEditUrl,
  getLatestResultYear,
} from '@/lib/results-correction-link';
import { useUnits } from '@/components/UnitsProvider';
import { formatDistance, formatClimb } from '@/lib/units';
import type {
  RaceInfo,
  RaceResult,
  ResultsFocusContext,
} from '@/types/datatable';

interface RaceDetailsTabsProps {
  raceId: string;
  race: RaceInfo;
  contents: string;
  hasGpx: boolean;
  hasRaceMap: boolean;
  results: RaceResult[];
  resultsError: string | null;
  heroImage: { sourcePath: string; imageUrl: string } | null;
  galleryImages: Array<{ sourcePath: string; imageUrl: string }>;
  initialTab?: TabKey;
  initialYearFilter?: string;
}

type TabKey = 'results' | 'info' | 'gpx' | 'gallery';

function filenameToAltText(sourcePath: string): string {
  const fileName = sourcePath.split('/').pop() ?? sourcePath;
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return baseName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const TAB_STORAGE_KEY = 'raceDetails.activeTab';

export default function RaceDetailsTabs({
  raceId,
  race,
  contents,
  hasGpx,
  hasRaceMap,
  results,
  resultsError,
  heroImage,
  galleryImages,
  initialTab,
  initialYearFilter = '',
}: RaceDetailsTabsProps) {
  const { imperial } = useUnits();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (
      initialTab === 'results' ||
      initialTab === 'info' ||
      initialTab === 'gpx' ||
      initialTab === 'gallery'
    ) {
      return initialTab;
    }

    try {
      const saved = window.localStorage.getItem(TAB_STORAGE_KEY);
      if (
        saved === 'results' ||
        saved === 'info' ||
        saved === 'gpx' ||
        saved === 'gallery'
      )
        return saved as TabKey;
    } catch {}
    return 'info';
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch {}
  }, [activeTab]);
  const [focusedResultContext, setFocusedResultContext] =
    useState<ResultsFocusContext | null>(null);
  const hasRouteAssets = hasGpx || hasRaceMap;
  const hasGallery = galleryImages.length > 0;
  const pageDefaultYear = useMemo(
    () => getLatestResultYear(results),
    [results]
  );
  const correctionRaceId = focusedResultContext?.raceId ?? raceId;
  const correctionYear = focusedResultContext?.year ?? pageDefaultYear;
  const correctionLink =
    correctionRaceId && correctionYear
      ? buildResultsEditUrl(correctionRaceId, correctionYear)
      : null;
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'info', label: 'Race info' },
    { key: 'results', label: 'Results' },
  ];

  if (hasGallery) {
    tabs.push({ key: 'gallery', label: 'Gallery' });
  }

  if (hasRouteAssets) {
    tabs.push({ key: 'gpx', label: 'Route' });
  }

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div
        role="tablist"
        aria-label="Race details tabs"
        className="flex flex-wrap gap-2 border-b border-gray-200 p-3 dark:border-slate-800"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`race-tab-panel-${tab.key}`}
              id={`race-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-6">
        {activeTab === 'results' && (
          <div
            role="tabpanel"
            id="race-tab-panel-results"
            aria-labelledby="race-tab-results"
          >
            {resultsError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-950/40">
                <p className="mb-2 font-semibold text-red-700">
                  {resultsError}
                </p>
                <p className="text-sm text-red-600">
                  Try again in a few minutes or choose another race.
                </p>
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-4">
                <RaceResultsDataTable
                  data={results}
                  eras={race.eras}
                  enableRowFocus
                  initialYearFilter={initialYearFilter}
                  onFocusContextChange={setFocusedResultContext}
                />
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
                  <p className="font-semibold">
                    Spot an error in these results?
                  </p>
                  <p className="mt-1">
                    {correctionLink ? (
                      <>
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
                      </>
                    ) : (
                      'Select a result row to generate an edit link for the correct race and year.'
                    )}
                  </p>
                  {focusedResultContext?.source === 'selected-row' &&
                    correctionLink && (
                      <p className="mt-2 text-xs text-blue-800 dark:text-blue-200">
                        Using selected row context:{' '}
                        {focusedResultContext.raceId} (
                        {focusedResultContext.year}).
                      </p>
                    )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-slate-300">
                No results available for {race.title}.
              </p>
            )}
          </div>
        )}

        {activeTab === 'info' && (
          <div
            role="tabpanel"
            id="race-tab-panel-info"
            aria-labelledby="race-tab-info"
            className="space-y-6"
          >
            {heroImage && (
              <figure className="overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <Image
                  src={heroImage.imageUrl}
                  alt={`${race.title} hero image: ${filenameToAltText(heroImage.sourcePath)}`}
                  width={1600}
                  height={900}
                  sizes="(min-width: 1024px) 900px, 100vw"
                  unoptimized
                  priority
                  referrerPolicy="no-referrer"
                  className="h-56 w-full object-cover sm:h-72"
                />
              </figure>
            )}

            <div className="grid grid-cols-1 gap-2 text-sm text-gray-700 dark:text-slate-300 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-gray-900 dark:text-slate-100">
                  Venue:
                </span>{' '}
                {race.venue}
              </p>
              <p>
                <span className="font-semibold text-gray-900 dark:text-slate-100">
                  Distance:
                </span>{' '}
                {formatDistance(race.distance, imperial)}
              </p>
              {typeof race.climb === 'number' && (
                <p>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">
                    Climb:
                  </span>{' '}
                  {formatClimb(race.climb, imperial)}
                </p>
              )}
              {race.maleRecord && (
                <p>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">
                    Male record:
                  </span>{' '}
                  {race.maleRecord}
                </p>
              )}
              {race.femaleRecord && (
                <p>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">
                    Female record:
                  </span>{' '}
                  {race.femaleRecord}
                </p>
              )}
              {race.nonBinaryRecord && (
                <p>
                  <span className="font-semibold text-gray-900 dark:text-slate-100">
                    Non-binary record:
                  </span>{' '}
                  {race.nonBinaryRecord}
                </p>
              )}
              {race.web && (
                <p className="sm:col-span-2">
                  <span className="font-semibold text-gray-900 dark:text-slate-100">
                    Website:
                  </span>{' '}
                  <a
                    href={race.web}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {race.web}
                  </a>
                </p>
              )}
            </div>

            <div>
              {contents.trim() ? (
                <div className="prose prose-slate max-w-none prose-headings:text-gray-900 dark:prose-invert dark:prose-headings:text-slate-100">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {contents}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-slate-300">
                  No additional content available for this race.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
              <p className="font-semibold">Race organiser?</p>
              <p className="mt-1">
                Edit the race description via{' '}
                <a
                  href={`https://admin.scottishhillrunners.uk/races/${encodeURIComponent(raceId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:decoration-blue-700 dark:hover:text-blue-200"
                >
                  the race editor
                </a>
                .
              </p>
            </div>
          </div>
        )}

        {activeTab === 'gallery' && hasGallery && (
          <div
            role="tabpanel"
            id="race-tab-panel-gallery"
            aria-labelledby="race-tab-gallery"
            className="space-y-3"
          >
            <p className="text-sm text-gray-700 dark:text-slate-300">
              Photos from {race.title}.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {galleryImages.map((image, index) => (
                <figure
                  key={`${image.sourcePath}-${index}`}
                  className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-800"
                >
                  <Image
                    src={image.imageUrl}
                    alt={`${race.title} gallery image ${index + 1}: ${filenameToAltText(image.sourcePath)}`}
                    width={800}
                    height={600}
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                    unoptimized
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-48 w-full object-cover"
                  />
                </figure>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'gpx' && hasRouteAssets && (
          <div
            role="tabpanel"
            id="race-tab-panel-gpx"
            aria-labelledby="race-tab-gpx"
            className="space-y-4"
          >
            {hasGpx && (
              <>
                <RouteMap raceId={raceId} raceName={race.title} />
                <ElevationProfile raceId={raceId} raceName={race.title} />
              </>
            )}
            {hasRaceMap && (
              <div className="space-y-2">
                <p className="text-sm text-gray-700 dark:text-slate-300">
                  Race map preview:
                </p>
                <Image
                  src={`/results/${encodeURIComponent(raceId)}-map.webp`}
                  alt={`${race.title} race map`}
                  width={1200}
                  height={675}
                  unoptimized
                  className="w-full max-w-3xl rounded-lg border border-gray-200 shadow-sm dark:border-slate-700"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
