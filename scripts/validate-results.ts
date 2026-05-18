import csv from 'csvtojson';
import fs from 'node:fs';
import path from 'node:path';
import { contentPath } from './content-paths';

type ValidationIssue = {
  file: string;
  row: number | null;
  message: string;
  level: 'error' | 'warning';
};

type Summary = {
  filesChecked: number;
  rowsChecked: number;
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
};

type ValidationOptions = {
  strictFileNames: boolean;
  strictCategories: boolean;
  warningsAsErrors: boolean;
  maxPrintedIssues: number;
};

const POSITION_KEYS = ['RunnerPosition', 'FinishPosition', 'Position', 'Pos'];
const NAME_KEYS = ['Name'];
const FIRST_NAME_KEYS = ['Firstname', 'FirstName'];
const SURNAME_KEYS = ['Surname', 'LastName'];
const CLUB_KEYS = ['Club'];
const CATEGORY_KEYS = ['RunnerCategory', 'Category', 'Cat'];
const TIME_KEYS = ['FinishTime', 'Time'];
const TEAM_KEYS = ['Team', 'TeamName', 'Group', 'Squad'];
const LEG_KEYS = ['Leg', 'Stage', 'LegNum', 'LegNumber', 'Section'];
const ALLOWED_RUNNER_CATEGORIES =
  'F,F40,F50,F60,F65,F70,F75,F80,M,M40,M50,M60,M65,M70,M75,M80,NB,NB40,NB50,NB60,NB65,NB70,NB75,NB80'
    .split(',')
    .reduce((set, cat) => set.add(cat), new Set<string>());
const DEFAULT_MAX_PRINTED_ISSUES = 300;

function parseOptions(argv: string[]): ValidationOptions {
  const strictFileNames = argv.includes('--strict-filenames');
  const strictCategories = argv.includes('--strict-categories');
  const warningsAsErrors = argv.includes('--warnings-as-errors');
  const maxIssuesArg = argv.find((arg) =>
    arg.startsWith('--max-printed-issues=')
  );
  const parsedMax = maxIssuesArg
    ? parseInt(maxIssuesArg.split('=')[1] ?? '', 10)
    : DEFAULT_MAX_PRINTED_ISSUES;

  return {
    strictFileNames,
    strictCategories,
    warningsAsErrors,
    maxPrintedIssues:
      Number.isNaN(parsedMax) || parsedMax < 1
        ? DEFAULT_MAX_PRINTED_ISSUES
        : parsedMax,
  };
}

function findValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) {
      const stringValue = String(value).trim();
      if (stringValue.length > 0) return stringValue;
    }
  }
  return '';
}

function listCsvFiles(rootDir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCsvFiles(fullPath));
      continue;
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.csv') {
      files.push(fullPath);
    }
  }

  return files;
}

function validateFileName(
  filePath: string,
  issues: ValidationIssue[],
  options: ValidationOptions
): void {
  const year = path.basename(filePath, '.csv');
  // Common legacy patterns include suffixes such as -s, -w, -m, -f, -1, etc.
  const isAccepted = options.strictFileNames
    ? /^\d{4}\*?$/.test(year)
    : /^\d{4}(?:\*|-[A-Za-z0-9]+)?$/.test(year);
  if (!isAccepted) {
    issues.push({
      file: filePath,
      row: null,
      level: 'warning',
      message: options.strictFileNames
        ? `Unexpected filename '${year}.csv' (expected YYYY.csv or YYYY*.csv)`
        : `Unexpected filename '${year}.csv' (expected YYYY.csv, YYYY*.csv, or YYYY-<suffix>.csv)`,
    });
  }
}

function validateHeaders(
  filePath: string,
  rows: Record<string, unknown>[],
  issues: ValidationIssue[]
): void {
  if (rows.length === 0) {
    issues.push({
      file: filePath,
      row: null,
      level: 'warning',
      message: 'CSV has no data rows',
    });
    return;
  }

  const sampleRow = rows[0];
  const keys = new Set(Object.keys(sampleRow));
  const hasPosition = POSITION_KEYS.some((k) => keys.has(k));
  const hasName =
    NAME_KEYS.some((k) => keys.has(k)) ||
    (FIRST_NAME_KEYS.some((k) => keys.has(k)) &&
      SURNAME_KEYS.some((k) => keys.has(k)));
  const hasTime = TIME_KEYS.some((k) => keys.has(k));
  const hasTeam = TEAM_KEYS.some((k) => keys.has(k));
  const hasLeg = LEG_KEYS.some((k) => keys.has(k));

  if (!hasPosition) {
    issues.push({
      file: filePath,
      row: null,
      level: 'error',
      message: `Missing position column (expected one of: ${POSITION_KEYS.join(', ')})`,
    });
  }

  if (!hasName) {
    issues.push({
      file: filePath,
      row: null,
      level: 'error',
      message: `Missing name columns (expected Name or Firstname+Surname variants)`,
    });
  }

  if (!hasTime) {
    issues.push({
      file: filePath,
      row: null,
      level: 'error',
      message: `Missing time column (expected one of: ${TIME_KEYS.join(', ')})`,
    });
  }

  if (!CLUB_KEYS.some((k) => keys.has(k))) {
    issues.push({
      file: filePath,
      row: null,
      level: 'warning',
      message: `Missing club column (expected: ${CLUB_KEYS.join(', ')})`,
    });
  }

  if (!CATEGORY_KEYS.some((k) => keys.has(k))) {
    issues.push({
      file: filePath,
      row: null,
      level: 'warning',
      message: `Missing category column (expected one of: ${CATEGORY_KEYS.join(', ')})`,
    });
  }

  // Team/Leg validation: if one is present, warn if the other is missing
  if (hasTeam && !hasLeg) {
    issues.push({
      file: filePath,
      row: null,
      level: 'warning',
      message: `Team column found but no Leg column (expected one of: ${LEG_KEYS.join(', ')})`,
    });
  }

  if (hasLeg && !hasTeam) {
    issues.push({
      file: filePath,
      row: null,
      level: 'warning',
      message: `Leg column found but no Team column (expected one of: ${TEAM_KEYS.join(', ')})`,
    });
  }
}

function validateTime(time: string): boolean {
  return /(\d?\d)[:.h](\d\d)(?:[:.m](\d\d))?/i.test(time);
}

function validateRows(
  filePath: string,
  rows: Record<string, unknown>[],
  issues: ValidationIssue[],
  options: ValidationOptions
): number {
  let rowCount = 0;

  rows.forEach((row, index) => {
    rowCount += 1;
    const rowNumber = index + 2; // Header is line 1.

    const position = findValue(row, POSITION_KEYS);
    const name =
      findValue(row, NAME_KEYS) ||
      `${findValue(row, FIRST_NAME_KEYS)} ${findValue(row, SURNAME_KEYS)}`.trim();
    const time = findValue(row, TIME_KEYS);
    const category = findValue(row, CATEGORY_KEYS);
    const team = findValue(row, TEAM_KEYS);
    const leg = findValue(row, LEG_KEYS);

    if (!position || Number.isNaN(parseInt(position, 10))) {
      issues.push({
        file: filePath,
        row: rowNumber,
        level: 'error',
        message: `Invalid position '${position || '<empty>'}'`,
      });
    }

    if (!name) {
      issues.push({
        file: filePath,
        row: rowNumber,
        level: 'error',
        message: 'Missing runner name',
      });
    }

    if (!time) {
      issues.push({
        file: filePath,
        row: rowNumber,
        level: 'error',
        message: 'Missing time',
      });
    } else if (!validateTime(time)) {
      issues.push({
        file: filePath,
        row: rowNumber,
        level: 'warning',
        message: `Unrecognized time format '${time}'`,
      });
    }

    if (!category) {
      issues.push({
        file: filePath,
        row: rowNumber,
        level: 'warning',
        message: 'Missing runner category',
      });
    } else if (
      options.strictCategories &&
      !ALLOWED_RUNNER_CATEGORIES.has(category)
    ) {
      issues.push({
        file: filePath,
        row: rowNumber,
        level: 'warning',
        message:
          `Unexpected runner category '${category}' ` +
          `(expected one of: ${Array.from(ALLOWED_RUNNER_CATEGORIES).join(', ')})`,
      });
    }

    // Validate team/leg values if present
    if (team && !leg) {
      issues.push({
        file: filePath,
        row: rowNumber,
        level: 'warning',
        message: `Team '${team}' specified but no leg value`,
      });
    }

    if (leg && !team) {
      issues.push({
        file: filePath,
        row: rowNumber,
        level: 'warning',
        message: `Leg '${leg}' specified but no team value`,
      });
    }

    if (leg && !Number.isNaN(parseInt(leg, 10))) {
      // Leg is numeric - validate it's a reasonable integer
      const legNum = parseInt(leg, 10);
      if (legNum < 1 || legNum > 99) {
        issues.push({
          file: filePath,
          row: rowNumber,
          level: 'warning',
          message: `Leg value '${leg}' is outside expected range (1-99)`,
        });
      }
    }
  });

  return rowCount;
}

function printIssues(
  issues: ValidationIssue[],
  maxPrintedIssues: number
): void {
  const sorted = [...issues].sort((a, b) =>
    a.file === b.file
      ? (a.row ?? 0) - (b.row ?? 0)
      : a.file.localeCompare(b.file)
  );

  const toPrint = sorted.slice(0, maxPrintedIssues);
  for (const issue of toPrint) {
    const where = issue.row ? `${issue.file}:${issue.row}` : issue.file;
    const label = issue.level === 'error' ? 'ERROR' : 'WARN';
    console.log(`[${label}] ${where} - ${issue.message}`);
  }

  if (sorted.length > maxPrintedIssues) {
    console.log(
      `[INFO] Output truncated: showing ${maxPrintedIssues} of ${sorted.length} issue(s). ` +
        `Use --max-printed-issues=<n> to adjust.`
    );
  }
}

async function validateAllResultsCsv(
  options: ValidationOptions
): Promise<Summary> {
  const racesDir = contentPath('races');
  const files = listCsvFiles(racesDir);
  const issues: ValidationIssue[] = [];
  let rowsChecked = 0;

  for (const filePath of files) {
    validateFileName(filePath, issues, options);

    try {
      const rows = (await csv().fromFile(filePath)) as Record<
        string,
        unknown
      >[];
      validateHeaders(filePath, rows, issues);
      rowsChecked += validateRows(filePath, rows, issues, options);
    } catch (error) {
      issues.push({
        file: filePath,
        row: null,
        level: 'error',
        message: `Failed to parse CSV: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;

  printIssues(issues, options.maxPrintedIssues);

  return {
    filesChecked: files.length,
    rowsChecked,
    errors,
    warnings,
    issues,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const summary = await validateAllResultsCsv(options);

  const failingWarnings = options.warningsAsErrors ? summary.warnings : 0;
  const totalFailures = summary.errors + failingWarnings;

  console.log('');
  console.log(
    `Checked ${summary.filesChecked} files and ${summary.rowsChecked} rows: ` +
      `${summary.errors} error(s), ${summary.warnings} warning(s)`
  );
  if (options.warningsAsErrors) {
    console.log(
      `Warnings-as-errors enabled: ${summary.warnings} warning(s) counted as failures.`
    );
  }

  if (totalFailures > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
