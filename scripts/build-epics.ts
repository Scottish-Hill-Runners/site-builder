import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { writeGz, prebuildDir, progress } from './write-gz-util';
import { contentPath, contentRoot } from './content-paths';
import { updateSitemap } from './update-sitemap';
import { buildElevationChartData } from './elevation-chart';
import type { GeoJSON } from 'geojson';

function parseGeojson(geojsonStr: string): GeoJSON | undefined {
  try {
    return JSON.parse(geojsonStr) as GeoJSON;
  } catch {}
  return undefined;
}

function buildEpics(): string[] {
  const epicDir = contentPath('epics');
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

    const geojsonPath = path.join(epicDir, `${slug}.geojson`);
    const hasGpx = fs.existsSync(geojsonPath);
    const geojsonStr = hasGpx ? fs.readFileSync(geojsonPath, 'utf-8') : '';
    const routeGeojson = hasGpx ? parseGeojson(geojsonStr) : undefined;
    const elevationChartData = hasGpx
      ? buildElevationChartData(geojsonStr)
      : null;

    return {
      slug,
      title: (data.title as string) || 'Untitled',
      content: content.replace(/\u00a0/g, ' '),
      hasGpx,
      routeGeojson,
      elevationChartData: elevationChartData ?? undefined,
    };
  });

  writeGz(prebuildDir, 'epics.json', JSON.stringify(epicItems));
  progress(`✓ Built ${epicItems.length} epics`);

  return routes
}

updateSitemap(buildEpics());
