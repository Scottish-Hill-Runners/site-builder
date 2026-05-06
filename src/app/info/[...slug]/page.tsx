import { InfoPageContent, getAllInfoItems } from '@/app/info/page';

interface InfoSlugPageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  const items = await getAllInfoItems();
  return items
    .filter((item) => item.slug !== 'index')
    .map((item) => {
      // Remove 'index' suffix from slug for route params
      // 'joining/index' → ['joining']
      // 'joining/juniors' → ['joining', 'juniors']
      // 'safety/organisers/index' → ['safety', 'organisers']
      const parts = item.slug.split('/');
      if (parts[parts.length - 1] === 'index') {
        parts.pop();
      }
      return { slug: parts };
    });
}

export default async function InfoSlugPage({ params }: InfoSlugPageProps) {
  const { slug } = await params;
  const allItems = await getAllInfoItems();

  // First try the exact path
  let displaySlug = slug.join('/');
  if (!allItems.find((item) => item.slug === displaySlug)) {
    // If not found, try with /index appended
    displaySlug = `${displaySlug}/index`;
  }

  return <InfoPageContent slug={displaySlug} />;
}
