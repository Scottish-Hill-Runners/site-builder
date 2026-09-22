'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { UPDATES_EMAIL } from '@/lib/site-config';
import ChampionshipRacesEditDialog from '@/components/ChampionshipRacesEditDialog';
import ChampionshipInfoEditDialog from '@/components/ChampionshipInfoEditDialog';
import { CalendarEntry, RaceInfo, ScoringRules } from '@/types/datatable';
import { formatCalendarDate } from '@/lib/dates';

interface ChampionshipData {
  slug: string;
  title: string;
  contents: string;
  years: { [year: string]: string[] };
  yearHasData?: { [year: string]: boolean };
  rules?: {
    default?: Partial<ScoringRules>;
    [year: string]: Partial<ScoringRules> | undefined;
  };
}

interface ChampionshipPageClientProps {
  series: string;
}

function fillInSchedule(
  data: ChampionshipData,
  calendarDates: Map<string, string[]> | null,
  raceMap: Map<string, RaceInfo> | null) {
  if (!data.contents.includes('@Schedule'))
    return data.contents;

  const latestYear = Object.keys(data.years)
    .filter((y) => data.years[y].length > 0)
    .sort((a, b) => parseInt(b) - parseInt(a))[0];
  const hasDistanceSlots = !!(data.rules as ChampionshipData['rules'])
    ?.default?.distanceSlots;
  let scheduleBlock = '';
  if (latestYear) {
    const raceIds = data.years[latestYear];
    const sortedRaceIds = [...raceIds].sort((a, b) => {
      const dateA = calendarDates?.get(`${latestYear}/${a}`)?.[0];
      const dateB = calendarDates?.get(`${latestYear}/${b}`)?.[0];

      if (dateA && dateB) return dateA.localeCompare(dateB);
      if (dateA) return -1;
      if (dateB) return 1;
      return a.localeCompare(b);
    });

    const items = sortedRaceIds
      .filter((id) => !id.startsWith('no-slug'))
      .map((raceId) => {
        const raceEntry = raceMap?.get(raceId);
        const title = raceEntry?.title ?? raceId;
        let distancePart = '';
        if (hasDistanceSlots) {
          const distance = raceEntry?.distance;
          if (distance !== undefined && !Number.isNaN(distance)) {
            const bucket = distance < 10 ? 'short' : distance > 20 ? 'long' : 'medium';
            distancePart = ` (${bucket})`;
          }
        }

        const isoDate = calendarDates?.get(`${latestYear}/${raceId}`)?.[0];
        const datePart = isoDate ? ` - ${formatCalendarDate(isoDate)}` : '';
        return `* [${title}](/races/${raceId})${distancePart}${datePart}`;
      })
      .join('\n');
    scheduleBlock = `## ${latestYear} race schedule\n\nThe ${raceIds.length} races in the ${latestYear} ${data.title} series are:\n\n${items}`;
  }

  return data.contents.replace('@Schedule', scheduleBlock);
}

export default function ChampionshipPageClient({
  series,
}: ChampionshipPageClientProps) {
  const [data, setData] = useState<ChampionshipData | null>(null);
  const [calendarDates, setCalendarDates] = useState<Map<string, string[]> | null>(null);
  const [raceMap, setRaceMap] = useState<Map<string, RaceInfo> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [raceScheduleDialogOpen, setRaceScheduleDialogOpen] = useState(false);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadChampionshipData() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsNotFound(false);

      try {
        const [result, calendarDates, raceMap] = await Promise.all([
          fetchGzipJson<ChampionshipData[]>('/championships.json.gz'),
          fetchGzipJson<CalendarEntry[]>('/calendar.json.gz'),
          fetchGzipJson<Map<string, RaceInfo>>('/results/races.json.gz'),
        ]);

        if (!isCancelled) {
          if (calendarDates.status === 'ok')
            setCalendarDates(new Map(calendarDates.data.map(entry => [`${entry.Date.substring(0, 4)}/${entry.raceId}`, [entry.Date]])));
          else
            throw new Error('Failed to load calendar dates');

          if (raceMap.status === 'ok')
            setRaceMap(new Map(Object.entries(raceMap.data)));
          else
            throw new Error('Failed to load race map');

          if (result.status === 'ok') {
            const championship = result.data.find((c) => c.slug === series);
            if (championship)
              setData(championship);
            setIsNotFound(!championship);
          } else if (result.status === 'not-found')
            setIsNotFound(true);
          else
            throw result.error;
        }
      } catch (error) {
        console.error('Failed to fetch championship data on client:', error);
        if (!isCancelled)
          setErrorMessage(
            'Failed to load championship data. Please try again later.'
          );
      } finally {
        if (!isCancelled)
          setIsLoading(false);
      }
    }

    loadChampionshipData();
    return () => { isCancelled = true };
  }, [series]);

  // The current season plus the upcoming one (which may not exist in the
  // frontmatter yet) are the only years editable via the schedule dialog.
  const latestYear = data
    ? Object.keys(data.years)
        .filter((year) => /^\d{4}$/.test(year))
        .sort((a, b) => Number(a) - Number(b))
        .at(-1)
    : undefined;
  const nextYear = latestYear ? String(Number(latestYear) + 1) : undefined;
  const editableYears = [latestYear, nextYear].filter((year): year is string => Boolean(year));
  const raceIdsByYear: { [year: string]: string[] } = {};
  for (const year of editableYears) {
    raceIdsByYear[year] = Array.isArray(data?.years[year]) ? data.years[year] : [];
  }

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
        ) : data?.contents ? (
          <div className="rounded-lg bg-white p-8 shadow-md dark:bg-slate-900">
            <h1 className="mb-2 text-4xl font-bold text-slate-900 dark:text-slate-100">
              {data.title}
            </h1>
            <div className="mb-6 flex flex-wrap gap-2">
              {Object.keys(data.years)
                .filter((year) => data.yearHasData?.[year] ?? true)
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
                {fillInSchedule(data, calendarDates, raceMap)}
              </ReactMarkdown>
            </div>
            {UPDATES_EMAIL && (
              <div className="mb-6">
                <br />
                <span>SHR administrator? Edit: </span>{' '}
                {editableYears.length > 0 && <>
                  <button
                    type="button"
                    onClick={() => setRaceScheduleDialogOpen(true)}
                    className="mb-6 mr-4 inline-block text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
                  >
                    race schedule
                  </button>
                </>}
                <button
                  type="button"
                  onClick={() => setInfoDialogOpen(true)}
                  className="mb-6 inline-block text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  championship info
                </button>
              </div>
            )}
          </div>
        ) : ''}
      {UPDATES_EMAIL && data && editableYears.length > 0 && (
        <ChampionshipRacesEditDialog
          open={raceScheduleDialogOpen}
          onClose={() => setRaceScheduleDialogOpen(false)}
          slug={data.slug}
          title={data.title}
          years={editableYears}
          raceIdsByYear={raceIdsByYear}
        />
      )}
      {UPDATES_EMAIL && data && (
        <ChampionshipInfoEditDialog
          open={infoDialogOpen}
          onClose={() => setInfoDialogOpen(false)}
          slug={data.slug}
          title={data.title}
          contents={data.contents}
        />
      )}
    </div>
    </main>
  );
}
