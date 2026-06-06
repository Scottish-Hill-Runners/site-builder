import fs from 'node:fs';
import path from 'node:path';
import { progress } from './write-gz-util';

const SITE_URL = 'https://beta.scottishhillrunners.uk';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SITEMAP_PATH = path.join(PUBLIC_DIR, 'sitemap.xml');
const ROBOTS_PATH = path.join(PUBLIC_DIR, 'robots.txt');

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function writeRobotsTxt() {
  const robots =
    'User-agent: *\n' +
    'Allow: /\n' +
    `Sitemap: ${SITE_URL}/sitemap.xml\n\n` +
    '# Chinese crawlers — blocked (site is Scottish-region specific)\n' +
    'User-agent: Baiduspider\n' +
    'Disallow: /\n\n' +
    'User-agent: Bytespider\n' +
    'Disallow: /\n\n' +
    'User-agent: PetalBot\n' +
    'Disallow: /\n\n' +
    'User-agent: SogouSpider\n' +
    'Disallow: /\n\n' +
    'User-agent: 360Spider\n' +
    'Disallow: /\n\n' +
    'User-agent: YisouSpider\n' +
    'Disallow: /\n\n';

  fs.writeFileSync(ROBOTS_PATH, robots, 'utf8');

  progress('Wrote robots.txt');
}

export function updateSitemap(routes: string[]) {
  const urlEntries = routes.map((route) =>
    `  <url><loc>${xmlEscape(SITE_URL + route)}</loc></url>`
  );

  let head: string;
  try {
    const existing = fs.readFileSync(SITEMAP_PATH, 'utf8');
    const insertAt = existing.lastIndexOf('</urlset>');
    if (insertAt === -1)
      throw new Error('Existing sitemap.xml is not valid XML');

    head =
      existing.slice(0, insertAt) +
      (existing.endsWith('\n') ? '' : '\n');
  } catch {
    head =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  }

  const xml = head + urlEntries.join('\n') + '\n</urlset>\n';
  fs.writeFileSync(SITEMAP_PATH, xml, 'utf8');
  progress(`Updated sitemap.xml with ${routes.length} URLs`);
}
