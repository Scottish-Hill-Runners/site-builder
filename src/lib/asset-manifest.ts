const MANIFEST_URL = '/asset-manifest.json';
const TTL_MS = 5 * 60 * 1000; // 5 minutes

let manifest: Record<string, string> | null = null;
let loadedAt: number | null = null;
let inFlight: Promise<Record<string, string>> | null = null;

async function fetchManifest(): Promise<Record<string, string>> {
  try {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok)
      throw new Error(`asset-manifest fetch failed: ${response.status}`);
    const data = (await response.json()) as { files: Record<string, string> };
    manifest = data.files;
    loadedAt = Date.now();
    return manifest;
  } catch {
    // Graceful degradation: return last known manifest, or empty so paths are returned unversioned.
    return manifest ?? {};
  } finally {
    inFlight = null;
  }
}

function getManifest(): Promise<Record<string, string>> {
  const now = Date.now();
  if (manifest !== null && loadedAt !== null && now - loadedAt < TTL_MS) {
    return Promise.resolve(manifest);
  }
  if (!inFlight) {
    inFlight = fetchManifest();
  }
  return inFlight;
}

export async function resolvePublicUrl(publicPath: string): Promise<string> {
  const files = await getManifest();
  const hash = files[publicPath];
  return hash ? `${publicPath}?v=${hash}` : publicPath;
}
