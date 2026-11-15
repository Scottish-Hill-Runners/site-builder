'use client';

import { useEffect, useState } from 'react';
import { ADMIN_HOST } from '@/lib/site-config';
import type { NewsItem } from '@/lib/news';
import { NewsCard } from '@/components/NewsList';

type Post = {
  id: string;
  createdTime: string;
  message: string;
  images: { url: string; description?: string }[];
};

function isPost(value: unknown): value is Post {
  if (!value || typeof value !== 'object') return false;
  const post = value as Record<string, unknown>;
  return typeof post.id === 'string' &&
    typeof post.createdTime === 'string' && !Number.isNaN(Date.parse(post.createdTime)) &&
    typeof post.message === 'string' && Array.isArray(post.images) &&
    post.images.every((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const image = item as Record<string, unknown>;
      if (typeof image.url !== 'string' ||
          (image.description !== undefined && typeof image.description !== 'string')) return false;
      try {
        const url = new URL(image.url);
        return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com';
      } catch {
        return false;
      }
    });
}

export default function RecentUpdates({ newsItems }: { newsItems: NewsItem[] }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${ADMIN_HOST}/api/facebook-feed`, { signal: controller.signal });
        if (!response.ok) throw new Error('Feed unavailable');
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('posts' in data) ||
            !Array.isArray(data.posts) || !data.posts.every(isPost)) throw new Error('Invalid feed');
        setPosts(data.posts);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          console.error('Unable to load the feed', loadError);
          setError(true);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const entries = [
    ...newsItems.map((item) => ({ kind: 'news' as const, item, date: item.date })),
    ...(posts ?? []).map((item) => ({ kind: 'post' as const, item, date: item.createdTime })),
  ].sort((a, b) => {
    const aTime = Date.parse(a.date);
    const bTime = Date.parse(b.date);
    return (Number.isNaN(bTime) ? -Infinity : bTime) -
      (Number.isNaN(aTime) ? -Infinity : aTime);
  });
  const visible = showAll ? entries : entries.slice(0, 10);

  return (
    <>
      {error && <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">Facebook posts are temporarily unavailable.</p>}
      {!posts && !error && <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">Loading Facebook posts...</p>}
      {entries.length === 0 && posts && (
        <p className="py-8 text-center text-gray-500 dark:text-slate-400">No recent updates available.</p>
      )}
      <div className="w-full space-y-3">
        {visible.map((entry) => entry.kind === 'news' ? (
          <NewsCard
            key={`news-${entry.item.slug}`}
            item={entry.item}
            expanded={expandedId === entry.item.slug}
            onToggle={() => setExpandedId(expandedId === entry.item.slug ? null : entry.item.slug)}
          />
        ) : (
          <article key={`post-${entry.item.id}`} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <time dateTime={entry.item.createdTime} className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                {new Date(entry.item.createdTime).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
              </time>
              <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Facebook</span>
            </div>
            {entry.item.message && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800 dark:text-slate-200">{entry.item.message}</p>}
            {entry.item.images.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">
              {entry.item.images.map((image, index) => (
                // Cloudinary serves these directly; the static export has no Next.js image optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img key={image.url} src={image.url} alt={image.description || `Photograph ${index + 1} accompanying this post`} loading="lazy" className="aspect-square w-full rounded object-cover" />
              ))}
            </div>}
          </article>
        ))}
      </div>
      {entries.length > 10 && <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="mt-4 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
        {showAll ? 'Show fewer updates' : 'Show all updates'}
      </button>}
    </>
  );
}
