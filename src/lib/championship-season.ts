export function championshipSeasonYears(season: string): number[] {
  const match = /^(\d{4})(?:\/(\d{2}|\d{4}))?$/.exec(season);
  if (!match) return [];
  const start = Number(match[1]);
  if (!match[2]) return [start];
  const end = match[2].length === 2
    ? Math.floor((start + 1) / 100) * 100 + Number(match[2])
    : Number(match[2]);
  return end === start + 1 ? [start, end] : [];
}

export function championshipSeasonSlug(season: string): string {
  return season.replace('/', '-');
}

export function championshipSeasonDate(
  season: string,
  raceId: string,
  calendarDates: Map<string, string[]>
): string | undefined {
  const years = championshipSeasonYears(season);
  if (years.length === 0) return undefined;
  const dates = years.flatMap((year) => calendarDates.get(`${year}/${raceId}`) ?? []);
  if (years.length === 1) return dates[0];
  const newYear = Date.UTC(years[1], 0, 1);
  return dates.sort((a, b) => {
    const distance = Math.abs(Date.parse(`${a}T00:00:00Z`) - newYear)
      - Math.abs(Date.parse(`${b}T00:00:00Z`) - newYear);
    return distance || a.localeCompare(b);
  })[0];
}
