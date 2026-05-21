'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface NewsItem {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
}

interface NewsListProps {
  items: NewsItem[];
}

export default function NewsList({ items }: NewsListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (slug: string) => {
    setExpandedId(expandedId === slug ? null : slug);
  };

  return (
    <div className="w-full space-y-3">
      {items.length === 0 ? (
        <p className="py-8 text-center text-gray-500 dark:text-slate-400">
          No news items available
        </p>
      ) : (
        items.map((item) => (
          <article
            key={item.slug}
            className="rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              onClick={() => toggleExpand(item.slug)}
              className="flex w-full items-start justify-between p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800"
              aria-expanded={expandedId === item.slug}
            >
              <div className="flex-1 min-w-0">
                <time className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  {new Date(item.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
                {expandedId !== item.slug &&
                <div>
                  <h3 className="mt-1 text-lg font-semibold leading-tight text-gray-900 dark:text-slate-50">
                    {item.title}
                  </h3>                 
                  <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-slate-300">
                    {item.excerpt}
                  </p>
                </div>}
              </div>
              <div className="ml-4 flex-shrink-0 flex items-center">
                <span
                  className={`text-xl text-gray-400 transition-transform dark:text-slate-500 ${
                    expandedId === item.slug ? 'rotate-180' : ''
                  }`}
                >
                  ▼
                </span>
              </div>
            </button>

            {expandedId === item.slug && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="prose prose-sm mt-4 max-w-none text-gray-700 dark:prose-invert dark:text-slate-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {item.content}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}
