import { RaceInfo } from '@/types/datatable';

export default function raceTitle(raceId: string, races?: { [raceId: string]: RaceInfo }): string {
  return races?.[raceId]?.title ?? raceId;
}
