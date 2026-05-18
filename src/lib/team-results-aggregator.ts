import { RaceResult } from '@/types/datatable';

/**
 * Represents a single leg entry within a team result.
 */
export interface TeamLegResult {
  leg: number | string;
  /** Individual results for this leg */
  runners: RaceResult[];
  /** Combined time for this leg (sum of individual times) */
  time: string;
  /** Whether this leg has incomplete time data */
  isIncomplete: boolean;
}

/**
 * Aggregated team result showing all legs and totals.
 */
export interface AggregatedTeamResult {
  team: string;
  /** Team category derived from member categories (e.g. M40, F50, MIXED). */
  teamCategory: string;
  /** All runners across all legs for this team */
  runners: RaceResult[];
  /** Results keyed by leg identifier */
  legResults: Map<number | string, TeamLegResult>;
  /** Sorted array of legs in order */
  sortedLegs: (number | string)[];
  /** Total combined time across all legs */
  totalTime: string;
  /** Whether any leg has incomplete data */
  hasIncomplete: boolean;
  /** Numeric position in team standings (set by caller) */
  position?: number;
}

/**
 * Parse a time string (hh:mm:ss format) into total seconds.
 * Returns Infinity if time is 'n/a' or invalid.
 */
export function timeToSeconds(time: string): number {
  if (time === 'n/a') return Infinity;
  const match = time.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (!match) return Infinity;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Convert seconds back to hh:mm:ss format.
 */
export function secondsToTime(totalSeconds: number): string {
  if (!isFinite(totalSeconds)) return 'n/a';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return (
    String(hours).padStart(2, '0') +
    ':' +
    String(minutes).padStart(2, '0') +
    ':' +
    String(seconds).padStart(2, '0')
  );
}

/**
 * Sum multiple times (in hh:mm:ss format) together.
 * Skips 'n/a' times but marks result as incomplete if any 'n/a' found.
 * Returns { time, isIncomplete }.
 */
export function sumTimes(
  times: string[]
): { time: string; isIncomplete: boolean } {
  let totalSeconds = 0;
  let hasIncompleteness = false;

  for (const time of times) {
    const seconds = timeToSeconds(time);
    if (!isFinite(seconds)) {
      hasIncompleteness = true;
    } else {
      totalSeconds += seconds;
    }
  }

  return {
    time: hasIncompleteness && totalSeconds === 0 ? 'n/a' : secondsToTime(totalSeconds),
    isIncomplete: hasIncompleteness,
  };
}

type TeamSex = 'M' | 'F' | 'NB';

function categorySex(category: string): TeamSex {
  const normalized = category.trim().toUpperCase();
  if (normalized.startsWith('F')) return 'F';
  if (normalized.startsWith('NB') || normalized.startsWith('A')) return 'NB';
  return 'M';
}

function categoryAge(category: string): number | null {
  const match = category.match(/(\d+)/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function categoryWithAgePrefix(prefix: string, maxAge: number | null): string {
  return maxAge !== null && maxAge >= 40 ? `${prefix}${maxAge}` : prefix;
}

function deriveTeamCategory(runners: RaceResult[]): string {
  let hasM = false;
  let hasF = false;
  let hasNB = false;

  let maxMaleAge: number | null = null;
  let maxFemaleAge: number | null = null;
  let maxNbAge: number | null = null;

  for (const runner of runners) {
    const sex = categorySex(runner.category);
    const age = categoryAge(runner.category);

    if (sex === 'M') {
      hasM = true;
      if (age !== null && (maxMaleAge === null || age > maxMaleAge)) {
        maxMaleAge = age;
      }
      continue;
    }

    if (sex === 'F') {
      hasF = true;
      if (age !== null && (maxFemaleAge === null || age > maxFemaleAge)) {
        maxFemaleAge = age;
      }
      continue;
    }

    hasNB = true;
    if (age !== null && (maxNbAge === null || age > maxNbAge)) {
      maxNbAge = age;
    }
  }

  // MIXED if any female runner and at least one male/non-binary runner.
  if (hasF && (hasM || hasNB)) return 'MIXED';

  if (hasF) return categoryWithAgePrefix('F', maxFemaleAge);

  // Team with M + NB should be categorized as M.
  if (hasM) {
    const maxAge =
      maxMaleAge === null
        ? maxNbAge
        : maxNbAge === null
          ? maxMaleAge
          : Math.max(maxMaleAge, maxNbAge);
    return categoryWithAgePrefix('M', maxAge);
  }

  if (hasNB) return categoryWithAgePrefix('NB', maxNbAge);

  return 'M';
}

/**
 * Pick one shared team/leg time from multiple runner times.
 * If times disagree, the fastest finite time is used and marked incomplete.
 */
function deriveSharedTime(times: string[]): { time: string; isIncomplete: boolean } {
  const finiteTimes = times
    .map((t) => timeToSeconds(t))
    .filter((seconds) => isFinite(seconds));

  if (finiteTimes.length === 0) return { time: 'n/a', isIncomplete: true };

  const bestTimeSeconds = Math.min(...finiteTimes);
  const hasMissing = finiteTimes.length !== times.length;
  const hasConflict = finiteTimes.some((seconds) => seconds !== bestTimeSeconds);

  return {
    time: secondsToTime(bestTimeSeconds),
    isIncomplete: hasMissing || hasConflict,
  };
}

/**
 * Aggregate individual race results into team-level results.
 * Groups runners by team, then by leg within each team.
 * Computes aggregate times and marks incomplete entries.
 *
 * @param results - Raw race results with optional team/leg fields
 * @returns Map of team name to aggregated team result
 */
export function aggregateTeamResults(
  results: RaceResult[]
): Map<string, AggregatedTeamResult> {
  const teamMap = new Map<string, AggregatedTeamResult>();
  const hasAnyLegData = results.some((result) => result.team && result.leg !== undefined);

  // Group results by team
  for (const result of results) {
    if (!result.team) continue; // Skip non-team results

    const teamKey = `${result.raceId}|${result.year}|${result.team}`;

    if (!teamMap.has(teamKey)) {
      teamMap.set(teamKey, {
        team: result.team,
        teamCategory: 'M',
        runners: [],
        legResults: new Map(),
        sortedLegs: [],
        totalTime: 'n/a',
        hasIncomplete: false,
      });
    }

    const teamResult = teamMap.get(teamKey)!;
    teamResult.runners.push(result);

    // Only build explicit leg columns when there is leg data in this race.
    if (hasAnyLegData) {
      const leg = result.leg ?? 'unknown';
      if (!teamResult.legResults.has(leg)) {
        teamResult.legResults.set(leg, {
          leg,
          runners: [],
          time: 'n/a',
          isIncomplete: false,
        });
      }

      teamResult.legResults.get(leg)!.runners.push(result);
    }
  }

  // Compute leg times and totals for each team
  for (const teamResult of teamMap.values()) {
    teamResult.teamCategory = deriveTeamCategory(teamResult.runners);

    if (!hasAnyLegData) {
      // Team race without legs: one shared team time, not sum of teammate rows.
      const { time, isIncomplete } = deriveSharedTime(
        teamResult.runners.map((runner) => runner.time)
      );
      teamResult.totalTime = time;
      teamResult.hasIncomplete = isIncomplete;
      teamResult.sortedLegs = [];
      continue;
    }

    // Compute time for each leg
    const legTimes: string[] = [];
    let hasIncomplete = false;

    for (const [leg, legResult] of Array.from(teamResult.legResults.entries()).sort(
      (a, b) => {
        // Sort legs numerically if both are numbers, otherwise alphabetically
        const aNum = typeof a[0] === 'number' ? a[0] : NaN;
        const bNum = typeof b[0] === 'number' ? b[0] : NaN;
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return String(a[0]).localeCompare(String(b[0]));
      }
    )) {
      // Relay leg can have multiple teamed runners with one shared time.
      const { time, isIncomplete } = deriveSharedTime(
        legResult.runners.map((runner) => runner.time)
      );
      legResult.time = time;
      legResult.isIncomplete = isIncomplete;
      legTimes.push(time);
      if (isIncomplete) hasIncomplete = true;
    }

    // Sorted legs for iteration
    teamResult.sortedLegs = Array.from(teamResult.legResults.keys()).sort((a, b) => {
      const aNum = typeof a === 'number' ? a : NaN;
      const bNum = typeof b === 'number' ? b : NaN;
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return String(a).localeCompare(String(b));
    });

    // Compute total time
    const { time: totalTime, isIncomplete: totalIncomplete } =
      sumTimes(legTimes);
    teamResult.totalTime = totalTime;
    teamResult.hasIncomplete = hasIncomplete || totalIncomplete;
  }

  return teamMap;
}

/**
 * Convert aggregated team results into a sorted array for display.
 * Sorts by total time (fastest first), with 'n/a' times at the end.
 */
export function sortAggregatedTeams(
  teamMap: Map<string, AggregatedTeamResult>
): AggregatedTeamResult[] {
  const teams = Array.from(teamMap.values());

  teams.sort((a, b) => {
    const aSeconds = timeToSeconds(a.totalTime);
    const bSeconds = timeToSeconds(b.totalTime);
    return aSeconds - bSeconds;
  });

  // Assign positions
  teams.forEach((team, index) => {
    team.position = index + 1;
  });

  return teams;
}

/**
 * Filter individual results by leg (for displaying individual results with leg filter).
 */
export function filterResultsByLeg(
  results: RaceResult[],
  leg?: number | string
): RaceResult[] {
  if (leg === undefined) return results;
  return results.filter((r) => r.leg === leg || (leg === 'default' && !r.leg));
}
