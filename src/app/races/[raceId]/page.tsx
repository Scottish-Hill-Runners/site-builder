import { Suspense } from 'react';
import RacePageClient from '@/app/races/[raceId]/race-page-client';
import { getRaceImagesBySlug } from '@/lib/imageCollections';
import { loadAllRaces } from '@/lib/results-data';
import type { AllRaceData } from '@/types/datatable';

export async function generateStaticParams() {
  const allRaces = await loadAllRaces().catch(() => ({}) as AllRaceData);
  return Object.keys(allRaces).map((raceId) => ({ raceId }));
}

export default async function RacePage({
  params,
}: {
  params: Promise<{ raceId: string }>;
}) {
  const { raceId } = await params;
  const raceImages = await getRaceImagesBySlug(raceId);

  return (
    <Suspense fallback={null}>
      <RacePageClient raceId={raceId} raceImages={raceImages} />
    </Suspense>
  );
}
