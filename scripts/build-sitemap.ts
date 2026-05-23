#!/usr/bin/env node
// scripts/build-sitemap.ts
// Generate sitemap.xml for all main, race, and year pages

import { promises as fs } from 'node:fs';
import path from 'node:path';

const SITE_URL = 'https://scottishhillrunners.uk';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const RESULTS_DIR = path.join(PUBLIC_DIR, 'results');
const SITEMAP_PATH = path.join(PUBLIC_DIR, 'sitemap.xml');
const ROBOTS_PATH = path.join(PUBLIC_DIR, 'robots.txt');

// Main static routes (add more as needed)
const staticRoutes = [
  '/',
  '/races',
  '/calendar',
  '/championships',
  '/news',
  '/clubs',
  '/info',
  '/epics',
  '/runner',
];

async function getRaceAndYearPages(): Promise<string[]> {
  const pages: string[] = [];
  try {
    const files = await fs.readdir(RESULTS_DIR);
    for (const file of files) {
      if (/^[\w-]+\.json\.gz$/.test(file) && !/^R-\d+/.test(file) && !/^.*\d{4}\.json\.gz$/.test(file)) {
        // Race page: /races/[raceId]
        const raceId = file.replace(/\.json\.gz$/, '');
        pages.push(`/races/${encodeURIComponent(raceId)}`);
      }
    }
  } catch (err) {
    // Ignore if results dir missing
  }
  return pages;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


async function main() {
  const dynamicPages = await getRaceAndYearPages();
  const allPages = [...staticRoutes, ...dynamicPages];
  const urls = allPages.map((route) =>
    `  <url>\n    <loc>${xmlEscape(SITE_URL + route)}</loc>\n  </url>`
  );
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n';
  await fs.writeFile(SITEMAP_PATH, xml, 'utf8');
  console.log(`Wrote sitemap.xml with ${allPages.length} URLs`);

  // Write robots.txt with absolute Sitemap entry
  const robots =
    'User-agent: *\n' +
    'Allow: /\n' +
    `Sitemap: ${SITE_URL}/sitemap.xml\n`;
  await fs.writeFile(ROBOTS_PATH, robots, 'utf8');
  console.log('Wrote robots.txt');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to build sitemap:', err);
    process.exit(1);
  });
}
