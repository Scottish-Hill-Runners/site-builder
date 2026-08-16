import fs from 'fs';
import path from 'path';
import MarkdownIt from 'markdown-it';
import { progress } from './write-gz-util';
import { contentPath, contentRoot } from './content-paths';
import { updateSitemap } from './update-sitemap';

const markdown = new MarkdownIt({ html: true, linkify: true, typographer: true });
const routeDir = path.join(process.cwd(), 'src', 'app', 'faqs');
const routePath = path.join(routeDir, 'page.tsx');

function buildFAQs(): string[] {
  const sourcePath = contentPath('FAQs.md');

  if (!fs.existsSync(sourcePath)) {
    fs.rmSync(routeDir, { recursive: true, force: true });
    progress('FAQs.md not found, removed the /faqs route');
    return [];
  }

  const source = fs.readFileSync(sourcePath, 'utf8').replace(/\u00a0/g, ' ');
  const html = markdown.render(source);
  const page = `import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FAQs | Scottish Hill Runners',
};

const content = ${JSON.stringify(html)};

export default function FAQsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-white px-4 py-12 dark:bg-slate-950 sm:px-6">
      <div
        className="prose max-w-none text-gray-700 dark:prose-invert dark:text-slate-200"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </main>
  );
}
`;

  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(routePath, page, 'utf8');
  progress(`Built /faqs from ${sourcePath} (CONTENT_ROOT=${contentRoot()})`);

  return ['/faqs'];
}

updateSitemap(buildFAQs());
