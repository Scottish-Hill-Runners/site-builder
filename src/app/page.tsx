import Link from 'next/link';
import NewsList from '@/components/NewsList';
import AddNewsItemSection from '@/components/AddNewsItemSection';
import HomepageImageGrid from '@/components/HomepageImageGrid';
import { getRecentNewsItems } from '@/lib/news';

export default async function Home() {
  const newsItems = await getRecentNewsItems(10);
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-slate-950">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-start justify-start bg-white px-4 py-12 dark:bg-slate-950 sm:px-6">
        <div className="flex flex-col items-start gap-6 w-full">
          <section className="w-full mt-2">
            <HomepageImageGrid />
          </section>

          <section className="w-full mt-4">
            <Link
              href="/welcome"
              className="block rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 transition-colors hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100 dark:hover:bg-blue-950/50"
            >
              <span className="font-semibold">New here from the old site?</span>{' '}
              Start with Welcome.
            </Link>
          </section>

          <section className="w-full mt-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link
                href="/info"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Info
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Membership and guidance
                </p>
              </Link>
              <Link
                href="/calendar"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Calendar
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Upcoming race calendar
                </p>
              </Link>
              <Link
                href="/championships"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Championships
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Championship series
                </p>
              </Link>
              <Link
                href="/runner"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Runners
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  View all your race results (or your rivals!)
                </p>
              </Link>
              <Link
                href="/races"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Races
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Explore hill races
                </p>
              </Link>
              <Link
                href="/years"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Results
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Browse recent and historic results
                </p>
              </Link>
              <Link
                href="/epics"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Epics
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Long distance challenges
                </p>
              </Link>
              <Link
                href="/clubs"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Clubs
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Member clubs
                </p>
              </Link>
              <Link
                href="https://www.sientries.co.uk/event_series.php?series_id=601"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">Join now!</h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Become a member of SHR
                </p>
              </Link>
            </div>
          </section>

          <section className="w-full mt-8">
            <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-slate-50">
              Recent News
            </h2>
            <NewsList items={newsItems} />
            <AddNewsItemSection />
            <div className="mt-6 text-right">
              <Link
                href="/news"
                className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                Old news →
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
