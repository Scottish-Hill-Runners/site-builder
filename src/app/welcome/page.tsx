import type { Metadata } from 'next';
import Link from 'next/link';
import ToWhomItMayConcern from '@/components/ToWhomItMayConcern';

export const metadata: Metadata = {
  title: 'Welcome',
  description:
    'Welcome to the new Scottish Hill Runners site. ' +
    'Explore Calendar, Runner, Championships, Results, and Races.',
};

const featureLinks = [
  {
    title: 'Calendar',
    href: '/calendar',
    description: (
        <>
            Find out what&apos;s happening when in Scottish hill running with the new calendar.
            Whether you&apos;re looking for the next Bog&apos;nBurn,
            planning your running year around the Scottish Hill Running Championships,
            or just after a short quick link to some recent results -
            the calendar is a great place to explore!
        </>
      ),
  },
  {
    title: 'Runner',
    href: '/runner',
    description: (
        <>
            The Runner page brings all your race results together in one place.
            Check out your own results, or search for a rival runner to
            see how they&apos;ve been doing. And if you see a mistake,
            you can submit a correction request by email!
        </>
      ),
  },
  {
    title: 'Championships',
    href: '/championships',
    description: (
        <>
            Current standings, results, and information about all the ongoing championship series.
            We have results going back decades, so you can explore the history of the
            sport and its legendary champions. This is a centrepiece of our long term
            goal of providing a comprehensive archive of Scottish hill running results.
            Help fill in the gaps by submitting corrections for any results you know to be wrong!
        </>
      ),
  },
  {
    title: 'Results',
    href: '/years',
    description: (
        <>
            Find the latest results,
            or explore the archive of historic results across the years.
            Did you know you can view <span className="italic">all </span>
            the results for a given race, or even a given year?
            Use the filters to find runners in your club, or in your age category,
            and see how you stack up against the competition.
        </>
      ),
  },
  {
    title: 'Races',
    href: '/races',
    description: (
        <>
            An exhaustive list of all the races that have ever been.
            Features a map view so you can quickly find a race near you.
            The map only shows races when it knows the location,
            so as more races get GPX files, the more comprehensive it will get.
            Remind your race organiser to add one today!
        </>
        ),
  },
  {title: 'Correcting mistakes',
    href: 'https://admin.scottishhillrunners.uk',
    description: (
        <>
            A key feature of the new site is it gives <strong>you </strong> the ability to correct mistakes.
            If you see a result with your name misspelt, wrong club or category,
            you can submit a correction by sending an email to the <ToWhomItMayConcern />
            &nbsp; (the link will guide you in composing the email).
            An admin will review and apply your correction with the click of a button!
        </>
    ),
  }
];

export default function WelcomePage() {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 dark:from-slate-950 dark:to-slate-900 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-5xl">
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
              Welcome
            </li>
          </ol>
        </nav>

        <section className="mb-8 rounded-xl border border-blue-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <h1 className="mb-3 text-4xl font-bold text-slate-900 dark:text-slate-50">
            Welcome to the new Scottish Hill Runners site!
          </h1>
          <p className="max-w-3xl text-base text-slate-700 dark:text-slate-300">
            If you arrived from an old site page, you are in the right place!
            The new site keeps everything in one home: races, results, calendar,
            and championships, with faster navigation and clearer pages. Mobile
            friendly and accessible, it&apos;s designed to help you find what
            you need quickly, whether you are a runner, race organiser, or just browsing.
          </p>
          <div className="mt-5">
            <Link
              href="/"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Go to Homepage
            </Link>
          </div>
        </section>

        <section aria-label="Site feature overview">
          <h2 className="mb-4 text-2xl font-semibold text-slate-900 dark:text-slate-50">
            So, what&apos;s new? Here are some highlights.
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {featureLinks.map((feature) => (
              <Link
                key={feature.href}
                href={feature.href}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-blue-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <h3 className="text-lg font-semibold text-slate-900 group-hover:text-blue-700 dark:text-slate-50 dark:group-hover:text-blue-300">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {feature.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}