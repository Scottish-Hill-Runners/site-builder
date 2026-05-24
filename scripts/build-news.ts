import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { writeGz, progress } from './write-gz-util';
import { contentPath, contentRoot } from './content-paths';
import { updateSitemap } from './update-sitemap';

interface NewsItem {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function collectMarkdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectMarkdownFiles(entryPath);
    }

    return entry.name.endsWith('.md') ? [entryPath] : [];
  });
}

function buildNews(): string[] {
  const newsDir = contentPath('news');
  const outputDir = path.join(process.cwd(), 'public');
  const routes: string[] = [];

  if (!fs.existsSync(outputDir))
    fs.mkdirSync(outputDir, { recursive: true });

  if (!fs.existsSync(newsDir)) {
    console.warn('News directory not found, creating empty news.json.gz');
    writeGz(outputDir, 'news.json', JSON.stringify([]));
    return routes;
  }

  progress(`Reading news from ${newsDir} (CONTENT_ROOT=${contentRoot()})...`);

  const files = collectMarkdownFiles(newsDir);
  progress(`Found ${files.length} news files`);

  const newsItems: NewsItem[] = files
    .map((filePath) => {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(fileContent);
      const excerpt = stripHtml((data.excerpt as string) || '');

      return {
        slug: path.basename(filePath, '.md'),
        title: (data.title as string) || 'Untitled',
        date: (data.date as string) || new Date().toISOString().split('T')[0],
        excerpt: excerpt,
        content: content.replace(/\u00a0/g, ' '),
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  routes.push('/news');
  writeGz(outputDir, 'news.json', JSON.stringify(newsItems));
  progress(`✓ Built ${newsItems.length} news items`);

  return routes;
}

updateSitemap(buildNews());
