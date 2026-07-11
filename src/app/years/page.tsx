import Link from 'next/link';
import {
  loadAvailableYears,
  loadRecentRaceLinkTargets,
} from '@/lib/results-data';

export default async function YearsLandingPage() {
  const [recentRaces, years] = await Promise.all([
    loadRecentRaceLinkTargets().catch((error: unknown) => {
      console.error('Failed to load recent race targets:', error);
      return [];
    }),
    loadAvailableYears().catch((error: unknown) => {
      console.error('Failed to load available years:', error);
      return [];
    }),
  ]);

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
              Results
            </li>
          </ol>
        </nav>

        <h1 className="mb-2 text-4xl font-bold text-gray-900 dark:text-slate-50">
          Results
        </h1>
        <p className="mb-8 text-sm text-slate-600 dark:text-slate-300">
          Browse recent race results or{' '}
          <a href="#year-archive" className="text-blue-700 underline hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200">
            jump into the full yearly archive
          </a>
          .
        </p>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-slate-100">
            Recent Results
          </h2>
          {recentRaces.length === 0 ? (
            <div className="rounded-lg bg-white p-6 text-sm text-gray-600 shadow-md dark:bg-slate-900 dark:text-slate-300">
              No recent race results are available yet.
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recentRaces.map((race) => (
                <li key={race.raceId}>
                  <Link
                    href={`/races/${encodeURIComponent(race.raceId)}?year=${encodeURIComponent(race.year)}`}
                    className="block rounded-lg border border-gray-200 bg-white px-4 py-3 transition hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    <div className="font-semibold text-blue-700 dark:text-blue-300">
                      {race.title}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-slate-300">
                      {race.year} results
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="year-archive">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-slate-100">
            Browse By Year
          </h2>
          {years.length === 0 ? (
            <div className="rounded-lg bg-white p-6 text-sm text-gray-600 shadow-md dark:bg-slate-900 dark:text-slate-300">
              No yearly archives are available yet.
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {years.map((year) => (
                <li key={year}>
                  <Link
                    href={`/years/${encodeURIComponent(year)}`}
                    className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-center font-semibold text-blue-700 transition hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
                  >
                    {year}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
