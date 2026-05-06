import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

// ── Runtime item types ─────────────────────────────────────────────────────

export interface HomepageImageItem {
  path: string;
  sourcePath: string;
  imageUrl: string;
  tier?: string;
  tags?: string[];
}

export interface RaceImageItem {
  path: string;
  sourcePath: string;
  imageUrl: string;
}

export interface RaceImagesBySlugEntry {
  hero: RaceImageItem[];
  gallery: RaceImageItem[];
}

export interface DocumentItem {
  path: string;
  sourcePath: string;
  imageUrl: string;
  title?: string;
  description?: string;
  tags?: string[];
}

export interface PortraitItem {
  path: string;
  sourcePath: string;
  imageUrl: string;
  tags?: string[];
}

// ── Payload shape (v3) ─────────────────────────────────────────────────────

interface ImageCollectionsPayload {
  version: number;
  generatedAt?: string;
  source?: {
    repo?: string;
    sha?: string;
    baseUrl?: string;
    missing?: boolean;
  };
  homepageImages: HomepageImageItem[];
  raceImagesBySlug: Record<string, RaceImagesBySlugEntry>;
  documents: DocumentItem[];
  committeePortraits: PortraitItem[];
}

// ── Loader ─────────────────────────────────────────────────────────────────

let cachedPayload: ImageCollectionsPayload | null = null;

const emptyPayload: ImageCollectionsPayload = {
  version: 3,
  homepageImages: [],
  raceImagesBySlug: {},
  documents: [],
  committeePortraits: [],
};

async function readPayload(): Promise<ImageCollectionsPayload> {
  const filePath = path.join(
    process.cwd(),
    'public',
    'image-collections.json.gz'
  );
  const compressed = await fs.readFile(filePath);
  const payload = JSON.parse(
    gunzipSync(compressed).toString('utf8')
  ) as ImageCollectionsPayload;
  if (!payload || typeof payload !== 'object')
    throw new Error('image-collections.json.gz format is invalid');
  return payload;
}

async function getPayload(): Promise<ImageCollectionsPayload> {
  if (cachedPayload !== null) return cachedPayload;
  try {
    cachedPayload = await readPayload();
    return cachedPayload;
  } catch (error) {
    console.warn('Could not load image collections:', error);
    return emptyPayload;
  }
}

// ── Public accessors ───────────────────────────────────────────────────────

export async function getHomepageImages(): Promise<HomepageImageItem[]> {
  return (await getPayload()).homepageImages ?? [];
}

export async function getRaceImagesBySlug(
  slug: string
): Promise<RaceImagesBySlugEntry | null> {
  const { raceImagesBySlug } = await getPayload();
  if (!raceImagesBySlug) return null;
  if (raceImagesBySlug[slug]) return raceImagesBySlug[slug];
  const lower = slug.toLowerCase();
  const key = Object.keys(raceImagesBySlug).find(
    (k) => k.toLowerCase() === lower
  );
  return key ? raceImagesBySlug[key] : null;
}

export async function getDocuments(): Promise<DocumentItem[]> {
  return (await getPayload()).documents ?? [];
}

export async function getCommitteePortraits(): Promise<PortraitItem[]> {
  return (await getPayload()).committeePortraits ?? [];
}
