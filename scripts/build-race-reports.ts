import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { contentPath, contentRoot } from './content-paths';
import { prebuildDir, progress, writeGz } from './write-gz-util';
import type { RaceReport } from '../src/types/race-report';

function readReport(filePath: string, slug: string): RaceReport {
  const { data, content } = matter.read(filePath);
  const report: RaceReport = {
    slug,
    year: Number(slug.slice(0, 4)),
    content,
  };

  for (const field of ['title', 'author', 'excerpt'] as const) {
    if (data[field] !== undefined) {
      if (typeof data[field] !== 'string') {
        throw new Error(`${filePath}: frontmatter "${field}" must be a string`);
      }
      report[field] = data[field];
    }
  }
  return report;
}

function buildRaceReports(): void {
  const racesDir = contentPath('races');
  const outputDir = path.join(prebuildDir, 'reports');
  progress(`Reading race reports from ${racesDir} (CONTENT_ROOT=${contentRoot()})...`);

  const reportsByRace = new Map<string, RaceReport[]>();
  for (const race of fs.readdirSync(racesDir, { withFileTypes: true })) {
    if (!race.isDirectory()) continue;
    const raceDir = path.join(racesDir, race.name);
    const reports = fs.readdirSync(raceDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^\d{4}(?:-.+)?\.md$/.test(entry.name))
      .map((entry) => readReport(path.join(raceDir, entry.name), entry.name.slice(0, -3)))
      .sort((a, b) => b.year - a.year || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    if (reports.length > 0) reportsByRace.set(race.name, reports);
  }

  for (const [raceId, reports] of reportsByRace) {
    writeGz(outputDir, `${raceId}.json`, JSON.stringify(reports));
  }

  if (fs.existsSync(outputDir)) {
    for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json.gz') &&
          !reportsByRace.has(entry.name.slice(0, -'.json.gz'.length))) {
        fs.unlinkSync(path.join(outputDir, entry.name));
      }
    }
  }
  progress(`Built reports for ${reportsByRace.size} races`);
}

buildRaceReports();
