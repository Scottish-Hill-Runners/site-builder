import ChampionshipPageClient from '@/app/championships/[series]/championship-page-client';

export async function generateStaticParams() {
  return [
    { series: 'BogAndBurn' },
    { series: 'LongClassics' },
    { series: 'SHR' },
    { series: 'Under23' },
  ];
}

export default async function ChampionshipPage({
  params,
}: {
  params: Promise<{ series: string }>;
}) {
  const { series } = await params;

  return <ChampionshipPageClient series={series} />;
}
