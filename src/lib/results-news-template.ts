import Papa from 'papaparse';

// Ported from shr-admin's src/lib/results-csv.ts + results-news-template.ts,
// adapted to work off the canonical CSV (Position,Name,Club,Category,Time)
// produced client-side by buildCanonicalCsv, without a GitHub race lookup.

export type GenderGroup = 'male' | 'female' | 'nonBinary';

export type Category = {
  label: string;
  group: GenderGroup;
  age: number;
};

export type RaceWinner = {
  name: string;
  club: string;
  time: string;
  position: number;
  category: Category;
  alsoWon: Set<Category>;
};

export type RaceWinners = {
  winners: RaceWinner[];
  nEntrants: number;
};

const DEFAULT_CATEGORY_AGE = 30;

function parseCategoryAge(category: string): number {
  const match = /(\d+)$/.exec(category.trim());
  return match ? Number.parseInt(match[1], 10) : DEFAULT_CATEGORY_AGE;
}

function parseGenderGroup(category: string): GenderGroup {
  const normalized = category.trim().toUpperCase() || 'M';
  if (normalized.startsWith('N') || normalized.startsWith('A')) return 'nonBinary';
  return normalized.startsWith('F') ? 'female' : 'male';
}

function absorbs(existing: Category, candidate: Category): boolean {
  const canAbsorb =
    existing.group === candidate.group || (existing.group === 'nonBinary' && candidate.group === 'male');
  if (!canAbsorb) return false;
  if (candidate.age >= DEFAULT_CATEGORY_AGE) return existing.age > candidate.age;
  return existing.age < candidate.age;
}

export function extractRaceResultsWinnerSummary(canonicalCsv: string): RaceWinners {
  const { data: rows } = Papa.parse<Record<string, string>>(canonicalCsv, {
    header: true,
    skipEmptyLines: true,
  });

  const winners: RaceWinner[] = [];
  const seenCategories = new Set<string>();

  for (const row of rows) {
    const cat = row.Category || 'M';
    if (seenCategories.has(cat)) continue;
    seenCategories.add(cat);

    const category: Category = { label: cat, group: parseGenderGroup(cat), age: parseCategoryAge(cat) };
    const position = Number.parseInt(row.Position, 10);
    if (!Number.isFinite(position)) continue;

    const name = row.Name;
    const time = row.Time;
    if (!name || !time) continue;

    const existing = winners.find((winner) => absorbs(winner.category, category));
    if (existing) existing.alsoWon.add(category);
    else winners.push({ name, club: row.Club, time, position, category, alsoWon: new Set() });
  }

  return { winners, nEntrants: rows.length };
}

function formatTime(time: string): string {
  return time.replace(/^00:/, '');
}

function formatWinnerInline(winner: { name: string; club: string; time: string }) {
  const clubPart = winner.club ? ` (${winner.club})` : '';
  return `${winner.name}${clubPart} in ${formatTime(winner.time)}`;
}

function formatWinnerLine(winner: RaceWinner, link: string): string {
  const clubPart = winner.club ? ` (${winner.club})` : '';
  const alsoWon = Array.from(winner.alsoWon)
    .map((category) => category.label)
    .sort();
  const alsoWonPart =
    winner.alsoWon.size === 0
      ? ''
      : winner.alsoWon.size === 1
        ? ` (also first ${alsoWon[0]})`
        : ` (also first ${alsoWon.slice(0, -1).join(', ')} and ${alsoWon[alsoWon.length - 1]})`;

  return `- First ${winner.category.label}${alsoWonPart}: [${winner.name}](${link}&category=${encodeURIComponent(winner.category.label)})${clubPart} - ${formatTime(winner.time)}`;
}

function toOrdinal(day: number): string {
  const remainder100 = day % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${day}th`;

  const remainder10 = day % 10;
  if (remainder10 === 1) return `${day}st`;
  if (remainder10 === 2) return `${day}nd`;
  if (remainder10 === 3) return `${day}rd`;
  return `${day}th`;
}

function formatLeadDate(dateIso: string | undefined): string | undefined {
  if (!dateIso) return undefined;
  const parsed = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateIso;

  const weekday = parsed.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const month = parsed.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });

  return `${weekday} ${toOrdinal(parsed.getUTCDate())} ${month}`;
}

function buildLeadSentence(raceTitle: string, leadDate: string | undefined, winners: RaceWinner[]): string {
  const maleWinner = winners.find((winner) => winner.category.group === 'male');
  const femaleWinner = winners.find((winner) => winner.category.group === 'female');
  const onDate = leadDate ? ` on ${leadDate}` : '';

  if (maleWinner && femaleWinner) {
    const { first, second } =
      maleWinner.position < femaleWinner.position
        ? { first: maleWinner, second: femaleWinner }
        : { first: femaleWinner, second: maleWinner };
    return `Wins for ${formatWinnerInline(first)} and ${formatWinnerInline(second)} at the ${raceTitle} race${onDate}.`;
  }

  return `Results are now available for the ${raceTitle} race${onDate}.`;
}

export type ResultsNewsPrefill = {
  title: string;
  excerpt: string;
  content: string;
};

export type ResultsNewsTemplateInput = {
  raceId: string;
  raceTitle: string;
  year: string;
  canonicalCsv: string;
  /** The race's calendar date, if known; the lead sentence omits the date when absent. */
  dateIso?: string;
};

export function buildResultsNewsPrefill({
  raceId,
  raceTitle,
  year,
  canonicalCsv,
  dateIso,
}: ResultsNewsTemplateInput): ResultsNewsPrefill {
  const { winners, nEntrants } = extractRaceResultsWinnerSummary(canonicalCsv);
  const leadDate = formatLeadDate(dateIso);
  const title = `${raceTitle} ${year} results`;
  const excerpt = buildLeadSentence(raceTitle, leadDate, winners);
  const nonBinaryWinner = winners.find((winner) => winner.category.group === 'nonBinary');
  const baseRaceLink = `/races/${encodeURIComponent(raceId)}?year=${encodeURIComponent(year)}`;

  const content = [
    `## [${raceTitle} ${year} results](${baseRaceLink})`,
    '',
    excerpt,
    nonBinaryWinner ? `Top non-binary finisher: ${formatWinnerInline(nonBinaryWinner)}.` : '',
    '',
    '### Highlights',
    ...winners.map((winner) => formatWinnerLine(winner, baseRaceLink)),
    `- ${nEntrants} entrants in total.`,
    '',
    `Full results can be found [on the race results page](${baseRaceLink}).`,
    '',
    'Congratulations to all runners and thanks to organisers and volunteers.',
  ].join('\n');

  return { title, excerpt, content };
}
