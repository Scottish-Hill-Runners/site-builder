import { ADMIN_HOST } from './site-config';

export type AssetEntry = {
  public_id: string;
  resource_type: string;
  format: string;
  width?: number;
  height?: number;
  title?: string;
  description?: string;
  tags?: string[];
  etag?: string;
};

export type FolderEntry = {
  path: string;
  count: number;
};

export async function getFolders(): Promise<FolderEntry[]> {
  const result = await fetch(`${ADMIN_HOST}/api/assets`);
  if (!result.ok) return [];
  try {
    const json = await result.json();
    if (!json || typeof json !== 'object' || !Array.isArray(json.folders))
      return [];
    return json.folders as FolderEntry[];
  } catch {
    return [];
  }
}

// Picks `count` folders without replacement, weighted by each folder's image count.
export function pickWeightedFolders(folders: FolderEntry[], count: number): FolderEntry[] {
  const pool = [...folders];
  const picked: FolderEntry[] = [];
  let totalWeight = pool.reduce((sum, folder) => sum + folder.count, 0);
  for (let i = 0; i < count && pool.length > 0; i++) {
    let remaining = Math.random() * totalWeight;
    let index = pool.length - 1;
    for (let candidate = 0; candidate < pool.length; candidate++) {
      remaining -= pool[candidate].count;
      if (remaining <= 0) {
        index = candidate;
        break;
      }
    }
    picked.push(pool[index]);
    totalWeight -= pool[index].count;
    pool.splice(index, 1);
  }
  
  return picked;
}

export async function getAssets(folder: string): Promise<AssetEntry[]> {
  const result = await fetch(`${ADMIN_HOST}/api/assets?folder=${folder}`);
  if (!result.ok)
    return [];
  try {
    const json = await result.json();
    if (!json || typeof json !== 'object' || !Array.isArray(json.entries))
      return [];
    return json.entries as AssetEntry[];
  } catch {
    return [];
  }
}

// Selects 6 folders under "homepage" or "races/*" (weighted by image count), then
// picks one random image from each. Meant to be called client-side so it's recomputed
// on every page load.
export async function pickHomepageImages(count = 6): Promise<AssetEntry[]> {
  const folders = await getFolders();
  const candidates = folders.filter(
    (folder) => folder.path === 'homepage' || folder.path.startsWith('races/')
  );
  const chosenFolders = pickWeightedFolders(candidates, count);
  const assetsByFolder = await Promise.all(
    chosenFolders.map((folder) => getAssets(folder.path))
  );
  return assetsByFolder
    .filter((assets) => assets.length > 0)
    .map((assets) => assets[Math.floor(Math.random() * assets.length)]);
}

export async function getRaceImages(raceId: string)
: Promise<{hero: AssetEntry, gallery: AssetEntry[]} | null> {
  const assets = await getAssets(`races/${raceId}`);
  if (assets.length === 0) return null;
  const heroCandidates = assets.filter(asset => asset.width && asset.width > 800);
  const hero = heroCandidates.length > 0
    ? heroCandidates[Math.floor(Math.random() * heroCandidates.length)]
    : assets[Math.floor(Math.random() * assets.length)];
  return {
    hero,
    gallery: assets.filter(asset => asset !== hero),
  };
}

export async function getDocuments(): Promise<AssetEntry[]> {
  return await getAssets('documents');
}

export async function getCommitteePortraits(): Promise<AssetEntry[]> {
  return await getAssets('portraits');
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function tagMatchCount(asset: AssetEntry, tags: string[]): number {
  if (tags.length === 0) return 0;
  const assetTags = new Set((asset.tags ?? []).map((tag) => tag.toLowerCase()));
  return tags.reduce((count, tag) => count + (assetTags.has(tag) ? 1 : 0), 0);
}

// Picks the asset with the most matching tags; ties broken randomly.
export function pickBestMatch(assets: AssetEntry[], tags: string[]): AssetEntry | null {
  let best: AssetEntry | null = null;
  let bestScore = 0;
  let bestTieCount = 0;
  for (const asset of assets) {
    const score = tagMatchCount(asset, tags);
    if (score > bestScore) {
      best = asset;
      bestScore = score;
      bestTieCount = 1;
    } else if (score === bestScore) {
      bestTieCount += 1;
      if (Math.random() < 1 / bestTieCount) best = asset;
    }
  }

  return bestScore == 0 ? null : best;
}

export function assetName(asset: AssetEntry): string {
  return asset.title ?? asset.description ?? asset.public_id;
}

export function pickAllMatches(assets: AssetEntry[], tags: string[]): AssetEntry[] {
  return assets
    .filter(asset => tagMatchCount(asset, tags) > 0)
    .sort((a, b) => assetName(a).localeCompare(assetName(b)));
}
