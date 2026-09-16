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
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const totalWeight = pool.reduce((sum, folder) => sum + folder.count, 0);
    let remaining = Math.random() * totalWeight;
    let index = pool.length - 1;
    for (let candidate = 0; candidate < pool.length; candidate += 1) {
      remaining -= pool[candidate].count;
      if (remaining <= 0) {
        index = candidate;
        break;
      }
    }
    picked.push(pool[index]);
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
