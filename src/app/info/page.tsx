import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAllInfoItems } from '@/lib/info';

export { getAllInfoItems };

export async function InfoPageContent({ slug = 'index' }: { slug?: string }) {
  const allItems = await getAllInfoItems();
  const infoPage = allItems.find((item) => item.slug === slug) ?? null;

  // For other pages, show as a detail view
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
            <Link href="/info" className="text-blue-600 hover:text-blue-800">
              Info
            </Link>
          </li>
          {slug !== 'index' && (
            <>
              <li aria-hidden="true">/</li>
              <li
                className="font-semibold text-slate-900 dark:text-slate-100"
                aria-current="page"
              >
                {infoPage?.title ?? slug}
              </li>
            </>
          )}
        </ol>
      </nav>

      {infoPage === null ? (
        <p className="text-slate-600 dark:text-slate-300">Page not found.</p>
      ) : (
        <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-li:marker:text-slate-500 dark:prose-invert dark:prose-headings:text-slate-50 dark:prose-li:marker:text-slate-400">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {infoPage.content.replace(/\u00a0/g, ' ')}
            </ReactMarkdown>
          </div>
        </article>
      )}
    </div>
  );
}

export default async function InfoPage() {
  return <InfoPageContent />;
}
