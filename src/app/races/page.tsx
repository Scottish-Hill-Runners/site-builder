import Link from 'next/link';
import { loadAllRaces, loadCalendar } from '@/lib/results-data';
import RaceListFilter from '@/app/races/race-list-filter';
import type { RaceInfo } from '@/types/datatable';

export default async function RaceListPage() {
  const races = await loadAllRaces()
    .then((allRaces) => {
      return Object.entries(allRaces)
        .map(([raceId, race]) => ({ raceId, ...race }))
        .sort((a, b) =>
          (a.title ?? a.raceId).localeCompare(b.title ?? b.raceId)
        );
    })
    .catch((error: unknown) => {
      console.error('Failed to load races list:', error);
      return [] as Array<RaceInfo & { raceId: string }>;
    });

  const calendar = await loadCalendar().catch((error: unknown) => {
    console.error('Failed to load calendar:', error);
    return [];
  });

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 dark:from-slate-950 dark:to-slate-900 sm:px-6 lg:px-8"
    >
      <div className="max-w-4xl mx-auto">
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
            <li className="font-semibold text-slate-900 dark:text-slate-100">
              Races
            </li>
          </ol>
        </nav>
        <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-slate-50">
          Races
        </h1>
        {races.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              No races available right now.
            </p>
          </div>
        ) : (
          <RaceListFilter races={races} calendar={calendar} />
        )}
      </div>
    </main>
  );
}
