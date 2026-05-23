import type { GeoJSON } from 'geojson';

export interface RaceResult {
  raceId: string;
  year: string;
  position: number;
  name: string;
  club: string;
  category: string;
  categoryPos: { [cat: string]: number };
  time: string;
  points?: number;
  /** Optional team name (ephemeral, scoped to race instance). E.g., "Carnethy A". */
  team?: string;
  /** Optional leg identifier (numeric or string). E.g., 1, 2, or "Prologue". */
  leg?: number | string;
}

export interface ResultsFocusContext {
  raceId: string;
  year: string;
  source: 'selected-row' | 'table-visible';
}

export interface Era {
  label: string;
  from?: number;
  to?: number;
}

export interface RaceInfo {
  title: string;
  venue: string;
  distance: number;
  climb?: number;
  maleRecord?: string;
  femaleRecord?: string;
  nonBinaryRecord?: string;
  web?: string;
  organiser?: number[];
  eras?: Era[];
  /** Whether this race has team entries (based on Team column in CSV). */
  hasTeams?: boolean;
  /** Whether this race has leg/relay entries (based on Leg column in CSV). */
  hasLegs?: boolean;
}

export interface ElevationChartData {
  area: string;
  line: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  minEle: number;
  maxEle: number;
  totalDistKm: number;
  gain: number;
  loss: number;
  W: number;
  H: number;
  padTop: number;
  padBottom: number;
  padLeft: number;
  padRight: number;
}

export interface RaceData {
  info: RaceInfo;
  contents: string;
  results: RaceResult[];
  hasGpx: boolean;
  hasRaceMap?: boolean;
  routeGeojson?: GeoJSON;
  elevationChartData?: ElevationChartData;
}

export interface AllRaceData {
  [raceId: string]: RaceInfo;
}

export interface DistanceSlotsRule {
  short?: number;
  medium?: number;
  long?: number;
  /** Runners whose age category is >= this value are exempt from the distance-slots constraint */
  ageExemption?: number;
}

/**
 * Composable scoring rules for a championship series + year.
 * Resolved by merging `rules.default` with an optional year-specific override
 * in the championship frontmatter.
 */
export interface ScoringRules {
  /** How per-race points are computed at build time. */
  points: 'position-bonus' | 'raw-position' | 'time-ratio';
  /**
   * Reference time used when points === 'time-ratio'.
   * - 'overall-winner'    – this year's single fastest time across all runners (one value for everyone)
   * - 'mf-winner'         – this year's gender-specific winning time (male/female winner separately)
   * - 'mf-record'         – min(mf-winner, stored maleRecord/femaleRecord in race index.md)
   */
  referenceTime?: 'overall-winner' | 'mf-winner' | 'mf-record';
  /** Multiplier for time-ratio points (default 1000). */
  scale?: number;
  /** Positions that earn points for position-bonus mode (default 40). */
  topN?: number;
  /** How many results count toward a runner's total. */
  count: number;
  /** Minimum races a runner must complete to appear in the qualified standings. */
  minimum: number;
  /**
   * If present, enables bucket-based counting (SHR style):
   * the runner must contribute at least the specified number of results per
   * distance bucket, unless they qualify for the ageExemption.
   */
  distanceSlots?: DistanceSlotsRule;
}

export interface ChampionshipYearPayload {
  rules: ScoringRules;
  results: RaceResult[];
}
