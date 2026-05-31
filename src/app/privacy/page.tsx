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
    <main className="prose prose-neutral mx-auto px-4 py-8 max-w-3xl">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </main>
  );
}
