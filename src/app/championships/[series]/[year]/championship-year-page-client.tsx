'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import RaceResultsDataTable from '@/components/RaceResultsDataTable';
import { fetchGzipJson } from '@/lib/client-results-fetch';
import type { ChampionshipYearPayload, RaceInfo, RaceResult, ScoringRules, TeamResult } from '@/types/datatable';

interface ChampionshipYearPageClientProps {
  series: string;
  year: string;
}

type ChampionshipTab = 'results' | 'standings' | 'teams';

type RunnerGrouping = 'name' | 'name-and-club';

type DistanceBucket = 'short' | 'medium' | 'long' | 'unknown';

type RaceMetadata = Record<string, RaceInfo>;

type RunnerEvent = {
  raceId: string;
  points: number;
  bucket: DistanceBucket;
  /** Populated for position-bonus championships; used for per-category point resolution. */
  categoryPoints?: { [cat: string]: number };
};

type StandingRow = {
  key: string;
  name: string;
  club: string;
  clubs: string[];
  categories: string[];
  points: number;
  events: Array<{ raceId: string; points: number }>;
  countingEvents?: Array<{ raceId: string; points: number }>;
  remainingEvents?: Array<{ raceId: string; points: number }>;
  runnerEvents?: RunnerEvent[];
  isQualified?: boolean;
  overallPosition?: number;
};

type ClubInfo = {
  name: string;
  slug: string;
  excludeFromChampionships: string;
};

type TeamStandingRow = {
  position: string;
  club: string;
  raceScores: Record<string, number | null>;
  raceBreakdown: Record<string, TeamRaceBreakdown | undefined>;
  total: number;
  isQualified?: boolean;
};

type TeamRaceBreakdown = {
  qualified: boolean;
  teamPoints: number | null;
  aggregate: number | null;
  contributors: { name: string; categoryPosition: number; time: string }[];
};

type RaceScheduleEntry = { raceId: string; date?: string };

function parseCategoryAge(category: string): number | null {
  const match = category.match(/(\d+)/);
  if (!match) {
    return null;
  }

  const age = Number.parseInt(match[1], 10);
  return Number.isNaN(age) ? null : age;
}

/**
 * For a position-bonus runner, determine which category to score under
 * when no explicit filter is active.
 * Rules: most events first; tie-break to the "lowest" (most specific)
 * category, i.e. highest numeric age (F50 > F40 > F).
 */
function pickEffectiveCategory(events: RunnerEvent[]): string | null {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.categoryPoints) {
      for (const cat of Object.keys(event.categoryPoints)) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) return null;
  return Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // more events = preferred
    const ageA = parseCategoryAge(a[0]) ?? -1;
    const ageB = parseCategoryAge(b[0]) ?? -1;
    return ageB - ageA; // higher age number = more specific = preferred
  })[0][0];
}

function isAgeExempt(categories: string[], ageExemption?: number): boolean {
  if (ageExemption === undefined) return false;
  return categories.some((category) => {
    const age = parseCategoryAge(category);
    return age !== null && age >= ageExemption;
  });
}

function getDistanceBucket(distance?: number): DistanceBucket {
  if (typeof distance !== 'number' || Number.isNaN(distance)) {
    return 'unknown';
  }

  if (distance < 10) {
    return 'short';
  }
  if (distance > 20) {
    return 'long';
  }
  return 'medium';
}

function meetsMinimumRequirements(
  rules: ScoringRules,
  categories: string[],
  events: RunnerEvent[]
): boolean {
  if (events.length < rules.minimum) return false;
  if (!rules.distanceSlots) return true;
  if (isAgeExempt(categories, rules.distanceSlots.ageExemption)) return true;
  const buckets = new Set(events.map((e) => e.bucket));
  if (rules.distanceSlots.short && !buckets.has('short')) return false;
  if (rules.distanceSlots.medium && !buckets.has('medium')) return false;
  if (rules.distanceSlots.long && !buckets.has('long')) return false;
  return true;
}

function scoreRunnerEvents(
  rules: ScoringRules,
  categories: string[],
  events: RunnerEvent[]
): { points: number; counting: RunnerEvent[]; remaining: RunnerEvent[] } {
  const ascending = rules.points === 'raw-position';
  const sortFn = (a: RunnerEvent, b: RunnerEvent) =>
    ascending ? a.points - b.points : b.points - a.points;

  if (!rules.distanceSlots || isAgeExempt(categories, rules.distanceSlots.ageExemption)) {
    // Plain best-N
    const sorted = [...events].sort(sortFn);
    const counting = sorted.slice(0, rules.count);
    const remaining = sorted.slice(rules.count);
    return {
      points: counting.reduce((sum, e) => sum + e.points, 0),
      counting,
      remaining,
    };
  }

  // Bucket-based selection (SHR style)
  const { short = 0, medium = 0, long: longSlots = 0 } = rules.distanceSlots;
  const selected = new Set<number>();

  const claimBest = (bucket: DistanceBucket, needed: number) => {
    events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.bucket === bucket)
      .sort((a, b) => b.e.points - a.e.points)
      .slice(0, needed)
      .forEach(({ i }) => selected.add(i));
  };

  if (short) claimBest('short', short);
  if (medium) claimBest('medium', medium);
  if (longSlots) claimBest('long', longSlots);

  const fillCount = rules.count - selected.size;
  if (fillCount > 0) {
    events
      .map((e, i) => ({ e, i }))
      .filter(({ i }) => !selected.has(i))
      .sort((a, b) => b.e.points - a.e.points)
      .slice(0, fillCount)
      .forEach(({ i }) => selected.add(i));
  }

  const counting: RunnerEvent[] = [];
  const remaining: RunnerEvent[] = [];
  events.forEach((e, i) => {
    if (selected.has(i)) counting.push(e);
    else remaining.push(e);
  });
  counting.sort(sortFn);
  remaining.sort(sortFn);

  return {
    points: counting.reduce((sum, e) => sum + e.points, 0),
    counting,
    remaining,
  };
}

function buildRunnerResultsMap(
  rows: RaceResult[],
  runnerName: string,
  runnerClub: string,
  grouping: RunnerGrouping
): Map<string, RaceResult> {
  const map = new Map<string, RaceResult>();
  const normalizedSearchName = runnerName.toLowerCase();
  const normalizedSearchClub = runnerClub.toLowerCase();
  rows.forEach((row) => {
    if (
      row.name.toLowerCase() === normalizedSearchName &&
      (grouping === 'name' || row.club.toLowerCase() === normalizedSearchClub)
    ) {
      const existing = map.get(row.raceId);
      if (!existing || row.position < existing.position) {
        map.set(row.raceId, row);
      }
    }
  });
  return map;
}

function countHeadToHeadWins(
  runnerA: StandingRow,
  runnerB: StandingRow,
  allResults: RaceResult[],
  grouping: RunnerGrouping
): number {
  const resultsMapA = buildRunnerResultsMap(
    allResults,
    runnerA.name,
    runnerA.club,
    grouping
  );
  const resultsMapB = buildRunnerResultsMap(
    allResults,
    runnerB.name,
    runnerB.club,
    grouping
  );

  let aWins = 0;
  let totalShared = 0;

  // Find shared races
  resultsMapA.forEach((resultA, raceId) => {
    const resultB = resultsMapB.get(raceId);
    if (resultB) {
      totalShared++;
      if (resultA.position < resultB.position) aWins++;
    }
  });

  // Return number of wins; will be used in sort as tiebreaker
  // Negative means A is better (more wins)
  return totalShared > 0 ? aWins : 0;
}

function formatPoints(points: number): string {
  return String(Math.round(points));
}

function formatOrdinal(position: number | null): string {
  if (!position || position < 1) return '-';

  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${position}th`;
  }

  switch (position % 10) {
    case 1:
      return `${position}st`;
    case 2:
      return `${position}nd`;
    case 3:
      return `${position}rd`;
    default:
      return `${position}th`;
  }
}

function buildTeamStandings(
  rules: ScoringRules,
  prebuiltTeams: TeamResult[],
  selectedCategory: string,
  raceMetadata: RaceMetadata,
): TeamStandingRow[] {
  if (!selectedCategory) return [];

  const catTeams = prebuiltTeams.filter((t) => t.category === selectedCategory);
  if (catTeams.length === 0) return [];

  const clubRaceScores = new Map<string, Record<string, number | null>>();
  const clubRaceBreakdowns = new Map<string, Record<string, TeamRaceBreakdown | undefined>>();

  for (const teamEntry of catTeams) {
    const { raceId, club, points, runners } = teamEntry;

    if (!clubRaceScores.has(club)) clubRaceScores.set(club, {});
    clubRaceScores.get(club)![raceId] = points;

    if (!clubRaceBreakdowns.has(club)) clubRaceBreakdowns.set(club, {});
    clubRaceBreakdowns.get(club)![raceId] = {
      qualified: true,
      teamPoints: points,
      aggregate: runners.reduce((sum, r) => sum + r.position, 0),
      contributors: runners.map((r) => ({
        name: r.name,
        categoryPosition: r.position,
        time: r.time,
      })),
    };
  }

  const rows: Omit<TeamStandingRow, 'position'>[] = [];
  for (const [club, raceScores] of clubRaceScores) {
    const teamRaceEvents: RunnerEvent[] = Object.entries(raceScores)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .map(([raceId, points]) => ({
        raceId,
        points,
        bucket: getDistanceBucket(raceMetadata[raceId]?.distance),
      }));
    if (teamRaceEvents.length === 0) continue;

    const scoring = scoreRunnerEvents(rules, [], teamRaceEvents);
    const isQualified = meetsMinimumRequirements(rules, [], teamRaceEvents);
    rows.push({
      club,
      raceScores,
      raceBreakdown: clubRaceBreakdowns.get(club) ?? {},
      total: scoring.points,
      isQualified,
    });
  }

  rows.sort((a, b) => {
    const diff = b.total - a.total;
    if (diff !== 0) return diff;
    return a.club.localeCompare(b.club);
  });

  const qualifiedRows = rows.filter((r) => r.isQualified);
  const unqualifiedRows = rows.filter((r) => !r.isQualified);

  const withPosition: TeamStandingRow[] = [];
  let pos = 1;
  for (let i = 0; i < qualifiedRows.length; i++) {
    const prevTied = i > 0 && qualifiedRows[i].total === qualifiedRows[i - 1].total;
    const nextTied = i < qualifiedRows.length - 1 && qualifiedRows[i].total === qualifiedRows[i + 1].total;
    const inTie = prevTied || nextTied;
    withPosition.push({ ...qualifiedRows[i], position: inTie ? `${pos}=` : `${pos}` });
    if (!nextTied) pos = i + 2;
  }
  for (const row of unqualifiedRows) {
    withPosition.push({ ...row, position: '-' });
  }
  return withPosition;
}

function estimateRawPositionTotal(
  runner: StandingRow,
  totalRaceCount: number
): number {
  const completedEvents = runner.runnerEvents ?? [];
  if (completedEvents.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const worstResult = completedEvents.reduce(
    (max, event) => Math.max(max, event.points),
    Number.NEGATIVE_INFINITY
  );
  const remainingRaceCount = Math.max(0, totalRaceCount - completedEvents.length);
  return runner.points + worstResult * remainingRaceCount;
}

function buildStandings(
  rules: ScoringRules,
  rows: RaceResult[],
  raceMetadata: RaceMetadata,
  grouping: RunnerGrouping
): StandingRow[] {
  const ascending = rules.points === 'raw-position';
  const grouped = new Map<
    string,
    StandingRow & { runnerEvents: RunnerEvent[] }
  >();

  rows.forEach((row) => {
    const normalizedName = row.name.trim() || 'Unknown';
    const normalizedClub = row.club.trim();
    const groupKey =
      grouping === 'name'
        ? normalizedName.toLowerCase()
        : `${normalizedName.toLowerCase()}|${normalizedClub.toLowerCase()}`;
    const racePoints = row.points ?? 0;
    const bucket = getDistanceBucket(raceMetadata[row.raceId]?.distance);
    const existing = grouped.get(groupKey);

    if (existing) {
      if (normalizedClub && !existing.clubs.includes(normalizedClub)) {
        existing.clubs.push(normalizedClub);
        existing.clubs.sort((a, b) => a.localeCompare(b));
      }
      if (!existing.categories.includes(row.category)) {
        existing.categories.push(row.category);
      }
      existing.runnerEvents.push({
        raceId: row.raceId,
        points: racePoints,
        bucket,
        categoryPoints: row.categoryPoints,
      });
      existing.events.push({ raceId: row.raceId, points: racePoints });
      return;
    }

    grouped.set(groupKey, {
      key: groupKey,
      name: normalizedName,
      club: normalizedClub,
      clubs: normalizedClub ? [normalizedClub] : [],
      categories: [row.category],
      points: 0,
      runnerEvents: [{ raceId: row.raceId, points: racePoints, bucket, categoryPoints: row.categoryPoints }],
      events: [{ raceId: row.raceId, points: racePoints }],
    });
  });

  const finalized = Array.from(grouped.values()).map((runner) => {
    let resolvedEvents = runner.runnerEvents;

    if (rules.points === 'position-bonus') {
      const effectiveCat = pickEffectiveCategory(runner.runnerEvents);
      if (effectiveCat) {
        resolvedEvents = runner.runnerEvents.map((e) => ({
          ...e,
          points: e.categoryPoints?.[effectiveCat] ?? e.points,
        }));
      }
    }

    const sortedEvents = [...resolvedEvents].sort((a, b) =>
      a.raceId.localeCompare(b.raceId)
    );
    const scoring = scoreRunnerEvents(rules, runner.categories, resolvedEvents);
    return {
      key: runner.key,
      name: runner.name,
      club: runner.clubs.join(', '),
      clubs: runner.clubs,
      categories: runner.categories,
      points: scoring.points,
      events: sortedEvents.map(({ raceId, points }) => ({ raceId, points })),
      countingEvents: scoring.counting,
      remainingEvents: scoring.remaining,
      runnerEvents: resolvedEvents,
      isQualified: meetsMinimumRequirements(
        rules,
        runner.categories,
        resolvedEvents
      ),
    };
  });

  return finalized.sort((a, b) => {
    const pointsDiff =
      ascending ? a.points - b.points : b.points - a.points;
    if (pointsDiff !== 0) {
      return pointsDiff;
    }

    // Tie-breaker: head-to-head comparison in shared races
    const aHeadToHeadWins = countHeadToHeadWins(a, b, rows, grouping);
    const bHeadToHeadWins = countHeadToHeadWins(b, a, rows, grouping);

    if (aHeadToHeadWins !== bHeadToHeadWins) {
      return bHeadToHeadWins - aHeadToHeadWins;
    }

    // Final tie-breaker: alphabetical by name
    return a.name.localeCompare(b.name);
  });
}

const CHAMP_TAB_STORAGE_KEY = 'championship.activeTab';
const CHAMP_GROUPING_STORAGE_KEY = 'championship.runnerGrouping';

export default function ChampionshipYearPageClient({
  series,
  year,
}: ChampionshipYearPageClientProps) {
  const [results, setResults] = useState<RaceResult[] | null>(null);
  const [scoringRules, setScoringRules] = useState<ScoringRules | null>(null);
  const [raceMetadata, setRaceMetadata] = useState<RaceMetadata>({});
  const [activeTab, setActiveTab] = useState<ChampionshipTab>(() => {
    try {
      const saved = window.localStorage.getItem(CHAMP_TAB_STORAGE_KEY);
      if (saved === 'standings' || saved === 'results' || saved === 'teams') return saved;
    } catch {}
    return 'standings';
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(CHAMP_TAB_STORAGE_KEY, activeTab);
    } catch {}
  }, [activeTab]);

  const [selectedRunnerName, setSelectedRunnerName] = useState('');
  const [selectedGrouping, setSelectedGrouping] = useState<RunnerGrouping>(() => {
    try {
      const saved = window.localStorage.getItem(CHAMP_GROUPING_STORAGE_KEY);
      if (saved === 'name' || saved === 'name-and-club') return saved;
    } catch {}
    return 'name-and-club';
  });
  const [selectedCategoryPos, setSelectedCategoryPos] = useState<string>('All');
  const [selectedClub, setSelectedClub] = useState<string>('All');
  const [raceSchedule, setRaceSchedule] = useState<RaceScheduleEntry[]>([]);
  const [prebuiltTeams, setPrebuiltTeams] = useState<TeamResult[] | null>(null);
  const [selectedTeamCategory, setSelectedTeamCategory] = useState<string>('');
  const [expandedTeamClub, setExpandedTeamClub] = useState<string | null>(null);
  const [teamSortKey, setTeamSortKey] = useState<string>('position');
  const [teamSortDir, setTeamSortDir] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [clubNameToInfo, setClubNameToInfo] = useState<Record<string, ClubInfo>>(
    {}
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAMP_GROUPING_STORAGE_KEY, selectedGrouping);
    } catch {}
  }, [selectedGrouping]);

  useEffect(() => {
    fetchGzipJson<Array<ClubInfo>>('/clubs.json.gz')
      .then((result) => {
        if (result.status === 'ok') {
          const map: Record<string, ClubInfo> = {};
          for (const c of result.data) map[c.name] = c;
          setClubNameToInfo(map);
        }
      })
      .catch(() => {});
  }, []);

  const allStandings = useMemo(
    () =>
      scoringRules
        ? buildStandings(scoringRules, results ?? [], raceMetadata, selectedGrouping)
        : [],
    [results, raceMetadata, scoringRules, selectedGrouping]
  );

  const availableCategoryPos = useMemo(() => {
    const categories = new Set<string>();
    results?.forEach((row) => {
      Object.keys(row.categoryPos).forEach((cat) => categories.add(cat));
    });
    return Array.from(categories).sort();
  }, [results]);

  // Guard: if a stale 'teams' tab is in localStorage but this championship has no teams, fall back.
  useEffect(() => {
    if (activeTab === 'teams' && scoringRules && !scoringRules.teamSize) {
      setActiveTab('standings');
    }
  }, [activeTab, scoringRules]);

  const availableClubs = useMemo(() => {
    const clubs = new Set<string>();
    results?.forEach((row) => {
      if (row.club?.trim()) {
        clubs.add(row.club.trim());
      }
    });
    return Array.from(clubs).sort((a, b) => a.localeCompare(b));
  }, [results]);

  // Derive available team categories from prebuilt teams data.
  const availableTeamCategories = useMemo(() => {
    if (!scoringRules?.teamSize || !prebuiltTeams) return [];
    const cats = new Set(prebuiltTeams.map((t) => t.category));
    return Array.from(cats).sort();
  }, [scoringRules, prebuiltTeams]);

  // Default selectedTeamCategory to the first available team category.
  useEffect(() => {
    if (availableTeamCategories.length > 0 && !selectedTeamCategory) {
      setSelectedTeamCategory(availableTeamCategories[0]);
    }
  }, [availableTeamCategories, selectedTeamCategory]);

  useEffect(() => {
    setExpandedTeamClub(null);
  }, [selectedTeamCategory, activeTab, series, year]);

  const teamStandings = useMemo(() => {
    if (!scoringRules?.teamSize || !selectedTeamCategory || !prebuiltTeams) {
      return [];
    }
    return buildTeamStandings(
      scoringRules,
      prebuiltTeams,
      selectedTeamCategory,
      raceMetadata,
    );
  }, [scoringRules, prebuiltTeams, selectedTeamCategory, raceMetadata]);

  const sortedTeamStandings = useMemo(() => {
    if (teamStandings.length === 0) return teamStandings;
    const dir = teamSortDir === 'asc' ? 1 : -1;
    return [...teamStandings].sort((a, b) => {
      if (teamSortKey === 'position') {
        return dir * (parseFloat(a.position) - parseFloat(b.position));
      }
      if (teamSortKey === 'club') {
        return dir * a.club.localeCompare(b.club);
      }
      if (teamSortKey === 'total') {
        return dir * (a.total - b.total);
      }
      // race column
      const aScore = a.raceScores[teamSortKey] ?? -Infinity;
      const bScore = b.raceScores[teamSortKey] ?? -Infinity;
      return dir * (aScore - bScore);
    });
  }, [teamStandings, teamSortKey, teamSortDir]);

  const qualifiedTeamStandings = useMemo(
    () => sortedTeamStandings.filter((r) => r.isQualified),
    [sortedTeamStandings]
  );
  const unqualifiedTeamStandings = useMemo(
    () => sortedTeamStandings.filter((r) => !r.isQualified),
    [sortedTeamStandings]
  );

  const filteredStandings = useMemo(() => {
    if (selectedCategoryPos === 'All' || !results) {
      return allStandings;
    }

    const filteredRows = results.filter(
      (row) => selectedCategoryPos in row.categoryPos
    );
    const grouped = new Map<
      string,
      StandingRow & { runnerEvents: RunnerEvent[] }
    >();

    filteredRows.forEach((row) => {
      const normalizedName = row.name.trim() || 'Unknown';
      const normalizedClub = row.club.trim();
      const groupKey =
        selectedGrouping === 'name'
          ? normalizedName.toLowerCase()
          : `${normalizedName.toLowerCase()}|${normalizedClub.toLowerCase()}`;

      const racePoints =
        scoringRules?.points === 'position-bonus' && row.categoryPoints
          ? (row.categoryPoints[selectedCategoryPos] ?? row.points ?? 0)
          : (row.points ?? 0);

      const bucket = getDistanceBucket(raceMetadata[row.raceId]?.distance);
      const existing = grouped.get(groupKey);

      if (existing) {
        if (normalizedClub && !existing.clubs.includes(normalizedClub)) {
          existing.clubs.push(normalizedClub);
          existing.clubs.sort((a, b) => a.localeCompare(b));
        }
        if (!existing.categories.includes(selectedCategoryPos)) {
          existing.categories.push(selectedCategoryPos);
        }
        existing.runnerEvents.push({
          raceId: row.raceId,
          points: racePoints,
          bucket,
        });
        existing.events.push({ raceId: row.raceId, points: racePoints });
        return;
      }

      grouped.set(groupKey, {
        key: groupKey,
        name: normalizedName,
        club: normalizedClub,
        clubs: normalizedClub ? [normalizedClub] : [],
        categories: [selectedCategoryPos],
        points: 0,
        runnerEvents: [{ raceId: row.raceId, points: racePoints, bucket }],
        events: [{ raceId: row.raceId, points: racePoints }],
        isQualified: false,
      });
    });

    const finalized: StandingRow[] = Array.from(grouped.values()).map((runner) => {
      const sortedEvents = [...runner.events].sort((a, b) =>
        a.raceId.localeCompare(b.raceId)
      );
      const scoring = scoreRunnerEvents(scoringRules!, runner.categories, runner.runnerEvents);
      return {
        key: runner.key,
        name: runner.name,
        club: runner.clubs.join(', '),
        clubs: runner.clubs,
        categories: runner.categories,
        points: scoring.points,
        events: sortedEvents,
        countingEvents: scoring.counting,
        remainingEvents: scoring.remaining,
        runnerEvents: runner.runnerEvents,
        isQualified: meetsMinimumRequirements(
          scoringRules!,
          runner.categories,
          runner.runnerEvents
        ),
      };
    });

    const ascending = scoringRules!.points === 'raw-position';
    const sorted = finalized.sort((a, b) => {
      const pointsDiff =
        ascending ? a.points - b.points : b.points - a.points;
      if (pointsDiff !== 0) {
        return pointsDiff;
      }

      // Tie-breaker: head-to-head comparison in shared races
      const aHeadToHeadWins = countHeadToHeadWins(
        a,
        b,
        results ?? [],
        selectedGrouping
      );
      const bHeadToHeadWins = countHeadToHeadWins(
        b,
        a,
        results ?? [],
        selectedGrouping
      );

      if (aHeadToHeadWins !== bHeadToHeadWins) {
        return bHeadToHeadWins - aHeadToHeadWins;
      }

      // Final tie-breaker: alphabetical by name
      return a.name.localeCompare(b.name);
    });
    let pos = 1;
    for (const runner of sorted)
      if (runner.isQualified)
        runner.overallPosition = pos++;
    return sorted;
  }, [
    selectedCategoryPos,
    allStandings,
    results,
    scoringRules,
    raceMetadata,
    selectedGrouping,
  ]);

  const clubFilteredStandings = useMemo(() => {
    if (selectedClub === 'All') {
      return filteredStandings;
    }

    return filteredStandings.filter((runner) =>
      runner.clubs.includes(selectedClub)
    );
  }, [filteredStandings, selectedClub]);

  const qualifiedStandings = useMemo(
    () => clubFilteredStandings?.filter((r) => r.isQualified) ?? [],
    [clubFilteredStandings]
  );
  const totalRaceCountForSelection = useMemo(() => {
    if (!results) return 0;

    const raceIds = new Set<string>();
    if (selectedCategoryPos === 'All') {
      results.forEach((row) => raceIds.add(row.raceId));
    } else {
      results
        .filter((row) => selectedCategoryPos in row.categoryPos)
        .forEach((row) => raceIds.add(row.raceId));
    }

    return raceIds.size;
  }, [results, selectedCategoryPos]);

  const unqualifiedStandings = useMemo(() => {
    const unqualified = clubFilteredStandings?.filter((r) => !r.isQualified) ?? [];

    if (scoringRules?.points !== 'raw-position') {
      return unqualified;
    }

    return [...unqualified].sort((a, b) => {
      const n = (b.runnerEvents?.length ?? 0) - (a.runnerEvents?.length ?? 0);
      if (n !== 0) return n;
      const estimateA = estimateRawPositionTotal(a, totalRaceCountForSelection);
      const estimateB = estimateRawPositionTotal(b, totalRaceCountForSelection);
      if (estimateA !== estimateB) {
        return estimateA - estimateB;
      }

      const completedA = a.runnerEvents?.length ?? 0;
      const completedB = b.runnerEvents?.length ?? 0;
      if (completedA !== completedB) {
        return completedB - completedA;
      }

      // Fallback to current points then name for deterministic ordering.
      if (a.points !== b.points) {
        return a.points - b.points;
      }

      return a.name.localeCompare(b.name);
    });
  }, [
    clubFilteredStandings,
    scoringRules?.points,
    totalRaceCountForSelection,
  ]);

  const handleRunnerClick = (runnerName: string) => {
    setSelectedRunnerName(runnerName);
    setActiveTab('results');
  };

  useEffect(() => {
    let isCancelled = false;

    async function loadChampionshipYearData() {
      setIsLoading(true);
      setErrorMessage(null);
      setIsNotFound(false);

      try {
        const [result, racesResult] = await Promise.all([
          fetchGzipJson<ChampionshipYearPayload>(
            `/results/${encodeURIComponent(series)}-${encodeURIComponent(year)}.json.gz`
          ),
          fetchGzipJson<RaceMetadata>('/results/races.json.gz'),
        ]);

        if (!isCancelled) {
          if (result.status === 'ok') {
            setScoringRules(result.data.rules);
            setResults(result.data.results);
            setRaceSchedule(result.data.raceSchedule ?? []);
            setPrebuiltTeams(result.data.teams ?? null);
          } else if (result.status === 'not-found') {
            setIsNotFound(true);
            setScoringRules(null);
            setResults(null);
            setRaceSchedule([]);
            setPrebuiltTeams(null);
          } else {
            throw result.error;
          }

          if (racesResult.status === 'ok') {
            setRaceMetadata(racesResult.data);
          } else {
            setRaceMetadata({});
          }
        }
      } catch (error) {
        console.error(
          'Failed to fetch championship year data on client:',
          error
        );
        if (!isCancelled) {
          setErrorMessage(
            'Failed to load championship results. Please try again later.'
          );
          setScoringRules(null);
          setResults(null);
          setPrebuiltTeams(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadChampionshipYearData();
    return () => {
      isCancelled = true;
    };
  }, [series, year]);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 dark:from-slate-950 dark:to-slate-900 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-6xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-4 text-sm text-slate-500 dark:text-slate-400"
        >
          <ol role="list" className="flex flex-wrap gap-2">
            <li>
              <Link href="/" className="text-blue-600 hover:text-blue-800">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href="/championships"
                className="text-blue-600 hover:text-blue-800"
              >
                Championships
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/championships/${encodeURIComponent(series)}`}
                className="text-blue-600 hover:text-blue-800"
              >
                {series}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li
              className="font-semibold text-slate-900 dark:text-slate-100"
              aria-current="page"
            >
              {year}
            </li>
          </ol>
        </nav>

        <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-slate-50">
          {series} {year}
        </h1>

        {isLoading ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              Loading championship results...
            </p>
          </div>
        ) : isNotFound ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              No championship results found for {series} {year}.
            </p>
            <Link
              href={`/championships/${encodeURIComponent(series)}`}
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Back to Championship
            </Link>
          </div>
        ) : errorMessage ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="mb-2 font-semibold text-red-600">{errorMessage}</p>
            <p className="mb-4 text-gray-600 dark:text-slate-300">
              Try again in a few minutes.
            </p>
          </div>
        ) : results ? (
          <div className="space-y-4">
            <div
              className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
              role="tablist"
              aria-label="Championship view selector"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'standings'}
                onClick={() => setActiveTab('standings')}
                className={
                  activeTab === 'standings'
                    ? 'rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-md px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }
              >
                Standings
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'results'}
                onClick={() => setActiveTab('results')}
                className={
                  activeTab === 'results'
                    ? 'rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white'
                    : 'rounded-md px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }
              >
                Results
              </button>
              {scoringRules?.teamSize && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'teams'}
                  onClick={() => setActiveTab('teams')}
                  className={
                    activeTab === 'teams'
                      ? 'rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white'
                      : 'rounded-md px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                  }
                >
                  Teams
                </button>
              )}
            </div>

            {activeTab === 'standings' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="grouping-select"
                      className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Group runners:
                    </label>
                    <select
                      id="grouping-select"
                      value={selectedGrouping}
                      onChange={(e) =>
                        setSelectedGrouping(e.target.value as RunnerGrouping)
                      }
                      className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="name">Name only</option>
                      <option value="name-and-club">Name and club</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="categorypos-select"
                      className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Category:
                    </label>
                    <select
                      id="categorypos-select"
                      value={selectedCategoryPos}
                      onChange={(e) => setSelectedCategoryPos(e.target.value)}
                      className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="All">All</option>
                      {availableCategoryPos.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="club-select"
                      className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Club:
                    </label>
                    <select
                      id="club-select"
                      value={selectedClub}
                      onChange={(e) => setSelectedClub(e.target.value)}
                      className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="All">All</option>
                      {availableClubs.map((club) => (
                        <option key={club} value={club}>
                          {club}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {qualifiedStandings.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                      Qualified Runners
                    </h3>
                    <div className="overflow-x-auto rounded-lg bg-white shadow-md dark:bg-slate-900">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Pos
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Club
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Category
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Points
                            </th>
                            <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 sm:table-cell dark:text-slate-300">
                              Events
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {qualifiedStandings.map((runner) => (
                            <tr
                              key={runner.key}
                              tabIndex={0}
                              onClick={() => handleRunnerClick(runner.name)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' ||
                                  event.key === ' '
                                ) {
                                  event.preventDefault();
                                  handleRunnerClick(runner.name);
                                }
                              }}
                              className="cursor-pointer bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                            >
                              <td className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                {runner.overallPosition}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                <Link
                                  href={`/runner?name=${encodeURIComponent(runner.name)}`}
                                  className="text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  {runner.name}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                {runner.club && clubNameToInfo[runner.club]?.slug ? (
                                  <Link
                                    href={`/clubs/${encodeURIComponent(clubNameToInfo[runner.club].slug)}`}
                                    className="text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    {clubNameToInfo[runner.club]?.name || runner.club}
                                  </Link>
                                ) : (
                                  clubNameToInfo[runner.club]?.name || runner.club
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                {runner.categories.join(', ')}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {formatPoints(runner.points)}
                              </td>
                              <td className="hidden px-4 py-3 text-sm text-slate-700 sm:table-cell dark:text-slate-200">
                                {runner.countingEvents
                                  ?.map(
                                    (event) =>
                                      `${event.raceId}: ${formatPoints(event.points)}`
                                  )
                                  .join(', ')}
                                {runner.remainingEvents &&
                                runner.remainingEvents.length > 0
                                  ? ` (${runner.remainingEvents
                                      .map(
                                        (event) =>
                                          `${event.raceId}: ${formatPoints(event.points)}`
                                      )
                                      .join(', ')})`
                                  : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {unqualifiedStandings.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                      Unqualified Runners
                    </h3>
                    {scoringRules && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {scoringRules.distanceSlots
                          ? `Runners below minimum requirement (${scoringRules.minimum} races, at least one in each distance category for under-${scoringRules.distanceSlots.ageExemption})`
                          : `Runners below minimum requirement (${scoringRules.minimum} races)`}
                      </p>
                    )}
                    <div className="overflow-x-auto rounded-lg bg-white shadow-md dark:bg-slate-900">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Club
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Category
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                              Points
                            </th>
                            <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 sm:table-cell dark:text-slate-300">
                              Events
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {unqualifiedStandings.map((runner) => (
                            <tr
                              key={runner.key}
                              tabIndex={0}
                              onClick={() => handleRunnerClick(runner.name)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === 'Enter' ||
                                  event.key === ' '
                                ) {
                                  event.preventDefault();
                                  handleRunnerClick(runner.name);
                                }
                              }}
                              className="cursor-pointer bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                            >
                              <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {runner.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                {runner.club && clubNameToInfo[runner.club]?.slug ? (
                                  <Link
                                    href={`/clubs/${encodeURIComponent(clubNameToInfo[runner.club].slug)}`}
                                    className="text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    {runner.club}
                                  </Link>
                                ) : (
                                  runner.club
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                {runner.categories.join(', ')}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {formatPoints(runner.points)}
                              </td>
                              <td className="hidden px-4 py-3 text-sm text-slate-700 sm:table-cell dark:text-slate-200">
                                {runner.countingEvents
                                  ?.map(
                                    (event) =>
                                      `${event.raceId}: ${formatPoints(event.points)}`
                                  )
                                  .join(', ')}
                                {runner.remainingEvents &&
                                runner.remainingEvents.length > 0
                                  ? `${
                                      runner.countingEvents &&
                                      runner.countingEvents.length > 0
                                        ? ' '
                                        : ''
                                    }(${runner.remainingEvents
                                      .map(
                                        (event) =>
                                          `${event.raceId}: ${formatPoints(event.points)}`
                                      )
                                      .join(', ')})`
                                  : ''}
                                  {scoringRules?.minimum && (runner.countingEvents?.length ?? 0) < scoringRules.minimum
                                   ? `; ${scoringRules.minimum - (runner.countingEvents?.length ?? 0)} more needed`
                                   : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {qualifiedStandings.length === 0 &&
                  unqualifiedStandings.length === 0 && (
                    <div className="rounded-lg bg-slate-50 p-6 text-center dark:bg-slate-800">
                      <p className="text-slate-600 dark:text-slate-400">
                        No standings data available for this selection.
                      </p>
                    </div>
                  )}
              </div>
            ) : activeTab === 'results' ? (
              <RaceResultsDataTable
                data={results}
                races={raceMetadata}
                showRaceColumn
                showYearFilter={false}
                initialNameFilter={selectedRunnerName}
                showPointsColumn
              />
            ) : (
              /* Teams tab */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="team-category-select"
                    className="text-sm font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Category:
                  </label>
                  <select
                    id="team-category-select"
                    value={selectedTeamCategory}
                    onChange={(e) => setSelectedTeamCategory(e.target.value)}
                    className="rounded border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {availableTeamCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                {teamStandings.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg bg-white shadow-md dark:bg-slate-900">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                      <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr>
                          {(['position', 'club'] as const).map((col) => (
                            <th
                              key={col}
                              onClick={() => {
                                if (teamSortKey === col) {
                                  setTeamSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                                } else {
                                  setTeamSortKey(col);
                                  setTeamSortDir('asc');
                                }
                              }}
                              className={`cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100`}
                            >
                              {col === 'position' ? 'Pos' : 'Club'}
                              {teamSortKey === col ? (teamSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </th>
                          ))}
                          {raceSchedule.map((entry) => {
                            const isFuture =
                              !entry.date ||
                              entry.date > new Date().toISOString().slice(0, 10);
                            const isActive = teamSortKey === entry.raceId;
                            return (
                              <th
                                key={entry.raceId}
                                onClick={() => {
                                  if (isActive) {
                                    setTeamSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                                  } else {
                                    setTeamSortKey(entry.raceId);
                                    setTeamSortDir('desc');
                                  }
                                }}
                                className={`cursor-pointer select-none px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100${isFuture ? ' hidden sm:table-cell' : ''}`}
                              >
                                {raceMetadata[entry.raceId]?.title ?? entry.raceId}
                                {isActive ? (teamSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                              </th>
                            );
                          })}
                          <th
                            onClick={() => {
                              if (teamSortKey === 'total') {
                                setTeamSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                              } else {
                                setTeamSortKey('total');
                                setTeamSortDir('desc');
                              }
                            }}
                            className="cursor-pointer select-none px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                          >
                            Total{teamSortKey === 'total' ? (teamSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                          </th>
                        </tr>
                      </thead>
                      {qualifiedTeamStandings.length > 0 && (
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {qualifiedTeamStandings.map((row) => {
                          const isExpanded = expandedTeamClub === row.club;
                          const detailsId = `team-details-${row.club.replace(/\s+/g, '-').toLowerCase()}`;
                          return (
                            <Fragment key={row.club}>
                              <tr className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60">
                                <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {row.position === '-' ? <span className="text-slate-400 dark:text-slate-500">—</span> : row.position}
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      aria-expanded={isExpanded}
                                      aria-controls={detailsId}
                                      onClick={() =>
                                        setExpandedTeamClub(isExpanded ? null : row.club)
                                      }
                                      className="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      {isExpanded ? 'Hide' : 'Details'}
                                    </button>
                                    {row.club && clubNameToInfo[row.club]?.slug ? (
                                      <Link
                                        href={`/clubs/${encodeURIComponent(clubNameToInfo[row.club].slug)}`}
                                        className="text-blue-600 hover:underline dark:text-blue-400"
                                      >
                                        {row.club}
                                      </Link>
                                    ) : (
                                      row.club
                                    )}
                                  </div>
                                </td>
                                {raceSchedule.map((entry) => {
                                  const score = row.raceScores[entry.raceId];
                                  const isFuture =
                                    !entry.date ||
                                    entry.date > new Date().toISOString().slice(0, 10);
                                  return (
                                    <td
                                      key={entry.raceId}
                                      className={`whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-200${isFuture ? ' hidden sm:table-cell' : ''}`}
                                    >
                                      {score !== null && score !== undefined
                                        ? formatPoints(score)
                                        : ''}
                                    </td>
                                  );
                                })}
                                <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {row.isQualified ? formatPoints(row.total) : <span className="text-slate-500 dark:text-slate-400">{formatPoints(row.total)}</span>}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr id={detailsId} className="bg-slate-50 dark:bg-slate-950/40">
                                  <td
                                    colSpan={raceSchedule.length + 3}
                                    className="px-4 py-4 text-sm text-slate-700 dark:text-slate-200"
                                  >
                                    <div className="space-y-3">
                                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                        Counting runners for {selectedTeamCategory}
                                      </p>
                                      <div className="grid gap-3 md:grid-cols-2">
                                        {raceSchedule.map((entry) => {
                                          const breakdown = row.raceBreakdown[entry.raceId];
                                          const raceTitle =
                                            raceMetadata[entry.raceId]?.title ?? entry.raceId;
                                          return (
                                            <div
                                              key={entry.raceId}
                                              className="rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                                            >
                                              <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
                                                {raceTitle}
                                              </p>
                                              {breakdown?.qualified &&
                                              breakdown.contributors.length > 0 ? (
                                                <ul className="space-y-1">
                                                  {breakdown.contributors.map((runner) => (
                                                    <li
                                                      key={`${entry.raceId}-${runner.name}-${runner.categoryPosition}`}
                                                      className="text-sm text-slate-700 dark:text-slate-200"
                                                    >
                                                      <span className="font-medium text-slate-900 dark:text-slate-100">
                                                        {runner.name}
                                                      </span>{' '}
                                                      {formatOrdinal(runner.categoryPosition)} ({runner.time.replace(/^00:/, "")})
                                                    </li>
                                                  ))}
                                                </ul>
                                              ) : (
                                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                                  No qualified team result.
                                                </p>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                          })}
                        </tbody>
                      )}
                      {unqualifiedTeamStandings.length > 0 && (
                        <>
                          <tbody>
                            <tr className="bg-slate-100 dark:bg-slate-800">
                              <td
                                colSpan={raceSchedule.length + 3}
                                className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                              >
                                Unqualified Teams
                                {scoringRules && (
                                  <span className="ml-2 font-normal normal-case text-slate-500 dark:text-slate-400">
                                    {scoringRules.distanceSlots
                                      ? `(fewer than ${scoringRules.minimum} races, or missing a short/medium/long result for under-${scoringRules.distanceSlots.ageExemption}s)`
                                      : `(fewer than ${scoringRules.minimum} races)`}
                                  </span>
                                )}
                              </td>
                            </tr>
                          </tbody>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {unqualifiedTeamStandings.map((row) => {
                              const isExpanded = expandedTeamClub === row.club;
                              const detailsId = `team-details-unq-${row.club.replace(/\s+/g, '-').toLowerCase()}`;
                              return (
                                <Fragment key={row.club}>
                                  <tr className="bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60">
                                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400 dark:text-slate-500">
                                      —
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          aria-expanded={isExpanded}
                                          aria-controls={detailsId}
                                          onClick={() =>
                                            setExpandedTeamClub(isExpanded ? null : row.club)
                                          }
                                          className="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                        >
                                          {isExpanded ? 'Hide' : 'Details'}
                                        </button>
                                        {row.club && clubNameToInfo[row.club]?.slug ? (
                                          <Link
                                            href={`/clubs/${encodeURIComponent(clubNameToInfo[row.club].slug)}`}
                                            className="text-blue-600 hover:underline dark:text-blue-400"
                                          >
                                            {row.club}
                                          </Link>
                                        ) : (
                                          row.club
                                        )}
                                      </div>
                                    </td>
                                    {raceSchedule.map((entry) => {
                                      const score = row.raceScores[entry.raceId];
                                      const isFuture =
                                        !entry.date ||
                                        entry.date > new Date().toISOString().slice(0, 10);
                                      return (
                                        <td
                                          key={entry.raceId}
                                          className={`whitespace-nowrap px-4 py-3 text-right text-sm text-slate-500 dark:text-slate-400${isFuture ? ' hidden sm:table-cell' : ''}`}
                                        >
                                          {score !== null && score !== undefined
                                            ? formatPoints(score)
                                            : ''}
                                        </td>
                                      );
                                    })}
                                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-500 dark:text-slate-400">
                                      {formatPoints(row.total)}
                                    </td>
                                  </tr>
                                  {isExpanded && (
                                    <tr id={detailsId} className="bg-slate-50 dark:bg-slate-950/40">
                                      <td
                                        colSpan={raceSchedule.length + 3}
                                        className="px-4 py-4 text-sm text-slate-700 dark:text-slate-200"
                                      >
                                        <div className="space-y-3">
                                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            Counting runners for {selectedTeamCategory}
                                          </p>
                                          <div className="grid gap-3 md:grid-cols-2">
                                            {raceSchedule.map((entry) => {
                                              const breakdown = row.raceBreakdown[entry.raceId];
                                              const raceTitle =
                                                raceMetadata[entry.raceId]?.title ?? entry.raceId;
                                              return (
                                                <div
                                                  key={entry.raceId}
                                                  className="rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                                                >
                                                  <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
                                                    {raceTitle}
                                                  </p>
                                                  {breakdown?.qualified &&
                                                  breakdown.contributors.length > 0 ? (
                                                    <ul className="space-y-1">
                                                      {breakdown.contributors.map((runner) => (
                                                        <li
                                                          key={`${entry.raceId}-${runner.name}-${runner.categoryPosition}`}
                                                          className="text-sm text-slate-700 dark:text-slate-200"
                                                        >
                                                          <span className="font-medium text-slate-900 dark:text-slate-100">
                                                            {runner.name}
                                                          </span>{' '}
                                                          {formatOrdinal(runner.categoryPosition)} ({runner.time.replace(/^00:/, '')})
                                                        </li>
                                                      ))}
                                                    </ul>
                                                  ) : (
                                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                                      No qualified team result.
                                                    </p>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </>
                      )}
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 p-6 text-center dark:bg-slate-800">
                    <p className="text-slate-600 dark:text-slate-400">
                      No team standings data available for this category.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-white p-8 text-center shadow-md dark:bg-slate-900">
            <p className="text-gray-600 dark:text-slate-300">
              No championship data available.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
