import YAML from 'yaml';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';

export interface RaceReportSubmission {
  raceId: string;
  raceTitle: string;
  year: string;
  title: string;
  author: string;
  excerpt: string;
  body: string;
}

export function raceReportSubmissionError(report: RaceReportSubmission): string | null {
  if (!report.raceId || report.raceId === '.' || report.raceId.includes('..') || /[/\\\r\n]/.test(report.raceId)) {
    return 'This race has an invalid identifier. The report cannot be submitted.';
  }
  if (!/^\d{4}$/.test(report.year)) return 'Enter a four-digit race year.';
  if (!report.body.trim()) return 'Enter a race report.';
  if (/^\s*!--/m.test(report.body)) {
    return 'The report cannot contain a line beginning with !--. Please change that line before sending.';
  }
  return null;
}

export function createRaceReportEmail(report: RaceReportSubmission, suffix: string) {
  const error = raceReportSubmissionError(report);
  if (error) throw new Error(error);
  if (!/^[a-z0-9-]+$/.test(suffix)) throw new Error('Invalid report filename suffix');

  const metadata: Record<string, string> = {};
  for (const field of ['title', 'author', 'excerpt'] as const) {
    const value = report[field].trim();
    if (value) metadata[field] = value;
  }
  const frontmatter = Object.keys(metadata).length ? YAML.stringify(metadata).trimEnd() + '\n' : '';
  return {
    subject: `New race report for ${report.raceTitle} (${report.raceId}, ${report.year})`,
    body:
      `To ${toWhomItMayConcern()}:\n\n` +
      `I would like to add a race report for ${report.raceTitle} (${report.year}).\n\n` +
      `!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE\n` +
      `File: races/${report.raceId}/${report.year}-${suffix}.md\n` +
      `---\n${frontmatter}---\n${report.body.trim()}\n` +
      `!-- END OF SENSITIVE SECTION\n`,
  };
}
