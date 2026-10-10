import { ADMIN_HOST } from './site-config';

export type UpdateEntry = {
  subject: string;
  created_at: string;
  status?: string;
  updatedAt?: string;
  kind?: string;
  path?: string;
};

export async function getRecentUpdates(): Promise<UpdateEntry[]> {
  const result = await fetch(`${ADMIN_HOST}/api/updates`);
  if (!result.ok) return [];
  try {
    const json = await result.json();
    if (!Array.isArray(json)) return [];
    return (json as UpdateEntry[]).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  } catch {
    return [];
  }
}

// Content-repo paths (e.g. `races/Tinto/2025.csv`, `epics/foo.md`)
// don't line up with site routes 1:1; map the common shapes we know about.
// Returns undefined for paths with no obvious page (e.g. blob-upload feeds).
export function updatePathToRoute(path: string): string | undefined {
  if (path === 'calendar.csv') return '/calendar';

  let match = path.match(/^races\/([-\w]+)\/index\.md$/);
  if (match) return `/races/${match[1]}`;

  match = path.match(/^races\/([-\w]+)\/(\d{4}(?:-\w+)?)\.csv$/);
  if (match) return `/races/${match[1]}?year=${match[2]}`;

  match = path.match(/^races\/([-\w]+)\/[-\w]+\.geojson$/);
  if (match) return `/races/${match[1]}`;

  match = path.match(/^clubs\/([-\w]+)(?:\/index)?\.md$/);
  if (match) return `/clubs/${match[1]}`;

  match = path.match(/^epics\/([-\w]+)\.md$/);
  if (match) return `/epics/${match[1]}`;

  match = path.match(/^info\/(.+)\.md$/);
  if (match) return `/info/${match[1].replace(/\/index$/, '')}`;

  if (path.startsWith('news/')) return '/news';

  return undefined;
}

