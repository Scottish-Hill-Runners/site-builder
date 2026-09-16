export type ParsedResultsData = {
  headers: string[];
  rows: string[][];
};

export type ColumnRole = 'Position' | 'Name' | 'Club' | 'Category' | 'Time';

export const CATEGORY_PATTERN = /^(M|F|NB|A)(\d{2})?$/i;
export const TIME_PATTERN = /^\d{1,2}[:.h]\d{2}(?:[:.m]\d{2})?$/i;

/** Strips a trailing AM/PM marker and fractional seconds (e.g. "23:02.6 PM" -> "23:02"). */
export function normalizeTime(raw: string): string {
  let time = raw.replace(/\s*[ap]\.?m\.?$/i, '').trim();
  if (time.includes(':')) time = time.replace(/\.\d+$/, '');
  return time;
}

/** Header-name synonyms (normalized: lowercase, letters/digits only) for each required role. */
const HEADER_ALIASES: Record<ColumnRole, string[]> = {
  Position: ['position', 'pos', 'place', 'rank', 'runnerposition', 'finishposition', 'finishingposition'],
  Name: ['name', 'runner', 'runnername', 'athlete', 'fullname', 'competitor', 'competitorname'],
  Club: ['club', 'team', 'affiliation', 'runningclub', 'clubname'],
  Category: ['category', 'cat', 'agegroup', 'agecat', 'agecategory', 'class', 'division'],
  Time: ['time', 'finishtime', 'result', 'chiptime', 'guntime', 'racetime', 'finishing'],
};

const FIRST_NAME_ALIASES = ['firstname', 'first', 'forename', 'givenname'];
const LAST_NAME_ALIASES = ['surname', 'lastname', 'last', 'familyname'];

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Merges separate first-/last-name columns into a single "Name" column, if both are present. */
export function mergeSplitNameColumns(data: ParsedResultsData): ParsedResultsData {
  const normalized = data.headers.map(normalizeHeader);
  const firstIdx = normalized.findIndex((h) => FIRST_NAME_ALIASES.includes(h));
  const lastIdx = normalized.findIndex((h) => LAST_NAME_ALIASES.includes(h));
  if (firstIdx === -1 || lastIdx === -1 || firstIdx === lastIdx) return data;

  const keep = (row: string[]) => row.filter((_, i) => i !== firstIdx && i !== lastIdx);
  const headers = [...keep(data.headers), 'Name'];
  const rows = data.rows.map((row) => {
    const first = (row[firstIdx] ?? '').trim();
    const last = (row[lastIdx] ?? '').trim();
    return [...keep(row), `${first} ${last}`.trim()];
  });

  return { headers, rows };
}

export type ColumnRoleResult = {
  index: number; // -1 when unresolved
  source: 'header' | 'content' | 'none';
};

export type ColumnRoleMap = Record<ColumnRole, ColumnRoleResult>;

const ALL_ROLES: ColumnRole[] = ['Position', 'Name', 'Club', 'Category', 'Time'];
const SAMPLE_SIZE = 20;
const CONTENT_THRESHOLD: Record<ColumnRole, number> = {
  Position: 0.8,
  Name: 0.6,
  Club: 0.5,
  Category: 0.6,
  Time: 0.6,
};

function sampleValues(rows: string[][], colIdx: number): string[] {
  const values: string[] = [];
  for (const row of rows) {
    const value = (row[colIdx] ?? '').trim();
    if (value) values.push(value);
    if (values.length >= SAMPLE_SIZE) break;
  }
  return values;
}

function scoreTimeColumn(values: string[]): number {
  if (values.length === 0) return 0;
  return values.filter((v) => TIME_PATTERN.test(normalizeTime(v))).length / values.length;
}

function scoreCategoryColumn(values: string[]): number {
  if (values.length === 0) return 0;
  return values.filter((v) => CATEGORY_PATTERN.test(v)).length / values.length;
}

function scorePositionColumn(values: string[]): number {
  if (values.length === 0) return 0;
  return values.filter((v, i) => Number(v) === i + 1).length / values.length;
}

/** Club columns repeat heavily (many runners share a club) and often match a known club name. */
function scoreClubColumn(values: string[], clubNames: Set<string>): number {
  if (values.length === 0) return 0;
  const distinct = new Set(values.map((v) => v.toLowerCase())).size;
  const repetitionScore = 1 - distinct / values.length;
  if (clubNames.size === 0) return repetitionScore * 0.6;
  const matchScore = values.filter((v) => clubNames.has(v.toLowerCase())).length / values.length;
  return matchScore * 0.7 + repetitionScore * 0.3;
}

/** Names are mostly unique per row and rarely contain digits. */
function scoreNameColumn(values: string[]): number {
  if (values.length === 0) return 0;
  const distinctness = new Set(values.map((v) => v.toLowerCase())).size / values.length;
  const noDigits = values.filter((v) => !/\d/.test(v)).length / values.length;
  return distinctness * 0.6 + noDigits * 0.4;
}

function scoreColumn(role: ColumnRole, values: string[], clubNames: Set<string>): number {
  switch (role) {
    case 'Time':
      return scoreTimeColumn(values);
    case 'Category':
      return scoreCategoryColumn(values);
    case 'Position':
      return scorePositionColumn(values);
    case 'Club':
      return scoreClubColumn(values, clubNames);
    case 'Name':
      return scoreNameColumn(values);
  }
}

/**
 * Infers which column holds each required role, first by matching header-name synonyms, then
 * (for anything still unresolved) by sniffing cell content against role-specific heuristics.
 */
export function inferColumnRoles(data: ParsedResultsData, clubNames: string[] = []): ColumnRoleMap {
  const normalizedHeaders = data.headers.map(normalizeHeader);
  const clubNameSet = new Set(clubNames.map((n) => n.toLowerCase()));
  const result = {} as ColumnRoleMap;
  const claimed = new Set<number>();

  for (const role of ALL_ROLES) {
    const idx = normalizedHeaders.findIndex((h, i) => !claimed.has(i) && HEADER_ALIASES[role].includes(h));
    if (idx !== -1) {
      result[role] = { index: idx, source: 'header' };
      claimed.add(idx);
    }
  }

  for (const role of ALL_ROLES) {
    if (result[role]) continue;

    let bestIdx = -1;
    let bestScore = 0;
    for (let idx = 0; idx < data.headers.length; idx++) {
      if (claimed.has(idx)) continue;
      const score = scoreColumn(role, sampleValues(data.rows, idx), clubNameSet);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    }

    if (bestIdx !== -1 && bestScore >= CONTENT_THRESHOLD[role]) {
      result[role] = { index: bestIdx, source: 'content' };
      claimed.add(bestIdx);
    } else {
      result[role] = { index: -1, source: 'none' };
    }
  }

  return result;
}

/** Renames confidently-inferred columns to their canonical role name so downstream lookups by name just work. */
export function applyInferredHeaders(data: ParsedResultsData, roleMap: ColumnRoleMap): ParsedResultsData {
  const headers = [...data.headers];
  for (const role of ALL_ROLES) {
    const { index } = roleMap[role];
    if (index !== -1) headers[index] = role;
  }
  return { headers, rows: data.rows };
}

/** Roles that couldn't be confidently resolved and may need a manual column choice (Position excluded: it's auto-filled). */
export function unresolvedRoles(roleMap: ColumnRoleMap): ColumnRole[] {
  return ALL_ROLES.filter((role) => role !== 'Position' && roleMap[role].index === -1);
}
