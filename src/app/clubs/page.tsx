import Link from 'next/link';
import { getClubItems } from '@/lib/clubs';
import ClubsFilter from './clubs-filter';

export { getClubItems };

export default async function ClubsPage() {
  const clubs = await getClubItems();
  const sorted = [...clubs].sort((a, b) => a.name.localeCompare(b.name));

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
            Clubs
          </li>
        </ol>
      </nav>
      <h1 className="mb-8 text-3xl font-bold text-slate-900 dark:text-slate-50">
        Clubs
      </h1>
      {sorted.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-300">
          No clubs available.
        </p>
      ) : (
        <ClubsFilter items={sorted} />
      )}
      <div className="mt-10 border-t border-slate-200 pt-6 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Is your club missing?{' '}
          <a
            href="https://admin.scottishhillrunners.uk/clubs"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:decoration-blue-700 dark:hover:text-blue-300"
          >
            Add it here
          </a>
          .
        </p>
      </div>
    </div>
  );
}
