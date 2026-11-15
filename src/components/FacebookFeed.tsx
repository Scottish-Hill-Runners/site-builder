'use client';

import { useEffect, useState } from 'react';
import { ADMIN_HOST } from '@/lib/site-config';

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

export default function FacebookFeed() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false);

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

  return (
    <section className="w-full mt-8" aria-labelledby="facebook-feed-heading">
      <h2 id="facebook-feed-heading" className="mb-6 text-2xl font-bold text-gray-900 dark:text-slate-50">
        Latest from SHR
      </h2>
      {error ? <p className="text-gray-500 dark:text-slate-400">The feed is temporarily unavailable.</p> :
        !posts ? <p className="text-gray-500 dark:text-slate-400">Loading feed...</p> :
          posts.length === 0 ? <p className="text-gray-500 dark:text-slate-400">No posts to show yet.</p> :
            <div className="space-y-4">
              {(showAll ? posts : posts.slice(0, 5)).map((post) => (
                <article key={post.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <time dateTime={post.createdTime} className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    {new Date(post.createdTime).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </time>
                  {post.message && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800 dark:text-slate-200">{post.message}</p>}
                  {post.images.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">
                    {post.images.map((image, index) => (
                      // Cloudinary serves these directly; the static export has no Next.js image optimizer.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={image.url} src={image.url} alt={image.description || `Photograph ${index + 1} accompanying this post`} loading="lazy" className="aspect-square w-full rounded object-cover" />
                    ))}
                  </div>}
                </article>
              ))}
              {posts.length > 5 && <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                {showAll ? 'Show fewer posts' : 'Show all posts'}
              </button>}
            </div>}
    </section>
  );
}
