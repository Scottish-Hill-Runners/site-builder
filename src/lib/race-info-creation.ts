import YAML from 'yaml';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';

export function suggestRaceId(title: string, existingIds: string[]): string {
  const base = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '');
  if (!base) return '';
  const existing = new Set(existingIds.map((id) => id.toLowerCase()));
  let candidate = base;
  for (let suffix = 2; existing.has(candidate.toLowerCase()); suffix++) {
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

export function raceIdError(id: string, existingIds: string[] | null): string | null {
  if (!existingIds) return 'Race identifiers could not be checked. Close and reopen the dialog to retry.';
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return 'Use letters, numbers, hyphens or underscores for the race ID.';
  }
  if (existingIds.some((existing) => existing.toLowerCase() === id.toLowerCase())) {
    return 'This race ID is already in use.';
  }
  return null;
}

export function createRaceInfoEmail(
  raceId: string,
  fields: Record<string, string | number | string[]>,
  body: string,
  existingIds: string[]
) {
  const error = raceIdError(raceId, existingIds);
  if (error) throw new Error(error);
  if (typeof fields.title !== 'string' || !fields.title.trim()) throw new Error('Enter a race title.');
  if (/^\s*!--/m.test(body)) throw new Error('The description cannot contain a line beginning with !--.');
  return {
    subject: `New race: ${fields.title} (${raceId})`,
    body:
      `To ${toWhomItMayConcern()}:\n\n` +
      `I would like to add a new race. Please check that the race ID is still available before creating it.\n\n` +
      `!-- IF YOU EDIT THE TEXT BELOW, PLEASE DO SO WITH CARE\n` +
      `File: races/${raceId}/index.md\n` +
      `---\n${YAML.stringify(fields).trimEnd()}\n---\n` +
      (body.trim() ? `${body.trim()}\n` : '') +
      `!-- END OF SENSITIVE SECTION\n`,
  };
}
