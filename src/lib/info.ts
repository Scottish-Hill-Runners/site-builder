import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { prebuildDir } from '../../scripts/write-gz-util';

export interface ContentItem {
  slug: string;
  title: string;
  content: string;
}

export type InfoItem = ContentItem;

let cachedAllInfoItems: InfoItem[] | null = null;
let cachedInfoItems: InfoItem[] | null = null;

async function readAllInfoItemsFromFile(): Promise<InfoItem[]> {
  const filePath = path.join(prebuildDir, 'info.json.gz');
  const compressed = await fs.readFile(filePath);
  const file = gunzipSync(compressed).toString('utf8');
  const allItems = JSON.parse(file) as InfoItem[];

  if (!Array.isArray(allItems)) {
    throw new Error('info.json.gz format is invalid');
  }

  return allItems;
}

/** Get all info items without filtering (for unified routing) */
export async function getAllInfoItems(): Promise<InfoItem[]> {
  try {
    if (cachedAllInfoItems !== null) {
      return cachedAllInfoItems;
    }

    const allItems = await readAllInfoItemsFromFile();
    cachedAllInfoItems = allItems;

    return allItems;
  } catch (error) {
    console.error('Error fetching all info items:', error);
    return [];
  }
}

/** Get all info items */
export async function getInfoItems(): Promise<InfoItem[]> {
  try {
    if (cachedInfoItems !== null) {
      return cachedInfoItems;
    }

    const allItems = await readAllInfoItemsFromFile();
    cachedInfoItems = allItems;

    return allItems;
  } catch (error) {
    console.error('Error fetching info:', error);
    return [];
  }
}
