import Link from 'next/link';
import Image from 'next/image';
import NewsList from '@/components/NewsList';
import { getRecentNewsItems } from '@/lib/news';
import { getHomepageImages } from '@/lib/imageCollections';

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function filenameToAltText(sourcePath: string): string {
  const fileName = sourcePath.split('/').pop() ?? sourcePath;
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return baseName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default async function Home() {
  const [newsItems, heroImages] = await Promise.all([
    getRecentNewsItems(10),
    getHomepageImages().then((imgs) => shuffled(imgs).slice(0, 6)),
  ]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-slate-950">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-start justify-start bg-white px-4 py-12 dark:bg-slate-950 sm:px-6">
        <div className="flex flex-col items-start gap-6 w-full">
          {heroImages.length > 0 && (
            <section className="w-full mt-2">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {heroImages.map((item, index) => (
                  <figure
                    key={item.sourcePath}
                    className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <Image
                      src={item.imageUrl}
                      alt={filenameToAltText(item.sourcePath)}
                      width={640}
                      height={360}
                      sizes="(min-width: 640px) 33vw, 50vw"
                      priority={index === 0}
                      unoptimized
                      className="h-32 w-full object-cover sm:h-36"
                      referrerPolicy="no-referrer"
                    />
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section className="w-full mt-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                href="/runner"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Runners
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Runner
                </p>
              </Link>
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
                href="/info/safety"
                className="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 dark:text-slate-50">
                  Safety
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  Safety rules and guidelines
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
            </div>
          </section>

          <section className="w-full mt-8">
            <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-slate-50">
              Recent News
            </h2>
            <NewsList items={newsItems} />
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
