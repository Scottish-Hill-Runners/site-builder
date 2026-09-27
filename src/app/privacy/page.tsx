"use client";
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

async function getPrivacyMarkdown() {
  // Read from public/privacy.md at build time
  const res = await fetch('/privacy.md');
  if (!res.ok) throw new Error('Failed to load privacy policy');
  return res.text();
}

export default function PrivacyPage() {
  const [content, setContent] = React.useState<string>('');

  React.useEffect(() => {
    getPrivacyMarkdown().then(setContent).catch(() => setContent('Failed to load privacy policy.'));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <article className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-li:marker:text-slate-500 dark:prose-invert dark:prose-headings:text-slate-50 dark:prose-li:marker:text-slate-400">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </article>
    </main>
  );
}
