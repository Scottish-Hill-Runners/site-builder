import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { suggestCanonicalCategory } from '@/lib/category';
import { CATEGORY_PATTERN, TIME_PATTERN, normalizeTime, type ParsedResultsData } from '@/lib/column-inference';

export type { ParsedResultsData };

export type ResultsIssue = {
  row: number | null; // null = whole-file issue; otherwise 1-based data row (header is row 1)
  level: 'error' | 'warning';
  message: string;
};

export const REQUIRED_COLUMNS = ['Position', 'Name', 'Club', 'Category', 'Time'] as const;

const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.ods'];

export class ResultsParseError extends Error {}

/** Reads a dropped/selected file and returns its raw header + data rows. */
export async function parseResultsFile(file: File): Promise<ParsedResultsData> {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  if (SPREADSHEET_EXTENSIONS.includes(extension)) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new ResultsParseError('The spreadsheet has no sheets.');
    }
    const csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
    return parseDelimitedText(csvText);
  }

  return parseDelimitedText(await file.text());
}

/** A row is "mostly blank" (e.g. a title or spacer row) if fewer than half its cells have content. */
function isMostlyBlankRow(row: string[]): boolean {
  if (row.length === 0) return true;
  const filled = row.filter((cell) => cell.trim() !== '').length;
  return filled < row.length / 2;
}

/** Parses pasted or file-derived CSV/TSV text into header + data rows. */
export function parseDelimitedText(text: string): ParsedResultsData {
  const result = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const allRows = result.data;

  // Skip leading title/spacer rows that don't look like a header or results row.
  const startIndex = allRows.findIndex((row) => !isMostlyBlankRow(row));
  const [headers, ...rows] = startIndex === -1 ? [] : allRows.slice(startIndex);

  if (!headers || headers.length === 0) {
    throw new ResultsParseError('Could not find any rows in the pasted or uploaded data.');
  }
  return { headers: headers.map((h) => h.trim()), rows };
}

function findColumn(headers: string[], name: string): number {
  return headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
}

function parseTimeToSeconds(time: string): number | null {
  const match = time.match(/^(\d{1,2})[:.h](\d{2})(?:[:.m](\d{2}))?$/i);
  if (!match) return null;
  const [, a, b, c] = match;
  if (c !== undefined) return Number(a) * 3600 + Number(b) * 60 + Number(c);
  return Number(a) * 60 + Number(b);
}

/** Position is auto-filled from the row number when the column is missing, so it's never truly "missing". */
function resolvePosition(row: string[], positionIdx: number, rowIndex: number): string {
  if (positionIdx === -1) return String(rowIndex + 1);
  return (row[positionIdx] ?? '').trim();
}

/** Validates parsed rows against the required results format and returns any issues. */
export function validateResultsData(data: ParsedResultsData): ResultsIssue[] {
  const issues: ResultsIssue[] = [];
  const columnIndexes = REQUIRED_COLUMNS.map((name) => findColumn(data.headers, name));
  const missingColumns = REQUIRED_COLUMNS.filter(
    (name, i) => name !== 'Position' && columnIndexes[i] === -1
  );

  if (missingColumns.length > 0) {
    issues.push({
      row: null,
      level: 'error',
      message: `Missing column(s): ${missingColumns.join(', ')}`,
    });
  }

  if (data.rows.length === 0) {
    issues.push({ row: null, level: 'error', message: 'No data rows found' });
    return issues;
  }

  const [positionIdx, nameIdx, , categoryIdx, timeIdx] = columnIndexes;
  let previousSeconds = -Infinity;
  let unsortedWarningAdded = false;

  data.rows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const cell = (idx: number) => (idx === -1 ? '' : (row[idx] ?? '').trim());

    const position = resolvePosition(row, positionIdx, index);
    const name = cell(nameIdx);
    const category = cell(categoryIdx);
    const time = normalizeTime(cell(timeIdx));

    if (!position || Number.isNaN(Number(position))) {
      issues.push({ row: rowNumber, level: 'error', message: `Invalid position '${position || '(empty)'}'` });
    } else if (Number(position) !== index + 1) {
      issues.push({
        row: rowNumber,
        level: 'warning',
        message: `Expected position ${index + 1}, found ${position}`,
      });
    }

    if (!name) {
      issues.push({ row: rowNumber, level: 'error', message: 'Missing runner name' });
    }

    if (!time) {
      issues.push({ row: rowNumber, level: 'error', message: 'Missing time' });
    } else if (!TIME_PATTERN.test(time)) {
      issues.push({ row: rowNumber, level: 'warning', message: `Unrecognized time format '${time}'` });
    } else {
      const seconds = parseTimeToSeconds(time);
      if (seconds !== null) {
        if (seconds < previousSeconds && !unsortedWarningAdded) {
          issues.push({ row: rowNumber, level: 'warning', message: 'Times are not sorted in ascending order' });
          unsortedWarningAdded = true;
        }
        previousSeconds = seconds;
      }
    }

    if (!category) {
      issues.push({ row: rowNumber, level: 'warning', message: 'Missing runner category' });
    } else if (!CATEGORY_PATTERN.test(category)) {
      issues.push({ row: rowNumber, level: 'warning', message: `Unrecognized category '${category}'` });
    }
  });

  return issues;
}

/** Builds a canonical CSV (Position,Name,Club,Category,Time) from parsed data, ready to embed in an email. */
export function buildCanonicalCsv(data: ParsedResultsData): string {
  const [positionIdx, nameIdx, clubIdx, categoryIdx, timeIdx] = REQUIRED_COLUMNS.map((name) =>
    findColumn(data.headers, name)
  );
  const cell = (row: string[], idx: number) => (idx === -1 ? '' : (row[idx] ?? '').trim());
  const dataRows = data.rows.map((row, index) => [
    resolvePosition(row, positionIdx, index),
    cell(row, nameIdx),
    cell(row, clubIdx),
    cell(row, categoryIdx),
    timeIdx === -1 ? '' : normalizeTime(cell(row, timeIdx)),
  ]);
  return Papa.unparse([Array.from(REQUIRED_COLUMNS), ...dataRows]);
}

export type TrailingRowsSuggestion = {
  validRowCount: number;
  invalidRowCount: number;
};

function isRowLikeAResult(
  row: string[],
  rowIndex: number,
  positionIdx: number,
  nameIdx: number,
  timeIdx: number
): boolean {
  const position = resolvePosition(row, positionIdx, rowIndex);
  const name = (row[nameIdx] ?? '').trim();
  const time = normalizeTime((row[timeIdx] ?? '').trim());
  return position !== '' && !Number.isNaN(Number(position)) && name !== '' && TIME_PATTERN.test(time);
}

/**
 * Detects a contiguous block of non-result rows (e.g. footer notes) at the end of the data.
 * Returns null when there's nothing to trim, or the required columns can't be found.
 */
export function detectTrailingInvalidRows(data: ParsedResultsData): TrailingRowsSuggestion | null {
  const [positionIdx, nameIdx, , , timeIdx] = REQUIRED_COLUMNS.map((name) => findColumn(data.headers, name));
  if (nameIdx === -1 || timeIdx === -1) return null;

  let invalidRowCount = 0;
  for (let i = data.rows.length - 1; i >= 0; i--) {
    if (isRowLikeAResult(data.rows[i], i, positionIdx, nameIdx, timeIdx)) break;
    invalidRowCount++;
  }

  const validRowCount = data.rows.length - invalidRowCount;
  if (invalidRowCount === 0 || validRowCount === 0) return null;
  return { validRowCount, invalidRowCount };
}

/** Returns a copy of the parsed data with the trailing rows beyond validRowCount removed. */
export function trimToValidRows(data: ParsedResultsData, validRowCount: number): ParsedResultsData {
  return { headers: data.headers, rows: data.rows.slice(0, validRowCount) };
}

export type CategoryCorrection = {
  raw: string;
  count: number;
  suggestion: string | null;
};

/** Finds distinct unrecognised category values (with counts) and a suggested replacement for each. */
export function findUnrecognizedCategories(data: ParsedResultsData): CategoryCorrection[] {
  const categoryIdx = findColumn(data.headers, 'Category');
  if (categoryIdx === -1) return [];

  const counts = new Map<string, number>();
  for (const row of data.rows) {
    const raw = (row[categoryIdx] ?? '').trim();
    if (!raw || CATEGORY_PATTERN.test(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([raw, count]) => ({ raw, count, suggestion: suggestCanonicalCategory(raw) }))
    .sort((a, b) => b.count - a.count);
}

/** Replaces category values throughout the data according to a raw-value -> replacement map. */
export function applyCategoryCorrections(
  data: ParsedResultsData,
  corrections: Record<string, string>
): ParsedResultsData {
  const categoryIdx = findColumn(data.headers, 'Category');
  if (categoryIdx === -1) return data;

  const rows = data.rows.map((row) => {
    const raw = (row[categoryIdx] ?? '').trim();
    const replacement = corrections[raw]?.trim();
    if (!replacement || replacement === raw) return row;
    const newRow = [...row];
    newRow[categoryIdx] = replacement;
    return newRow;
  });

  return { headers: data.headers, rows };
}
