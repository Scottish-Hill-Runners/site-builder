import { Suspense } from 'react';
import RacePageClient from '@/app/races/[raceId]/race-page-client';
import { getRaceImagesBySlug } from '@/lib/imageCollections';
import { cloudinaryUrlForPresetFromEnv } from '@/lib/cloudinary';
import { loadAllRaces, loadCalendar, loadRaceResults } from '@/lib/results-data';
import type { AllRaceData, RaceData, RaceInfo } from '@/types/datatable';

const SITE_URL = 'https://beta.scottishhillrunners.uk';

export async function generateStaticParams() {
  const allRaces = await loadAllRaces().catch(() => ({}) as AllRaceData);
  return Object.keys(allRaces).map((raceId) => ({ raceId }));
}

function extractDescription(contents: string, race: RaceInfo): string {
  const paragraph = contents
    .trim()
    .split(/\r?\n\r?\n/)[0]
    .replace(/\s+/g, ' ')
    .trim();

  if (paragraph)
    return paragraph;

  const distance = race.distance ? `${race.distance} km` : 'race';
  return `${race.title} is a ${distance} hill running event held at ${race.venue}.`;
}

function buildAdditionalProperties(race: RaceInfo) {
  const properties: Array<{ '@type': 'PropertyValue'; name: string; value: string }> = [];

  if (race.distance != null)
    properties.push({
      '@type': 'PropertyValue',
      name: 'Distance',
      value: `${race.distance} km`,
    });

  if (race.climb != null)
    properties.push({
      '@type': 'PropertyValue',
      name: 'Climb',
      value: `${race.climb} m`,
    });

  return properties;
}

function buildRaceJsonLd(raceId: string, raceData: RaceData, eventDate?: string) {
  const url = `${SITE_URL}/races/${encodeURIComponent(raceId)}`;
  const description = extractDescription(raceData.contents, raceData.info);
  const additionalProperty = buildAdditionalProperties(raceData.info);

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: raceData.info.title,
    url,
    description,
    location: {
      '@type': 'Place',
      name: raceData.info.venue,
    },
    sponsor: {
      '@type': 'Organization',
      name: 'Scottish Hill Runners',
    },
    sport: 'Running',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
  };

  if (eventDate)
    jsonLd.startDate = eventDate;
  if (raceData.info.web)
    jsonLd.sameAs = raceData.info.web;
  if (additionalProperty.length > 0)
    jsonLd.additionalProperty = additionalProperty;

  return jsonLd;
}

export default async function RacePage({
  params,
}: {
  params: Promise<{ raceId: string }>;
}) {
  const { raceId } = await params;
  const [raceImages, raceData, calendarEntries] = await Promise.all([
    getRaceImagesBySlug(raceId),
    loadRaceResults(raceId),
    loadCalendar().catch(() => []),
  ]);
  const optimizedRaceImages = raceImages
    ? {
        hero: raceImages.hero.map((item) => ({
          ...item,
          imageUrl: cloudinaryUrlForPresetFromEnv(item.sourcePath, 'raceHero'),
        })),
        gallery: raceImages.gallery.map((item) => ({
          ...item,
          imageUrl: cloudinaryUrlForPresetFromEnv(item.sourcePath, 'gallery'),
        })),
      }
    : null;

  const eventDate = calendarEntries.find((entry) => entry.raceId === raceId)?.Date;
  const jsonLd = buildRaceJsonLd(raceId, raceData, eventDate);

  return (
    <>
      <script type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </script>
      <Suspense fallback={null}>
        <RacePageClient raceId={raceId} raceImages={optimizedRaceImages} />
      </Suspense>
    </>
  );
}
