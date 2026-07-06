import ChampionshipPageClient from '@/app/championships/[series]/championship-page-client';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

type ChampionshipSummary = {
  slug: string;
};

export async function generateStaticParams() {
  const championshipsPath = path.join(
    process.cwd(),
    'public',
    'championships.json.gz'
  );

  if (!fs.existsSync(championshipsPath)) {
    return [] as { series: string }[];
  }

  const raw = zlib
    .gunzipSync(fs.readFileSync(championshipsPath))
    .toString('utf8');
  const championships = JSON.parse(raw) as ChampionshipSummary[];

  return championships.map((championship) => ({
    series: championship.slug,
  }));
}

export default async function ChampionshipPage({
  params,
}: {
  params: Promise<{ series: string }>;
}) {
  const { series } = await params;

  return <ChampionshipPageClient series={series} />;
}
