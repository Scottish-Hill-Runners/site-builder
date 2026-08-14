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
  ElevationChartData,
  Era,
  RaceData,
  RaceInfo,
  RaceResult,
  ScoringRules,
  TeamResult,
} from '@/types/datatable';
import type { GeoJSON } from 'geojson';
import { updateSitemap, writeRobotsTxt } from './update-sitemap';
import { categoryAge, parseEligibilityAgeCap } from '@/lib/category';

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
  excludeFromChampionships?: string;
};

type NameChangeRule = {
  from: string;
  to: string;
  club?: string;
  fromYear?: number;
  toYear?: number;
};

type ChampionshipData = {
  slug: string;
  title: string;
  contents: string;
  years: { [year: string]: string[] };
  yearScoring?: {
    [year: string]: {
      participationBonusByRace?: Record<string, number>;
      tieBreakRaceId?: string;
    };
  };
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

type CalendarSourceRow = {
  Date: string;
  Race: string;
};

type ParsedRaceDateRule =
  | {
      kind: 'ordinal-weekday-in-month';
      ordinal: number;
      weekday: number;
      month: number;
    }
  | {
      kind: 'last-weekday-in-month';
      weekday: number;
      month: number;
    }
  | {
      kind: 'day-after';
      raceId: string;
    }
  | {
      kind: 'absolute';
      ordinal: number;
      month: number;
    };

type RaceMeta = {
  info: RaceInfo;
  content: string;
  raceDate?: string;
  raceDates?: string[];
  active: boolean;
  latitude?: number;
  longitude?: number;
  hasGpx: boolean;
  hasRaceMap: boolean;
  routeGeojson?: GeoJSON;
  elevationChartData?: ElevationChartData;
};

type RaceEntry = {
  meta: RaceMeta;
  results: RaceResult[];
};

const openAge = 30; // Age threshold for open category. Used for category position calculations.

const LONDON_TIMEZONE = 'Europe/London';
const WEEKDAY_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};
const MONTH_TO_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
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

/**
 * Normalize team name: trim whitespace, preserve case.
 * Return undefined if empty or null.
 */
function normaliseTeamName(rawTeam: unknown): string | undefined {
  if (typeof rawTeam !== 'string') return undefined;
  const team = rawTeam.trim();
  return team ? team : undefined;
}

/**
 * Normalize leg identifier: accept numeric or string.
 * If numeric string, convert to number; otherwise keep as string.
 * Return undefined if empty or null.
 */
function normaliseLeg(rawLeg: unknown): number | string | undefined {
  if (typeof rawLeg !== 'string') return undefined;
  const leg = rawLeg.trim();
  if (!leg) return undefined;
  const numLeg = parseInt(leg, 10);
  if (!isNaN(numLeg)) return numLeg;
  return leg;
}

/**
 * Extract Team column value from a CSV row.
 * Tries multiple possible column names.
 */
function extractTeamColumn(json: Record<string, unknown>): string | undefined {
  const TEAM_KEYS = ['Team', 'TeamName', 'TeamName', 'Group', 'Squad'];
  for (const key of TEAM_KEYS) {
    if (key in json) return normaliseTeamName(json[key]);
  }
  return undefined;
}

/**
 * Extract Leg column value from a CSV row.
 * Tries multiple possible column names.
 */
function extractLegColumn(
  json: Record<string, unknown>
): number | string | undefined {
  const LEG_KEYS = ['Leg', 'Stage', 'LegNum', 'LegNumber', 'Section'];
  for (const key of LEG_KEYS) {
    if (key in json) return normaliseLeg(json[key]);
  }
  return undefined;
}

function normaliseRunnerName(rawName: unknown): string | null {
  if (typeof rawName !== 'string') return null;

  const titleCaseSegment = (segment: string): string => {
    if (!segment) return segment;
    const tc = segment[0].toUpperCase() + segment.slice(1).toLowerCase();
    return tc
      .replace(/^Mac([a-z])/, (_, c) => 'Mac' + c.toUpperCase())
      .replace(/^Mc([a-z])/, (_, c) => 'Mc' + c.toUpperCase());
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
        excludeFromChampionships: data.excludeFromChampionships as string,    
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

function readNameChanges(): NameChangeRule[] {
  const nameChangePath = contentPath('name-change.json');
  if (!fs.existsSync(nameChangePath)) return [];

  try {
    const raw = JSON.parse(fs.readFileSync(nameChangePath, 'utf-8')) as unknown;
    if (!Array.isArray(raw)) {
      progress(`Warning: ${nameChangePath} did not contain a JSON array; ignoring it.\n`);
      return [];
    }

    return raw.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const from = typeof record.from === 'string' ? record.from.trim() : '';
      const to = typeof record.to === 'string' ? record.to.trim() : '';
      if (!from || !to) return [];
      const club = typeof record.club === 'string' ? record.club.trim() : undefined;
      const fromYear = Number.isFinite(record.fromYear) ? Number(record.fromYear) : undefined;
      const toYear = Number.isFinite(record.toYear) ? Number(record.toYear) : undefined;
      return [{ from, to, club: clubAliases.get(club?.toUpperCase() as string) ?? club, fromYear, toYear }];
    });
  } catch (error) {
    progress(
      `Warning: unable to read ${nameChangePath}: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return [];
  }
}

const nameChangeRules = readNameChanges();

function nameChangeRuleMatches(
  rule: NameChangeRule,
  name: string,
  club: string | undefined,
  year: number
): boolean {
  if (name !== rule.from) return false;
  if (rule.club && club && rule.club !== club) return false;
  return (!rule.fromYear || rule.fromYear <= year) && (!rule.toYear || rule.toYear >= year);
}

function applyNameChange(name: string, club: string, year: string): string {
  const yearMatch = year.match(/(\d{4})/);
  const resultYear = yearMatch ? Number.parseInt(yearMatch[1], 10) : NaN;
  const rule = nameChangeRules.find((r) => nameChangeRuleMatches(r, name, club, resultYear));
  return rule ? rule.to : name;
}

function likelySex(category: string): string {
  if (/W(OM[EA]N)?|F(EMALE)?|L(ADY)?|G(IRL)?/i.test(category)) return 'F';
  if (/(A|NB?|NON[-\s]?BINARY)/i.test(category)) return 'NB';
  return 'M';
}


function isEligibleResult(result: RaceResult, ageCap: number): boolean {
  const age = categoryAge(result.category);
  return age !== null && age <= ageCap;
}

async function readRaceInstance(
  raceId: string,
  raceInstancePath: string
): Promise<RaceResult[]> {
  const rawYear = path.basename(raceInstancePath, '.csv');
  return await csv()
    .fromFile(raceInstancePath)
    .then((jsonArray) => {
      type PosByCategory = { [cat: string]: number };
      const posByCategory = {} as PosByCategory;
      // TODO: handle dead heats
      const updateCategoryPos = (category: string) => {
        const sex = likelySex(category);
        const age = categoryAge(category) ?? openAge; // Assume 30+ if no age info in category, to give a category position.
        const catPos = {} as PosByCategory;
        if (age <= 23) {
          for (const a of [openAge, 23, 20, 18, 16, 14, 12, 10])
            if (age <= a) {
              const cat = sex + (a == openAge ? '' : a);
              catPos[cat] = posByCategory[cat] = (posByCategory?.[cat] ?? 0) + 1;
            }
        } else {
          for (const a of [openAge, 40, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100])
            if (age >= a) {
              const cat = sex + (a == openAge ? '' : a);
              catPos[cat] = posByCategory[cat] = (posByCategory?.[cat] ?? 0) + 1;
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

        const club = clubAliases.get(json.Club?.toUpperCase() as string) ?? json.Club
        const category = (
          (json.RunnerCategory ?? json.Category ?? json.Cat ?? '') as string
        )
          .trim()
          .toUpperCase();
        const team = extractTeamColumn(json as Record<string, unknown>);
        const leg = extractLegColumn(json as Record<string, unknown>);

        const result: RaceResult = {
          raceId: raceId,
          year: path.basename(raceInstancePath, '.csv'),
          position: parseInt(
            json.RunnerPosition ??
              json.FinishPosition ??
              json.Position ??
              json.Pos
          ),
          name: applyNameChange(name, club, rawYear),
          club,
          category: category == '' ? 'M' : category,
          categoryPos: updateCategoryPos(category),
          time: formatTime((json.FinishTime ?? json.Time) as string),
        };

        // Add optional team/leg fields
        if (team) result.team = team;
        if (leg !== undefined) result.leg = leg;

        return [result];
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

function parseGeojson(geojsonStr: string): GeoJSON | undefined {
  try {
    return JSON.parse(geojsonStr) as GeoJSON;
  } catch {}
  return undefined;
}

function normaliseWebUrl(rawUrl: unknown): string | undefined {
  if (typeof rawUrl !== 'string') return undefined;
  const url = rawUrl.trim();
  if (!url) return undefined;
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return url;
  return `http://${url}`;
}

function geojsonFirstPoint(
  geojson: GeoJSON
): { latitude: number; longitude: number } | undefined {
  try {
    if (geojson.type === 'FeatureCollection') {
      for (const feature of geojson.features ?? []) {
        if (feature?.geometry?.type === 'LineString') {
          const coords = feature.geometry.coordinates;
          if (Array.isArray(coords) && coords.length > 0) {
            const [lon, lat] = coords[0];
            if (isFinite(lon) && isFinite(lat))
              return { latitude: lat, longitude: lon };
          }
        }
      }
    }
  } catch {}
  return undefined;
}

async function readResults(): Promise<Map<string, RaceEntry>> {
  const racesDir = contentPath('races');
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
          web: normaliseWebUrl(data.web),
          organiser: data.organiser ? Buffer.from(data.organiser).toString('base64') : undefined,
          eras: parseEras(data.eras as string | undefined),
        };

        const geojsonPath = path.join(raceDir, 'route.geojson');
        const hasGpx = fs.existsSync(geojsonPath);
        const geojsonStr = hasGpx ? fs.readFileSync(geojsonPath, 'utf-8') : '';
        const routeGeojson = hasGpx ? parseGeojson(geojsonStr) : undefined;
        const elevationChartData = hasGpx
          ? buildElevationChartData(geojsonStr)
          : null;
        const gpxPoint = routeGeojson
          ? geojsonFirstPoint(routeGeojson)
          : undefined;
        const meta: RaceMeta = {
          info,
          content,
          raceDate:
            typeof data.raceDate === 'string' && data.raceDate.trim().length > 0
              ? data.raceDate.trim()
              : undefined,
          raceDates:
            Array.isArray(data.raceDates) && data.raceDates.length > 0
              ? data.raceDates.map((d: string) => d.trim()).filter((d: string) => d.length > 0)
              : undefined,
          active: data.active !== false,
          latitude:
            gpxPoint?.latitude ??
            (data.latitude !== undefined ? parseFloat(data.latitude) : undefined),
          longitude:
            gpxPoint?.longitude ??
            (data.longitude !== undefined
              ? parseFloat(data.longitude)
              : undefined),
          hasGpx,
          hasRaceMap: fs.existsSync(path.join(raceDir, 'race-map.webp')),
          routeGeojson,
          elevationChartData: elevationChartData ?? undefined,
        };

        const results = await readRaceResults(raceDir);

        // Detect if race has team/leg data
        const hasTeams = results.some((r) => r.team !== undefined);
        const hasLegs = results.some((r) => r.leg !== undefined);
        if (hasTeams) info.hasTeams = true;
        if (hasLegs) info.hasLegs = true;

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

type ChampionshipRaceEntry = {
  raceId: string;
  participationBonus?: number;
  tieBreak?: boolean;
};

function parseChampionshipRaceEntry(raw: unknown): ChampionshipRaceEntry | null {
  const entry = String(raw ?? '').trim();
  if (!entry || entry === 'n/a') return null;

  const match = entry.match(/^(.*?)(?:\s+\(([^)]*)\))?$/);
  if (!match) {
    throw new Error(`Invalid championship race entry: ${entry}`);
  }

  const raceId = match[1].trim();
  if (!raceId) {
    throw new Error(`Missing race ID in championship race entry: ${entry}`);
  }

  const out: ChampionshipRaceEntry = { raceId };
  const metadataRaw = match[2]?.trim();
  if (!metadataRaw) return out;

  for (const tokenRaw of metadataRaw.split(',')) {
    const token = tokenRaw.trim();
    if (!token) continue;

    const bonusMatch = token.match(/^bonus\s+(-?\d+(?:\.\d+)?)$/i);
    if (bonusMatch) {
      const bonus = Number.parseFloat(bonusMatch[1]);
      if (!Number.isFinite(bonus)) {
        throw new Error(`Invalid race bonus in championship race entry: ${entry}`);
      }
      out.participationBonus = bonus;
      continue;
    }

    if (/^tie[-\s]?break$/i.test(token)) {
      out.tieBreak = true;
      continue;
    }

    throw new Error(`Unknown championship race annotation "${token}" in: ${entry}`);
  }

  return out;
}

function parseChampionshipRaceEntries(raw: unknown): ChampionshipRaceEntry[] {
  const values: string[] =
    Array.isArray(raw)
      ? raw.map((value) => String(value).trim())
      : typeof raw === 'string'
        ? raw.split(';').map((id) => id.trim())
        : [];

  return values
    .map((value) => parseChampionshipRaceEntry(value))
    .filter((value): value is ChampionshipRaceEntry => value !== null);
}

function writeRaceData(raceMap: Map<string, RaceEntry>) {
  const raceInfo: { [raceId: string]: RaceInfo } = {};
  const racesDir = contentPath('races');
  for (const [raceId, { meta, results }] of raceMap) {
    const {
      info,
      content,
      hasGpx,
      hasRaceMap,
      routeGeojson,
      elevationChartData,
    } = meta;
    raceInfo[raceId] = info;
    const raceDir = path.join(racesDir, raceId);
    if (hasRaceMap)
      fs.copyFileSync(
        path.join(raceDir, 'race-map.webp'),
        `${outputDir}/${raceId}-map.webp`
      );
    const raceData: RaceData = {
      info,
      contents: content,
      results,
      hasGpx,
      hasRaceMap,
      routeGeojson,
      elevationChartData,
    };
    writeGz(
      outputDir,
      `${raceId}.json`,
      JSON.stringify(raceData)
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
        .sort((a, b) => b.count - a.count)
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

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function londonTodayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LONDON_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error('Could not determine current date in Europe/London');
  }
  return `${year}-${month}-${day}`;
}

function normalizeRule(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function parseRaceDateRule(raw: string): ParsedRaceDateRule | null {
  const rule = normalizeRule(raw);
  if (!rule) return null;

  const ordinalMatch = rule.match(
    /^(\d+)(st|nd|rd|th)\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+in\s+(January|February|March|April|May|June|July|August|September|October|November|December)$/i
  );
  if (ordinalMatch) {
    const ordinal = Number.parseInt(ordinalMatch[1], 10);
    const weekday = WEEKDAY_TO_INDEX[ordinalMatch[3].toLowerCase()];
    const month = MONTH_TO_INDEX[ordinalMatch[4].toLowerCase()];
    if (
      Number.isInteger(ordinal) &&
      ordinal >= 1 &&
      ordinal <= 5 &&
      weekday !== undefined &&
      month !== undefined
    ) {
      return { kind: 'ordinal-weekday-in-month', ordinal, weekday, month };
    }
    return null;
  }

  const lastMatch = rule.match(
    /^Last\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+in\s+(January|February|March|April|May|June|July|August|September|October|November|December)$/i
  );
  if (lastMatch) {
    const weekday = WEEKDAY_TO_INDEX[lastMatch[1].toLowerCase()];
    const month = MONTH_TO_INDEX[lastMatch[2].toLowerCase()];
    if (weekday !== undefined && month !== undefined) {
      return { kind: 'last-weekday-in-month', weekday, month };
    }
    return null;
  }

  const dayAfterMatch = rule.match(/^Day after ([A-Za-z0-9_-]+)$/);
  if (dayAfterMatch) {
    return { kind: 'day-after', raceId: dayAfterMatch[1] };
  }

  const absoluteMatch = rule.match(/^(\d+)(st|nd|rd|th)\s+(January|February|March|April|May|June|July|August|September|October|November|December)$/);
  if (absoluteMatch) {
    const ordinal = Number.parseInt(absoluteMatch[1], 10);
    const month = MONTH_TO_INDEX[absoluteMatch[3].toLowerCase()];
    if (Number.isInteger(ordinal) &&
      ordinal >= 1 &&
      ordinal <= 5 &&
      month !== undefined
    ) {
      return { kind: 'absolute', ordinal, month };
    }
    return null;
  }

  return null;
}

function formatIsoDateUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nthWeekdayOfMonthIso(
  year: number,
  month: number,
  weekday: number,
  ordinal: number
): string | null {
  const first = new Date(Date.UTC(year, month, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (ordinal - 1) * 7;
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (day > lastDayOfMonth) return null;
  return formatIsoDateUtc(new Date(Date.UTC(year, month, day)));
}

function lastWeekdayOfMonthIso(
  year: number,
  month: number,
  weekday: number
): string {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const lastWeekday = last.getUTCDay();
  const offset = (lastWeekday - weekday + 7) % 7;
  last.setUTCDate(last.getUTCDate() - offset);
  return formatIsoDateUtc(last);
}

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate
    .split('-')
    .map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDateUtc(date);
}

function parseCalendarCsvRows(rows: Array<{ Date?: string; Race?: string }>): CalendarSourceRow[] {
  return rows
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
    .map((row) => ({
      Date: String(row.Date ?? '').trim(),
      Race: String(row.Race ?? '').trim(),
    }));
}

async function readCalendarCsvRows(): Promise<CalendarSourceRow[]> {
  const rows = await csv({
    noheader: true,
    headers: ['Date', 'Race'],
    trim: true,
  }).fromFile(contentPath('calendar.csv'));
  return parseCalendarCsvRows(rows as Array<{ Date?: string; Race?: string }>);
}

function resolveComputedRaceDatesForYear(
  year: number,
  parsedRules: Map<string, ParsedRaceDateRule[]>
): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  const relativeRules = new Map<string, string>();

  for (const [raceId, rules] of parsedRules.entries())
    for (const rule of rules) {
      let isoDate: string | null = null;
      switch (rule.kind) {
        case 'ordinal-weekday-in-month':
          isoDate = nthWeekdayOfMonthIso(year, rule.month,rule.weekday, rule.ordinal);
          break;
        case 'last-weekday-in-month':
          isoDate = lastWeekdayOfMonthIso(year, rule.month, rule.weekday);
          break;
        case 'absolute':
          isoDate = formatIsoDateUtc(new Date(Date.UTC(year, rule.month, rule.ordinal)));
          break;
        case 'day-after':
          relativeRules.set(raceId, rule.raceId);
          continue;
      }

      if (!isoDate) {
        process.stdout.write(
          `Warning: Unrecognised raceDate rule for ${raceId}: "${JSON.stringify(rule)}". Skipping derived date\n`
        );
        continue;
      }
      
      if (!lookup.has(raceId))
        lookup.set(raceId, []);
      lookup.get(raceId)!.push(isoDate);
    }

  const unresolved = new Set(relativeRules.keys());
  let didProgress = true;
  while (unresolved.size > 0 && didProgress) {
    didProgress = false;
    for (const raceId of [...unresolved]) {
      const targetRaceId = relativeRules.get(raceId);
      if (!targetRaceId) {
        unresolved.delete(raceId);
        continue;
      }

      const targetDate = lookup.get(targetRaceId);
      if (!targetDate) continue;

      lookup.set(raceId, [addDaysIso(targetDate[0], 1)]);
      unresolved.delete(raceId);
      didProgress = true;
    }
  }

  for (const raceId of unresolved) {
    const targetRaceId = relativeRules.get(raceId);
    if (!targetRaceId) continue;
    if (!parsedRules.has(targetRaceId)) {
      progress(
        `Warning: raceDate for ${raceId} references unknown/inactive race ${targetRaceId}; skipping derived date`
      );
      continue;
    }
    progress(
      `Warning: Could not resolve raceDate dependency for ${raceId} in ${year}; possible cycle. Skipping derived date`
    );
  }

  return lookup;
}

async function buildMergedCalendarData(
  raceMap: Map<string, RaceEntry>
): Promise<{ rows: CalendarSourceRow[]; lookup: Map<string, string[]> }> {
  const rows = await readCalendarCsvRows();
  const lookup = new Map<string, string[]>();

  for (const row of rows) {
    if (!row.Race || !isIsoDate(row.Date)) continue;
    const key = `${row.Date.slice(0, 4)}/${row.Race}`;
    if (!lookup.has(key))
      lookup.set(key, []);
    lookup.get(key)!.push(row.Date);
  }

  const todayIso = londonTodayIso();
  const currentYear = Number.parseInt(todayIso.slice(0, 4), 10);
  const previousYear = currentYear - 1;
  const nextYear = currentYear + 1;
  const parsedRules = new Map<string, ParsedRaceDateRule[]>();
  for (const [raceId, raceEntry] of raceMap.entries()) {
    const { active, raceDate, raceDates } = raceEntry.meta;
    if (!active) continue;
    if (!raceDate && !raceDates) continue;
    const haveRecentResults =
      raceEntry.results.find(
        (r) => r.year.startsWith(`${currentYear}`) || r.year.startsWith(`${previousYear}`));
    if (!haveRecentResults) continue;
    const allRaceDates = raceDates ?? (raceDate ? [raceDate] : []);
    for (const raceDate of allRaceDates) {
      const parsed = parseRaceDateRule(raceDate);
      if (!parsed) {
        progress(
          `Warning: Unrecognised raceDate rule for ${raceId}: "${raceDate}". Skipping derived date`
        );
        continue;
      }
      if (!parsedRules.has(raceId))
        parsedRules.set(raceId, []);
      parsedRules.get(raceId)!.push(parsed);
    }
  }

  if (parsedRules.size === 0)
    return { rows, lookup };

  const currentYearResolved = resolveComputedRaceDatesForYear(currentYear, parsedRules);
  const nextYearResolved = resolveComputedRaceDatesForYear(nextYear, parsedRules);

  let addedRows = 0;
  for (const raceId of parsedRules.keys()) {
    const currentYearDates = currentYearResolved.get(raceId);
    if (!currentYearDates) continue;
    for (const currentYearDate of currentYearDates) {
      const yearsToAdd =
        currentYearDate < todayIso ? [currentYear, nextYear] : [currentYear];

      for (const year of yearsToAdd) {
          const dates =
          year === currentYear
            ? [currentYearDate]
            : nextYearResolved.get(raceId);
          if (!dates) continue;

          const key = `${year}/${raceId}`;
          const existingDates = lookup.get(key) ?? [];
          const seenDates = new Set(existingDates);
          const newDates = dates.filter((date) => !seenDates.has(date));
          if (newDates.length === 0) continue;

          lookup.set(key, [...existingDates, ...newDates]);
          for (const date of newDates)
            rows.push({ Date: date, Race: raceId });
          addedRows += newDates.length;
      }
    }
  }

  if (addedRows > 0)
    progress(`Added ${addedRows} derived calendar row(s) from raceDate rules`);

  return { rows, lookup };
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
  calendarDates: Map<string, string[]>,
  raceMap: Map<string, RaceEntry>
): ChampionshipData[] {
  const champDir = contentPath('championships');
  const championships: ChampionshipData[] = [];

  for (const file of fs.readdirSync(champDir, { withFileTypes: true })) {
    if (!file.isFile() || path.extname(file.name) !== '.md') continue;

    const { data, content } = matter.read(path.join(champDir, file.name));
    const slug = path.basename(file.name, '.md');
    const years: { [year: string]: string[] } = {};
    const yearScoring: NonNullable<ChampionshipData['yearScoring']> = {};

    // Extract year data from frontmatter
    for (const [key, value] of Object.entries(data)) {
      if (/^\d{4}$/.test(key)) {
        const raceEntries = parseChampionshipRaceEntries(value);
        years[key] = raceEntries.map((entry) => entry.raceId);

        const participationBonusByRace: Record<string, number> = {};
        let tieBreakRaceId: string | undefined;
        for (const entry of raceEntries) {
          if (entry.participationBonus !== undefined) {
            participationBonusByRace[entry.raceId] = entry.participationBonus;
          }
          if (entry.tieBreak) {
            if (tieBreakRaceId && tieBreakRaceId !== entry.raceId) {
              throw new Error(
                `Multiple tie-break races in ${slug} ${key}: ${tieBreakRaceId}, ${entry.raceId}`
              );
            }
            tieBreakRaceId = entry.raceId;
          }
        }

        if (Object.keys(participationBonusByRace).length > 0 || tieBreakRaceId) {
          yearScoring[key] = {
            participationBonusByRace:
              Object.keys(participationBonusByRace).length > 0
                ? participationBonusByRace
                : undefined,
            tieBreakRaceId,
          };
        }
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
        const sortedRaceIds = [...raceIds].sort((a, b) => {
          const dateA = calendarDates.get(`${latestYear}/${a}`)?.[0];
          const dateB = calendarDates.get(`${latestYear}/${b}`)?.[0];

          if (dateA && dateB)
            return dateA.localeCompare(dateB);
          if (dateA) return -1;
          if (dateB) return 1;
          return a.localeCompare(b);
        });

        const items = sortedRaceIds
          .filter((id) => !id.startsWith('no-slug'))
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
            const isoDate = calendarDates.get(`${latestYear}/${raceId}`)?.[0];
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
      yearScoring,
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
  const output = clubs.map(({ slug, name, web, contact, excludeFromChampionships, info }) => ({
    slug,
    name,
    web: normaliseWebUrl(web),
    contact,
    content: info,
    excludeFromChampionships,
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

type ParsedPointsPattern = {
  pointsByPosition: Map<number, number>;
  higherIsBetter: boolean;
};

function parsePointsPattern(pattern: string, maxPosition: number): ParsedPointsPattern {
  if (maxPosition < 1) {
    return { pointsByPosition: new Map<number, number>(), higherIsBetter: true };
  }

  const trimmed = pattern.trim();
  const explicitMatch = trimmed.match(/^\d+(?:,\d+)*$/);
  const rangeMatch = trimmed.match(/^((\d+(?:,\d+)*)?,)?(\d+)\.\.(\d*)$/);

  const values: number[] = [];

  if (explicitMatch) {
    values.push(...trimmed.split(',').map((n) => parseInt(n, 10)));
  } else if (rangeMatch) {
    const headRaw = rangeMatch[2];
    const start = parseInt(rangeMatch[3], 10);
    const endRaw = rangeMatch[4];

    if (headRaw) {
      values.push(...headRaw.split(',').map((n) => parseInt(n, 10)));
    }

    if (endRaw.length > 0) {
      const end = parseInt(endRaw, 10);
      const step = start <= end ? 1 : -1;
      for (let current = start; ; current += step) {
        values.push(current);
        if (current === end) break;
      }
    } else {
      values.push(start);
      const previous = values.length >= 2 ? values[values.length - 2] : undefined;
      const step = previous !== undefined && start < previous ? -1 : 1;
      let current = start;
      while (values.length < maxPosition) {
        current += step;
        values.push(current);
      }
    }
  } else {
    throw new Error(`Invalid points pattern: ${pattern}`);
  }

  if (values.length === 0) {
    throw new Error(`Invalid points pattern (no values): ${pattern}`);
  }

  const pointsByPosition = new Map<number, number>();
  const limit = Math.min(values.length, maxPosition);
  for (let i = 0; i < limit; i++) {
    pointsByPosition.set(i + 1, values[i]);
  }

  const higherIsBetter = values.length < 2 ? true : values[1] <= values[0];
  return { pointsByPosition, higherIsBetter };
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

  if (typeof merged.points !== 'string' || merged.points.trim().length === 0) {
    throw new Error(`Missing rules.points for ${data.slug} ${year}`);
  }

  if (
    merged.eligibility !== undefined &&
    (typeof merged.eligibility !== 'string' ||
      parseEligibilityAgeCap(merged.eligibility) === null)
  ) {
    throw new Error(
      `Invalid rules.eligibility for ${data.slug} ${year}: ${String(merged.eligibility)}`
    );
  }

  if (
    merged.additionalRaceBonus !== undefined &&
    (typeof merged.additionalRaceBonus !== 'number' ||
      !Number.isFinite(merged.additionalRaceBonus))
  ) {
    throw new Error(
      `Invalid rules.additionalRaceBonus for ${data.slug} ${year}: ${String(merged.additionalRaceBonus)}`
    );
  }

  if (merged.points !== 'time-ratio') {
    parsePointsPattern(merged.points, 1);
  }

  // Deep-merge distanceSlots across default and all matching overrides.
  const withSlots = [defaultRules, ...matchingOverrides].filter(
    (o) => o.distanceSlots
  );
  const distanceSlots: DistanceSlotsRule | undefined =
    withSlots.length > 0
      ? Object.assign({}, ...withSlots.map((o) => o.distanceSlots))
      : undefined;

  const withTeamSize = [defaultRules, ...matchingOverrides].filter(
    (o) => o.teamSize
  );
  const teamSize: ScoringRules['teamSize'] =
    withTeamSize.length > 0
      ? Object.assign({}, ...withTeamSize.map((o) => o.teamSize))
      : undefined;

  return {
    points: merged.points,
    referenceTime: merged.referenceTime as ScoringRules['referenceTime'],
    scale: merged.scale,
    count: Math.min(merged.count ?? 5, merged.minimum ?? merged.count ?? 5),
    additionalRaceBonus: merged.additionalRaceBonus,
    minimum: merged.minimum ?? merged.count ?? 5,
    eligibility: merged.eligibility,
    tieBreakRaceId:
      typeof merged.tieBreakRaceId === 'string' ? merged.tieBreakRaceId : undefined,
    distanceSlots,
    teamSize,
  };
}

function writeChampionshipResultsData(
  allResults: RaceResult[],
  championships: ChampionshipData[],
  raceMap: Map<string, RaceEntry>,
  calendarDates: Map<string, string[]>
): void {
  for (const championship of championships) {
    championship.yearHasData = {};

    for (const [year, raceIds] of Object.entries(championship.years)) {
      const raceSet = new Set(raceIds);
      const yearScoring = championship.yearScoring?.[year];
      const participationBonusByRace = yearScoring?.participationBonusByRace ?? {};
      const resolvedRules = resolveRules(championship, year);
      const rules = yearScoring?.tieBreakRaceId
        ? { ...resolvedRules, tieBreakRaceId: yearScoring.tieBreakRaceId }
        : resolvedRules;
      const eligibilityAgeCap =
        rules.eligibility !== undefined
          ? parseEligibilityAgeCap(rules.eligibility)
          : null;

      const excludedClubs = new Set(
        clubs.filter((c) => c.excludeFromChampionships).map((c) => c.name)
      );

      const results = allResults.filter(
        (result) =>
          result.year.startsWith(year) &&
          raceSet.has(result.raceId) &&
          !excludedClubs.has(result.club) &&
          (eligibilityAgeCap === null || isEligibleResult(result, eligibilityAgeCap))
      );

      const championshipResults = results.map((r) => ({ ...r }));

      // Recalculate positions after exclusions
      const resultsByRaceId = groupBy(championshipResults, r => r.raceId);
      resultsByRaceId.forEach(raceResults => {
        // Assume results are already sorted by time/original position
        type PosByCategory = { [cat: string]: number };
        const posByCategory = {} as PosByCategory;
        
        raceResults.forEach((result, idx) => {
          result.position = idx + 1;
          
          const updateCategoryPos = (category: string) => {
            const sex = likelySex(category);
            const age = categoryAge(category) ?? openAge;
            const catPos = {} as PosByCategory;
            if (age < openAge) {
              for (const a of [openAge, 23, 20, 18, 16, 14, 12, 10])
                if (age <= a) {
                  const cat = sex + (a == openAge ? '' : a);
                  catPos[cat] = posByCategory[cat] = (posByCategory?.[cat] ?? 0) + 1;
                }
            } else {
              for (const a of [openAge, 40, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100])
                if (age >= a) {
                  const cat = sex + (a == openAge ? '' : a);
                  catPos[cat] = posByCategory[cat] = (posByCategory?.[cat] ?? 0) + 1;
                }
            }
            return catPos;
          };
          
          result.categoryPos = updateCategoryPos(result.category);
        });
      });

      championship.yearHasData[year] =
        raceIds.length > 0 || championshipResults.length > 0;

      const maxPatternPosition = Math.max(championshipResults.length, 1);
      const parsedPoints =
        rules.points === 'time-ratio'
          ? null
          : parsePointsPattern(rules.points, maxPatternPosition);

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
              : likelySex(row.category) === 'F' ? 'F' : 'M';
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
          const participationBonus = participationBonusByRace[row.raceId] ?? 0;
          const pointsByPosition = parsedPoints!.pointsByPosition;
          const catPoints: { [cat: string]: number } = {};
          for (const [cat, pos] of Object.entries(row.categoryPos))
            if (eligibilityAgeCap === null || (categoryAge(cat) ?? 0) <= eligibilityAgeCap)
              catPoints[cat] = (pointsByPosition.get(pos) ?? 0) + participationBonus;
          row.categoryPoints = catPoints;
          const pos = row.categoryPos[sex] ?? row.position;
          row.points = (pointsByPosition.get(pos) ?? 0) + participationBonus;
        }
      }

      if (rules.points === 'time-ratio') {
        for (const row of championshipResults) {
          const participationBonus = participationBonusByRace[row.raceId] ?? 0;
          row.points = (row.points ?? 0) + participationBonus;
        }
      }

      // Build raceSchedule: all scheduled races sorted by calendar date.
      const raceSchedule = [...raceIds]
        .sort((a, b) => {
          const dateA = calendarDates.get(`${year}/${a}`)?.[0];
          const dateB = calendarDates.get(`${year}/${b}`)?.[0];
          if (dateA && dateB) return dateA.localeCompare(dateB);
          if (dateA) return -1;
          if (dateB) return 1;
          return a.localeCompare(b);
        })
        .map((raceId) => {
          const date = calendarDates.get(`${year}/${raceId}`)?.[0];
          return date ? { raceId, date } : { raceId };
        });

      let teams: TeamResult[] | undefined = undefined;
      const teamSizeRules = rules.teamSize;

      if (teamSizeRules) {
        teams = [];
        const includedClubs = new Set(
          clubs.filter((c) => !c.excludeFromChampionships).map((c) => c.name)
        );

        const resultsByRace = groupBy(championshipResults, (r) => r.raceId);

        resultsByRace.forEach((raceResults, raceId) => {
          type TeamAccum = {
            raceId: string;
            club: string;
            category: string;
            runners: { name: string; time: string; position: number }[];
          };
          const teamAccums = new Map<string, TeamAccum>();

          for (const row of raceResults) {
            if (!includedClubs.has(row.club)) continue;

            for (const [cat, pos] of Object.entries(row.categoryPos)) {
              const size = teamSizeRules[cat] ?? teamSizeRules.default;
              if (size === undefined) continue;

              const key = `${row.club}|${cat}`;
              let accum = teamAccums.get(key);
              if (!accum) {
                accum = { raceId, club: row.club, category: cat, runners: [] };
                teamAccums.set(key, accum);
              }
              accum.runners.push({ name: row.name, time: row.time, position: pos });
            }
          }

          const validTeamsByCategory = new Map<
            string,
            Array<{ club: string; score: number; tieBreaker: number; accum: TeamAccum }>
          >();

          for (const accum of teamAccums.values()) {
            const size = teamSizeRules[accum.category] ?? teamSizeRules.default;
            if (size !== undefined && accum.runners.length >= size) {
              accum.runners.sort((a, b) => a.position - b.position);
              const scorers = accum.runners.slice(0, size);
              const score = scorers.reduce((sum, r) => sum + r.position, 0);
              const tieBreaker = scorers[size - 1].position;

              let catTeams = validTeamsByCategory.get(accum.category);
              if (!catTeams) {
                catTeams = [];
                validTeamsByCategory.set(accum.category, catTeams);
              }
              catTeams.push({ club: accum.club, score, tieBreaker, accum });
            }
          }

          validTeamsByCategory.forEach((catTeams, cat) => {
            catTeams.sort((a, b) => {
              if (a.score !== b.score) return a.score - b.score;
              return a.tieBreaker - b.tieBreaker;
            });

            catTeams.forEach((ct, index) => {
              const position = index + 1;
              const points = parsedPoints
                ? (parsedPoints.pointsByPosition.get(position) ?? 0)
                : 0;
              const size = teamSizeRules[cat] ?? teamSizeRules.default!;

              teams!.push({
                raceId,
                club: ct.club,
                category: cat,
                runners: ct.accum.runners.slice(0, size),
                position,
                points,
              });
            });
          });
        });
      }

      const payload: ChampionshipYearPayload = {
        title: championship.title,
        rules,
        results: championshipResults,
        participationBonusByRace:
          Object.keys(participationBonusByRace).length > 0
            ? participationBonusByRace
            : undefined,
        raceSchedule,
        teams,
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
  raceMap: Map<string, RaceEntry>,
  calendarRows: CalendarSourceRow[]
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

  const entries: CalendarEntry[] = calendarRows
    .map((row) => {
      const raceId = row.Race;
      const raceEntry = raceMap.get(raceId);
      if (!raceId || !raceEntry) {
        return {
          Date: row.Date,
          raceName: raceId,
        };
      }

      const { info, latitude, longitude } = raceEntry.meta;
      const entry: CalendarEntry = {
        Date: row.Date,
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

  entries.sort((a, b) => {
    const aIsIso = isIsoDate(a.Date);
    const bIsIso = isIsoDate(b.Date);
    if (aIsIso && bIsIso) {
      const byDate = a.Date.localeCompare(b.Date);
      if (byDate !== 0) return byDate;
    } else if (aIsIso) {
      return -1;
    } else if (bIsIso) {
      return 1;
    }

    const aKey = a.raceId ?? a.raceName;
    const bKey = b.raceId ?? b.raceName;
    return aKey.localeCompare(bKey);
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
  const { rows: calendarRows, lookup: calendarDates } =
    await buildMergedCalendarData(raceMap);
  const allResults = [...raceMap.values()].flatMap((e) => e.results);
  const championships = readChampionships(calendarDates, raceMap);
  writeClubData(clubs, allResults);
  writeYearData(allResults);
  writeRaceData(raceMap);
  writeRunnerData(allResults);
  summariseCategories(allResults);
  writeChampionshipResultsData(allResults, championships, raceMap, calendarDates);
  writeChampionshipData(championships);
  await writeCalendarData(championships, raceMap, calendarRows);

  const routes: string[] = ['/calendar', '/welcome'];
  for (const race of raceMap.keys())
    routes.push(`/races/${race}`);
  for (const championship of championships)
    routes.push(`/championships/${championship.slug}`);
  for (const club of clubs)
    if (club.info && club.info.trim().length > 0)
      routes.push(`/clubs/${club.slug}`);
  updateSitemap(routes);
  writeRobotsTxt()
  progress('Done\n');
}

main().catch(console.error);
