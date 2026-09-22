import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { prebuildDir } from '../../scripts/write-gz-util';

export interface ClubItem {
  slug: string;
  name: string;
  web?: string;
  contact?: string;
  content: string;
  active?: boolean;
}

let cachedClubItems: ClubItem[] | null = null;

async function readClubItemsFromFile(): Promise<ClubItem[]> {
  const filePath = path.join(prebuildDir, 'clubs.json.gz');
  const compressed = await fs.readFile(filePath);
  const file = gunzipSync(compressed).toString('utf8');
  const items = JSON.parse(file) as ClubItem[];

  if (!Array.isArray(items)) {
    throw new Error('clubs.json.gz format is invalid');
  }

  return items;
}

export async function getClubItems(): Promise<ClubItem[]> {
  try {
    if (cachedClubItems !== null) {
      return cachedClubItems;
    }

    const items = await readClubItemsFromFile();
    cachedClubItems = items;

    return items;
  } catch (error) {
    console.error('Error fetching clubs:', error);
    return [];
  }
}
