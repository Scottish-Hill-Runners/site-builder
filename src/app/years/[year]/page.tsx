import YearPageClient from '@/app/years/[year]/year-page-client';
import { loadAvailableYears } from '@/lib/results-data';

export async function generateStaticParams() {
  const years = await loadAvailableYears().catch(() => [] as string[]);
  return years.map((year) => ({ year }));
}

export default async function YearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = await params;
  return <YearPageClient year={year} />;
}
