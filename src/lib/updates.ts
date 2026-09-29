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
