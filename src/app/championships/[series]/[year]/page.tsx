import ChampionshipYearPageClient from '@/app/championships/[series]/[year]/championship-year-page-client';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

type ChampionshipData = {
  slug: string;
  years: { [year: string]: string[] };
  yearHasData?: { [year: string]: boolean };
};

export async function generateStaticParams() {
  const championshipsPath = path.join(
    process.cwd(),
    'public',
    'championships.json.gz'
  );
  if (!fs.existsSync(championshipsPath))
    return [] as { series: string; year: string }[];

  const raw = zlib
    .gunzipSync(fs.readFileSync(championshipsPath))
    .toString('utf8');
  const championships = JSON.parse(raw) as ChampionshipData[];

  return championships.flatMap((championship) =>
    Object.keys(championship.years)
      .filter((year) => championship.yearHasData?.[year] ?? true)
      .map((year) => ({
        series: championship.slug,
        year,
      }))
  );
}

export default async function ChampionshipYearPage({
  params,
}: {
  params: Promise<{ series: string; year: string }>;
}) {
  const { series, year } = await params;
  return <ChampionshipYearPageClient series={series} year={year} />;
}
