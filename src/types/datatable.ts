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
}

export interface RaceData {
  info: RaceInfo;
  contents: string;
  results: RaceResult[];
  hasGpx: boolean;
  hasRaceMap?: boolean;
}

export interface AllRaceData {
  [raceId: string]: RaceInfo;
}
