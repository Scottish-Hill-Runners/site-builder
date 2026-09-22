import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { writeGz, prebuildDir, progress } from './write-gz-util';
import { contentPath, contentRoot } from './content-paths';
import { updateSitemap } from './update-sitemap';

function buildEpics(): string[] {
  const epicDir = contentPath('long-distance');
  const routes: string[] = [];

  if (!fs.existsSync(epicDir)) {
    console.warn('Epic directory not found, creating empty epics.json.gz');
    writeGz(prebuildDir, 'epics.json', JSON.stringify([]));
    return routes;
  }

  progress(
    `Reading epics from ${epicDir} (CONTENT_ROOT=${contentRoot()})...`
  );

  const files = fs
    .readdirSync(epicDir)
    .filter((file) => file.endsWith('.md'));
  progress(`Found ${files.length} epic files`);

  const epicItems = files.map((file) => {
    const filePath = path.join(epicDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);
    const slug = file.replace('.md', '');
    routes.push(`/epics/${slug}`);
    return {
      slug,
      title: (data.title as string) || 'Untitled',
      content: content.replace(/\u00a0/g, ' '),
    };
  });

  writeGz(prebuildDir, 'epics.json', JSON.stringify(epicItems));
  progress(`✓ Built ${epicItems.length} epics`);

  return routes
}

updateSitemap(buildEpics());
