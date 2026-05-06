import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getClubItems } from '@/app/clubs/page';

interface ClubSlugPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const items = await getClubItems();
  return items.map((item) => ({ slug: item.slug }));
}

export default async function ClubSlugPage({ params }: ClubSlugPageProps) {
  const { slug } = await params;
  const items = await getClubItems();
  const club = items.find((item) => item.slug === slug) ?? null;

  const editUrl = `https://admin.scottishhillrunners.uk/clubs/${encodeURIComponent(slug)}`;

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
          <li>
            <Link href="/clubs" className="text-blue-600 hover:text-blue-800">
              Clubs
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li
            className="font-semibold text-slate-900 dark:text-slate-100"
            aria-current="page"
          >
            {club?.name ?? slug}
          </li>
        </ol>
      </nav>

      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <h1 className="mb-6 text-3xl font-bold text-slate-900 dark:text-slate-50">
          {club?.name ?? slug}
        </h1>

        {club?.web && (
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Web:{' '}
            <a
              href={club.web}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {club.web}
            </a>
          </p>
        )}

        {club === null || club.content.trim() === '' ? (
          <p className="text-slate-600 dark:text-slate-300">
            No information available.
          </p>
        ) : (
          <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-li:marker:text-slate-500 dark:prose-invert dark:prose-headings:text-slate-50 dark:prose-li:marker:text-slate-400">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {club.content.replace(/\u00a0/g, ' ')}
            </ReactMarkdown>
          </div>
        )}

        <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you a club official?{' '}
            <a
              href={editUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:decoration-blue-700 dark:hover:text-blue-300"
            >
              Edit this club&apos;s information
            </a>
            .
          </p>
        </div>
      </article>
    </div>
  );
}
