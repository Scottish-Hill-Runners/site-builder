import csv from 'csvtojson';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import { writeGz, progress } from './write-gz-util';
import { contentPath, contentRoot } from './content-paths';
import { buildElevationChartData } from './elevation-chart';
import { surnameHash } from '@/lib/runner-name';
import {
  ChampionshipYearPayload,
  DistanceSlotsRule,
  Era,
  RaceInfo,
  RaceResult,
  ScoringRules,
} from '@/types/datatable';

type YearInfo = {
  year: string;
  nRaces: number;
  nClubs: number;
  nResults: number;
  nRunners: { [cat: string]: number };
};

type ClubInfo = {
  slug: string;
  name: string;
  aliases: string[];
  web?: string;
  contact?: string;
  info: string;
};

type ChampionshipData = {
  slug: string;
  title: string;
  contents: string;
  years: { [year: string]: string[] };
  yearHasData?: { [year: string]: boolean };
  rules?: {
    default?: Partial<ScoringRules>;
    [year: string]: Partial<ScoringRules> | undefined;
  };
};

type CalendarEntry = {
  Date: string;
  raceName: string;
  raceId?: string;
  distance?: number;
  climb?: number;
  latitude?: number;
  longitude?: number;
  championships?: { [slug: string]: string };
};

type RaceMeta = {
  info: RaceInfo;
  content: string;
  latitude?: number;
  longitude?: number;
  hasGpx: boolean;
  hasRaceMap: boolean;
};

type RaceEntry = {
  meta: RaceMeta;
  results: RaceResult[];
};

function formatTime(time: string): string {
  const match = time.match(/(\d{1,3})[:\.h](\d{1,3})(?:[:\.m](\d\d))?/i);
  if (match) {
    let hours: number, minutes: number, seconds: number;
    if (match[3]) {
      hours = parseInt(match[1]);
      minutes = parseInt(match[2]);
      seconds = parseInt(match[3]);
      hours += Math.floor(minutes / 60);
      minutes = minutes % 60;
    } else {
      minutes = parseInt(match[1]);
      seconds = parseInt(match[2]);
      hours = Math.floor(minutes / 60);
      minutes -= hours * 60;
    }

    return (
      `${hours}`.padStart(2, '0') +
      ':' +
      `${minutes}`.padStart(2, '0') +
      ':' +
      `${seconds}`.padStart(2, '0')
    );
  }

  return 'n/a'; // Compares less than any hh:mm:ss time.
}

function normaliseRunnerName(rawName: unknown): string | null {
  if (typeof rawName !== 'string') return null;

  const titleCaseSegment = (segment: string): string => {
    if (!segment) return segment;
    return segment[0].toUpperCase() + segment.slice(1).toLowerCase();
  };

  const titleCaseName = (value: string): string =>
    value
      .split(' ')
      .map((part) =>
        part
          .split('-')
          .map((hyphenated) =>
            hyphenated.split("'").map(titleCaseSegment).join("'")
          )
          .join('-')
      )
      .join(' ');

  let name = rawName
    .normalize('NFKC')
    .replace(/[‘’`´]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name || /^\(?unknown\)?$/i.test(name)) return null;
  if (/^[\s\-?,.:;'"()]+$/.test(name)) return null;

  name = name.replace(/^[\s\-?,.:;'"()]+/, '').trim();
  if (!name || /^\(?unknown\)?$/i.test(name)) return null;
  if (!/\p{L}/u.test(name)) return null;

  name = titleCaseName(name);

  return name;
}

function readClubs(dir: string): ClubInfo[] {
  const clubs = [] as ClubInfo[];
  for (const club of fs.readdirSync(dir, { withFileTypes: true }))
    if (club.isFile() || path.extname(club.name) == '.md') {
      const { data, content } = matter.read(path.join(dir, club.name));
      clubs.push({
        slug: path.basename(club.name, '.md'),
        name: data.name as string,
        aliases: (data.aka as string[]) ?? [],
        web: data.web as string,
        contact: data.contact as string,
        info: content,
      });
    }

  return clubs;
}

const clubs = readClubs(contentPath('clubs'));
const clubAliases = new Map<string, string>();
for (const club of clubs) {
  clubAliases.set(club.name.trim().toUpperCase(), club.name);
  for (const aka of club.aliases)
    clubAliases.set(aka.trim().toUpperCase(), club.name);
}

function likelySex(category: string): string {
  if (/W(OM[EA]N)?|F(EMALE)?|L(ADY)?|G(IRL)?/i.test(category)) return 'F';
  if (/(A|NB?|NON[-\s]?BINARY)/i.test(category)) return 'NB';
  return 'M';
}

function categoryAge(category: string): number | null {
  const match = category.match(/(\d+)/);
  if (match) return Number.parseInt(match[1], 10);
  if (/(JNR|JUN(IOR)?|U(NDER)?)/i.test(category)) return 23;
  if (/(V(VET)?)/i.test(category))
    return /S(EN(IOR)?)?/i.test(category) ? 50 : 40;
  return null;
}

function isUnder23Result(result: RaceResult): boolean {
  const age = categoryAge(result.category);
  return age !== null && age <= 23;
}

async function readRaceInstance(
  raceId: string,
  raceInstancePath: string
): Promise<RaceResult[]> {
  return await csv()
    .fromFile(raceInstancePath)
    .then((jsonArray) => {
      type PosByCategory = { [cat: string]: number };
      const posByCategory = {} as PosByCategory;
      // TODO: handle dead heats
      const updateCategoryPos = (category: string) => {
        const sex = likelySex(category);
        const age = categoryAge(category) ?? 30; // Assume 30+ if no age info in category, to give a category position.
        const catPos = {} as PosByCategory;
        if (age <= 23) {
          catPos[sex + 23] = posByCategory[sex + 23] =
            (posByCategory?.[sex + 23] ?? 0) + 1;
          catPos[sex] = posByCategory[sex] = (posByCategory?.[sex] ?? 0) + 1;
        } else {
          let catIncr = 10;
          for (let a = 30; a <= age; a += catIncr) {
            const cat = sex + (a < 40 ? '' : a);
            catPos[cat] = posByCategory[cat] = (posByCategory?.[cat] ?? 0) + 1;
            if (a == 60) catIncr = 5;
          }
        }

        return catPos;
      };

      progress(`Processing results from ${raceInstancePath}`);
      return jsonArray.flatMap((json) => {
        const name = normaliseRunnerName(
          json.Name ??
            `${json.Firstname ?? json.FirstName ?? ''} ${json.Surname ?? ''}`
        );
        if (!name) return [];

        const category = (
          (json.RunnerCategory ?? json.Category ?? json.Cat ?? '') as string
        )
          .trim()
          .toUpperCase();
        return [
          {
            raceId: raceId,
            year: path.basename(raceInstancePath, '.csv'),
            position: parseInt(
              json.RunnerPosition ??
                json.FinishPosition ??
                json.Position ??
                json.Pos
            ),
            name,
            club:
              clubAliases.get(json.Club?.toUpperCase() as string) ?? json.Club,
            category: category == '' ? 'M' : category,
            categoryPos: updateCategoryPos(category),
            time: formatTime((json.FinishTime ?? json.Time) as string),
          },
        ];
      });
    });
}

async function readRaceResults(raceId: string): Promise<RaceResult[]> {
  return await Promise.all(
    fs.readdirSync(raceId, { withFileTypes: true }).flatMap((raceInstance) => {
      if (!raceInstance.isFile() || path.extname(raceInstance.name) != '.csv')
        return Promise.resolve([] as RaceResult[]);
      return readRaceInstance(
        path.basename(raceId),
        `${raceId}/${raceInstance.name}`
      );
    })
  ).then((results) => results.flat());
}

async function readResults(): Promise<Map<string, RaceEntry>> {
  const racesDir = contentPath('races');
  const encoder = new TextEncoder();
  const raceMap = new Map<string, RaceEntry>();
  await Promise.all(
    fs
      .readdirSync(racesDir, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          fs.existsSync(path.join(racesDir, d.name, 'index.md'))
      )
      .map(async (d) => {
        const raceId = d.name;
        const raceDir = path.join(racesDir, raceId);
        const { data, content } = matter.read(path.join(raceDir, 'index.md'));
        const info: RaceInfo = {
          title: data.title,
          venue: data.venue,
          distance: parseFloat(data.distance),
          climb: parseFloat(data.climb),
          maleRecord: data.maleRecord ?? data.record,
          femaleRecord: data.femaleRecord,
          nonBinaryRecord: data.nonBinaryRecord,
          web: data.web,
          organiser: data.organiser
            ? Array.from(encoder.encode(data.organiser))
            : undefined,
          eras: parseEras(data.eras as string | undefined),
        };
        const meta: RaceMeta = {
          info,
          content,
          latitude:
            data.latitude !== undefined ? parseFloat(data.latitude) : undefined,
          longitude:
            data.longitude !== undefined
              ? parseFloat(data.longitude)
              : undefined,
          hasGpx: fs.existsSync(path.join(raceDir, 'route.gpx')),
          hasRaceMap: fs.existsSync(path.join(raceDir, 'race-map.webp')),
        };
        const results = await readRaceResults(raceDir);
        raceMap.set(raceId, { meta, results });
      })
  );
  return raceMap;
}

function groupBy<K, V>(data: V[], key: (t: V) => K): Map<K, V[]> {
  const result = new Map<K, V[]>();
  data.forEach((value) => {
    const k = key(value);
    const ts = result.get(k);
    if (ts === undefined) result.set(k, [value]);
    else return ts.push(value);
  });
  return result;
}

const outputDir = path.join(process.cwd(), 'public', 'results');
if (fs.existsSync(outputDir)) {
  fs.readdirSync(outputDir).forEach((file) => {
    const filePath = path.join(outputDir, file);
    if (fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
  });
  progress(`Cleared output directory: ${outputDir}`);
} else {
  fs.mkdirSync(outputDir, { recursive: true });
  progress(`Created output directory: ${outputDir}`);
}

function writeYearData(allResults: RaceResult[]) {
  const byYear = groupBy(allResults, (r) => r.year.substring(0, 4));
  const yearInfo: YearInfo[] = [];
  byYear.forEach((results, year) => {
    const uniqueRaces = new Set<string>();
    const uniqueClubs = new Set<string>();
    const uniqueRunners = new Map<string, Set<string>>();
    for (const r of results) {
      uniqueRaces.add(r.raceId);
      uniqueClubs.add(r.club);
      const cat = likelySex(r.category) + (categoryAge(r.category) ?? '');
      const categorySet =
        uniqueRunners.get(cat) ||
        uniqueRunners.set(cat, new Set<string>()).get(cat)!;
      categorySet.add(r.name);
    }

    const nRunners: { [cat: string]: number } = {};
    for (const [cat, names] of uniqueRunners) nRunners[cat] = names.size;
    yearInfo.push({
      year,
      nRaces: uniqueRaces.size,
      nClubs: uniqueClubs.size,
      nResults: results.length,
      nRunners,
    });
    writeGz(outputDir, `${year}.json`, JSON.stringify(results));
  });
  writeGz(outputDir, 'years.json', JSON.stringify(yearInfo));
}

function parseEras(raw: string | undefined): Era[] | undefined {
  if (!raw) return undefined;
  const eras: Era[] = [];
  for (const part of raw.split(';')) {
    const label = part.trim();
    if (!label) continue;
    const preMatch = label.match(/^pre-(\d{4})$/);
    if (preMatch) {
      eras.push({ label, to: parseInt(preMatch[1], 10) - 1 });
      continue;
    }
    const presentMatch = label.match(/^(\d{4})-present$/);
    if (presentMatch) {
      eras.push({ label, from: parseInt(presentMatch[1], 10) });
      continue;
    }
    const rangeMatch = label.match(/^(\d{4})-(\d{4})$/);
    if (rangeMatch) {
      eras.push({
        label,
        from: parseInt(rangeMatch[1], 10),
        to: parseInt(rangeMatch[2], 10),
      });
      continue;
    }
    progress(`Warning: unrecognised era "${label}" — skipping`);
  }
  return eras.length > 0 ? eras : undefined;
}

function writeRaceData(raceMap: Map<string, RaceEntry>) {
  const raceInfo: { [raceId: string]: RaceInfo } = {};
  const racesDir = contentPath('races');
  for (const [raceId, { meta, results }] of raceMap) {
    const { info, content, hasGpx, hasRaceMap } = meta;
    raceInfo[raceId] = info;
    const raceDir = path.join(racesDir, raceId);
    if (hasGpx) {
      const gpxSrc = path.join(raceDir, 'route.gpx');
      fs.copyFileSync(gpxSrc, `${outputDir}/${raceId}.gpx`);
      const elevationData = buildElevationChartData(
        fs.readFileSync(gpxSrc, 'utf-8')
      );
      if (elevationData)
        fs.writeFileSync(
          `${outputDir}/${raceId}-elevation.json`,
          JSON.stringify(elevationData)
        );
    }
    if (hasRaceMap)
      fs.copyFileSync(
        path.join(raceDir, 'race-map.webp'),
        `${outputDir}/${raceId}-map.webp`
      );
    writeGz(
      outputDir,
      `${raceId}.json`,
      JSON.stringify({
        info,
        contents: content,
        results,
        hasGpx,
        hasRaceMap,
      })
    );
  }
  writeGz(outputDir, 'races.json', JSON.stringify(raceInfo));
}

function writeRunnerData(allResults: RaceResult[]) {
  const runnerCounts = new Map<string, number>();
  allResults.forEach((r) => {
    runnerCounts.set(r.name, (runnerCounts.get(r.name) ?? 0) + 1);
  });
  writeGz(
    outputDir,
    'runners.json',
    JSON.stringify(
      Array.from(runnerCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name))
    )
  );
  const byRunnerHash = groupBy(allResults, (r) => surnameHash(r.name) % 100);
  byRunnerHash.forEach((results, hash) => {
    writeGz(outputDir, `R-${hash}.json`, JSON.stringify(results));
  });
}

function summariseCategories(allResults: RaceResult[]): void {
  const uniqueCats = new Set<string>();
  const cleanCats = new Set<string>();
  for (const result of allResults) {
    uniqueCats.add(result.category);
    for (const cat in result.categoryPos) cleanCats.add(cat);
  }

  progress(
    `Unique categories: ${Array.from(uniqueCats.values()).join(', ')}\n`
  );
  progress(`Clean categories: ${Array.from(cleanCats.values()).join(', ')}\n`);
}

function buildCalendarDateLookup(): Map<string, string> {
  const calendarPath = contentPath('calendar.csv');
  const lookup = new Map<string, string>();
  for (const line of fs.readFileSync(calendarPath, 'utf-8').split('\n')) {
    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) continue;
    const date = line.slice(0, commaIdx).trim();
    const raceId = line.slice(commaIdx + 1).trim();
    if (!date || !raceId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    lookup.set(`${date.slice(0, 4)}/${raceId}`, date);
  }
  return lookup;
}

function formatCalendarDate(isoDate: string): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const [, month, day] = isoDate.split('-');
  return `${parseInt(day)} ${months[parseInt(month) - 1]}`;
}

function readChampionships(
  calendarDates: Map<string, string>,
  raceMap: Map<string, RaceEntry>
): ChampionshipData[] {
  const champDir = contentPath('championships');
  const championships: ChampionshipData[] = [];

  for (const file of fs.readdirSync(champDir, { withFileTypes: true })) {
    if (!file.isFile() || path.extname(file.name) !== '.md') continue;

    const { data, content } = matter.read(path.join(champDir, file.name));
    const slug = path.basename(file.name, '.md');
    const years: { [year: string]: string[] } = {};

    // Extract year data from frontmatter
    for (const [key, value] of Object.entries(data)) {
      if (/^\d{4}$/.test(key) && typeof value === 'string') {
        const raceIds =
          value === 'n/a'
            ? []
            : value
                .split(';')
                .map((id: string) => id.trim())
                .filter((id: string) => id);
        years[key] = raceIds;
      }
    }

    let contents = content;
    if (contents.includes('@Schedule')) {
      const latestYear = Object.keys(years)
        .filter((y) => years[y].length > 0)
        .sort((a, b) => parseInt(b) - parseInt(a))[0];
      const hasDistanceSlots = !!(data.rules as ChampionshipData['rules'])
        ?.default?.distanceSlots;
      let scheduleBlock = '';
      if (latestYear) {
        const raceIds = years[latestYear];
        const items = raceIds
          .filter((id) => !id.startsWith('no-slug('))
          .map((raceId) => {
            const raceEntry = raceMap.get(raceId);
            let title = raceId;
            let distancePart = '';
            const hasPage = raceEntry !== undefined;
            if (hasPage) {
              title = raceEntry.meta.info.title ?? raceId;
              if (hasDistanceSlots) {
                const distance = raceEntry.meta.info.distance;
                if (!Number.isNaN(distance)) {
                  const bucket =
                    distance < 10 ? 'short' : distance > 20 ? 'long' : 'medium';
                  distancePart = ` (${bucket})`;
                }
              }
            }
            const isoDate = calendarDates.get(`${latestYear}/${raceId}`);
            const datePart = isoDate ? ` - ${formatCalendarDate(isoDate)}` : '';
            const titlePart = hasPage ? `[${title}](/races/${raceId})` : title;
            return `* ${titlePart}${distancePart}${datePart}`;
          })
          .join('\n');
        scheduleBlock = `## ${latestYear} race schedule\n\nThe ${raceIds.length} races in the ${latestYear} ${data.title} series are:\n\n${items}`;
      }
      contents = contents.replace('@Schedule', scheduleBlock);
    }

    championships.push({
      slug,
      title: data.title as string,
      contents,
      years,
      rules: data.rules as ChampionshipData['rules'],
    });
  }

  return championships;
}

function writeClubData(clubs: ClubInfo[], allResults: RaceResult[]): void {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const activeClubNames = new Set(
    allResults
      .filter((r) => {
        const y = parseInt(r.year.substring(0, 4), 10);
        return y === currentYear || y === prevYear;
      })
      .map((r) => r.club)
  );
  const output = clubs.map(({ slug, name, web, contact, info }) => ({
    slug,
    name,
    web,
    contact,
    content: info,
    active: activeClubNames.has(name),
  }));
  writeGz(
    path.join(process.cwd(), 'public'),
    'clubs.json',
    JSON.stringify(output)
  );
  progress('Wrote clubs.json.gz');
}

function writeChampionshipData(championships: ChampionshipData[]): void {
  progress(`Read ${championships.length} championships`);
  writeGz(
    path.join(process.cwd(), 'public'),
    'championships.json',
    JSON.stringify(championships)
  );
  progress('Wrote championships.json.gz');
}

function parseTimeToSeconds(time: string): number | null {
  const trimmed = time.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  if (!parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))) {
    return null;
  }

  if (parts.length === 2) {
    const minutes = Number.parseFloat(parts[0]);
    const seconds = Number.parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }

  const hours = Number.parseFloat(parts[0]);
  const minutes = Number.parseFloat(parts[1]);
  const seconds = Number.parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

function pointsWithWinnerBonus(position: number, topN = 40): number {
  if (position < 1 || position > topN) return 0;
  const base = topN + 1 - position;
  return base + (position === 1 ? 1 : 0);
}

/**
 * Returns true if the given rules key applies to `yearNum`.
 * Supported formats: "YYYY", "pre-YYYY", "YYYY-present", "YYYY-YYYY".
 */
function yearKeyMatches(key: string, yearNum: number): boolean {
  const preMatch = key.match(/^pre-(\d{4})$/);
  if (preMatch) return yearNum < parseInt(preMatch[1], 10);
  const presentMatch = key.match(/^(\d{4})-present$/);
  if (presentMatch) return yearNum >= parseInt(presentMatch[1], 10);
  const rangeMatch = key.match(/^(\d{4})-(\d{4})$/);
  if (rangeMatch)
    return (
      yearNum >= parseInt(rangeMatch[1], 10) &&
      yearNum <= parseInt(rangeMatch[2], 10)
    );
  return /^\d{4}$/.test(key) && parseInt(key, 10) === yearNum;
}

/**
 * Merge default rules with all matching year overrides.
 * Range keys ("pre-YYYY", "YYYY-present", "YYYY-YYYY") are applied in
 * definition order, then the exact "YYYY" key is applied last so that it
 * always takes highest precedence.
 */
function resolveRules(data: ChampionshipData, year: string): ScoringRules {
  const defaultRules = data.rules?.default ?? {};
  const yearNum = parseInt(year, 10);

  // Collect matching overrides: range keys in definition order, exact year last.
  const matchingOverrides: Partial<ScoringRules>[] = [];
  if (data.rules) {
    for (const [key, val] of Object.entries(data.rules)) {
      if (key === 'default' || /^\d{4}$/.test(key)) continue;
      if (val && yearKeyMatches(key, yearNum)) matchingOverrides.push(val);
    }
    const exactOverride = data.rules[year];
    if (exactOverride) matchingOverrides.push(exactOverride);
  }

  const merged = Object.assign({}, defaultRules, ...matchingOverrides);

  // Validate required fields; fall back to legacy behaviour keyed by slug
  if (!merged.points) {
    // Legacy fallback: derive rules from slug so old championships without
    // a rules block still work until their content files are updated.
    switch (data.slug) {
      case 'LongClassics':
        return {
          points: 'time-ratio',
          referenceTime: 'mf-record',
          scale: 1000,
          count: 5,
          minimum: 5,
        };
      case 'BogAndBurn':
        return { points: 'raw-position', count: 6, minimum: 6 };
      case 'Under23':
        return { points: 'position-bonus', count: 3, minimum: 3 };
      default:
        return {
          points: 'position-bonus',
          count: 4,
          minimum: 4,
          distanceSlots: { short: 1, medium: 1, long: 1, ageExemption: 60 },
        };
    }
  }

  // Deep-merge distanceSlots across default and all matching overrides.
  const withSlots = [defaultRules, ...matchingOverrides].filter(
    (o) => o.distanceSlots
  );
  const distanceSlots: DistanceSlotsRule | undefined =
    withSlots.length > 0
      ? Object.assign({}, ...withSlots.map((o) => o.distanceSlots))
      : undefined;

  return {
    points: merged.points as ScoringRules['points'],
    referenceTime: merged.referenceTime as ScoringRules['referenceTime'],
    scale: merged.scale,
    topN: merged.topN,
    count: Math.min(merged.count ?? 5, merged.minimum ?? merged.count ?? 5),
    minimum: merged.minimum ?? merged.count ?? 5,
    distanceSlots,
  };
}

function writeChampionshipResultsData(
  allResults: RaceResult[],
  championships: ChampionshipData[],
  raceMap: Map<string, RaceEntry>
): void {
  for (const championship of championships) {
    championship.yearHasData = {};

    for (const [year, raceIds] of Object.entries(championship.years)) {
      const raceSet = new Set(raceIds);
      const results = allResults.filter(
        (result) => result.year.startsWith(year) && raceSet.has(result.raceId)
      );

      const championshipResults =
        championship.slug === 'Under23'
          ? results.filter(isUnder23Result)
          : results.map((r) => ({ ...r })); // clone to allow mutation if needed

      championship.yearHasData[year] =
        raceIds.length > 0 || championshipResults.length > 0;

      const rules = resolveRules(championship, year);

      // Compute per-race points according to the resolved rules
      if (rules.points === 'time-ratio') {
        const extractRecord = (rec: unknown) => {
          if (typeof rec !== 'string') return null;
          const match = rec.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
          return match ? parseTimeToSeconds(match[1]) : null;
        };

        const winnerTimesByRaceAndSex = new Map<string, Map<string, number>>();
        const winnerSeen = new Set<string>();
        const refMode = rules.referenceTime ?? 'mf-record';

        for (const row of championshipResults) {
          if (!winnerTimesByRaceAndSex.has(row.raceId)) {
            const raceWinnerTimes = new Map<string, number>();
            winnerTimesByRaceAndSex.set(row.raceId, raceWinnerTimes);

            if (refMode === 'mf-record') {
              const raceEntry = raceMap.get(row.raceId);
              if (raceEntry) {
                const mRec = extractRecord(raceEntry.meta.info.maleRecord);
                if (mRec) raceWinnerTimes.set('M', mRec);
                const fRec = extractRecord(raceEntry.meta.info.femaleRecord);
                if (fRec) raceWinnerTimes.set('F', fRec);
              }
            }
          }

          const sex =
            refMode === 'overall-winner'
              ? 'M'
              : likelySex(row.category) === 'F'
                ? 'F'
                : 'M';
          const raceWinnerTimes = winnerTimesByRaceAndSex.get(row.raceId)!;

          const winnerKey = `${row.raceId}:${sex}`;
          if (!winnerSeen.has(winnerKey)) {
            winnerSeen.add(winnerKey);
            const runnerTime = parseTimeToSeconds(row.time);
            if (runnerTime !== null && runnerTime > 0) {
              const existing = raceWinnerTimes.get(sex);
              if (existing === undefined || runnerTime < existing)
                raceWinnerTimes.set(sex, runnerTime);
            }
          }

          const winnerTime = raceWinnerTimes?.get(sex);
          const runnerTime = parseTimeToSeconds(row.time);
          const scale = rules.scale ?? 1000;
          row.points =
            !winnerTime || !runnerTime || runnerTime <= 0
              ? 0
              : Math.min(scale, Math.round((winnerTime / runnerTime) * scale));
        }
      } else {
        for (const row of championshipResults) {
          const sex = likelySex(row.category) === 'F' ? 'F' : 'M';
          if (rules.points === 'position-bonus') {
            const pos = row.categoryPos[sex] ?? row.position;
            row.points = pointsWithWinnerBonus(pos, rules.topN ?? 40);
          } else {
            // raw-position: store the finish position (lower = better)
            row.points = row.categoryPos[sex] ?? row.position;
          }
        }
      }

      const payload: ChampionshipYearPayload = {
        rules,
        results: championshipResults,
      };
      writeGz(
        outputDir,
        `${championship.slug}-${year}.json`,
        JSON.stringify(payload)
      );
    }
  }

  progress('Wrote championship series-year result files');
}

async function writeCalendarData(
  championships: ChampionshipData[],
  raceMap: Map<string, RaceEntry>
): Promise<void> {
  // Build championship lookup: "year/raceId" -> { [slug]: title }
  const champLookup = new Map<string, { [slug: string]: string }>();
  for (const champ of championships) {
    for (const [year, raceIds] of Object.entries(champ.years)) {
      for (const raceId of raceIds) {
        if (!raceId || raceId.startsWith('no-slug(')) continue;
        const key = `${year}/${raceId}`;
        const existing = champLookup.get(key) ?? {};
        existing[champ.slug] = champ.title;
        champLookup.set(key, existing);
      }
    }
  }

  const rows = await csv({
    noheader: true,
    headers: ['Date', 'Race'],
    trim: true,
  }).fromFile(contentPath('calendar.csv'));

  const entries: CalendarEntry[] = rows
    .filter((row, index) => {
      const date = String(row.Date ?? '').trim();
      const race = String(row.Race ?? '').trim();
      if (!date && !race) {
        return false;
      }

      if (index === 0) {
        const looksLikeHeader =
          date.toLowerCase() === 'date' &&
          (race.toLowerCase() === 'race' || race.toLowerCase() === 'raceid');
        if (looksLikeHeader) {
          return false;
        }
      }

      return true;
    })
    .map((row) => {
      const raceId = String(row.Race ?? '').trim();
      const raceEntry = raceMap.get(raceId);
      if (!raceId || !raceEntry) {
        return {
          Date: String(row.Date ?? '').trim(),
          raceName: raceId,
        };
      }

      const { info, latitude, longitude } = raceEntry.meta;
      const entry: CalendarEntry = {
        Date: String(row.Date ?? '').trim(),
        raceName: String(info.title ?? raceId),
        raceId,
      };

      if (!Number.isNaN(info.distance)) entry.distance = info.distance;

      if (info.climb !== undefined && !Number.isNaN(info.climb))
        entry.climb = info.climb;

      if (latitude !== undefined) entry.latitude = latitude;
      if (longitude !== undefined) entry.longitude = longitude;

      const year = entry.Date.slice(0, 4);
      const champMap = champLookup.get(`${year}/${raceId}`);
      if (champMap && Object.keys(champMap).length > 0) {
        entry.championships = champMap;
      }

      return entry;
    });

  writeGz(
    path.join(process.cwd(), 'public'),
    'calendar.json',
    JSON.stringify(entries)
  );
  progress('Wrote calendar.json.gz');
}

async function main() {
  progress(`Using content root: ${contentRoot()}`);
  const raceMap = await readResults();
  const allResults = [...raceMap.values()].flatMap((e) => e.results);
  const calendarDates = buildCalendarDateLookup();
  const championships = readChampionships(calendarDates, raceMap);
  writeClubData(clubs, allResults);
  writeYearData(allResults);
  writeRaceData(raceMap);
  writeRunnerData(allResults);
  summariseCategories(allResults);
  writeChampionshipResultsData(allResults, championships, raceMap);
  writeChampionshipData(championships);
  await writeCalendarData(championships, raceMap);

  progress('Done\n');
}

main().catch(console.error);
