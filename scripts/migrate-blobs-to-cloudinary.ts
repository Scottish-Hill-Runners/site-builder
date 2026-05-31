import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type ResourceType = 'image' | 'raw';

type UploadResult = {
  path: string;
  publicId: string;
  resourceType: ResourceType;
  status: 'uploaded' | 'exists' | 'failed';
  secureUrl?: string;
  message?: string;
};

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
  'bmp',
  'tif',
  'tiff',
  'heic',
  'heif',
  'jxl',
]);

function parseArgs(argv: string[]) {
  const args = {
    dryRun: false,
    limit: 0,
    ref: process.env.CONTENT_REF || 'main',
    repo: process.env.CONTENT_REPO || 'Scottish-Hill-Runners/contents',
    output: path.join(process.cwd(), 'cloudinary-migration-report.json'),
  };

  for (const raw of argv) {
    if (raw === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (raw.startsWith('--limit=')) {
      args.limit = Number(raw.slice('--limit='.length)) || 0;
      continue;
    }
    if (raw.startsWith('--ref=')) {
      args.ref = raw.slice('--ref='.length) || args.ref;
      continue;
    }
    if (raw.startsWith('--repo=')) {
      args.repo = raw.slice('--repo='.length) || args.repo;
      continue;
    }
    if (raw.startsWith('--output=')) {
      args.output = path.resolve(process.cwd(), raw.slice('--output='.length));
      continue;
    }
  }

  return args;
}

function normalizeRepo(repo: string): string {
  const trimmed = repo.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    } catch {
      return trimmed.replace(/\.git$/, '');
    }
  }
  return trimmed.replace(/\.git$/, '');
}

function encodeRepoPath(repoPath: string): string {
  return repoPath
    .replace(/^\.?\//, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function extensionOf(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase();
}

function toPublicId(blobPath: string): string {
  const ext = path.extname(blobPath);
  if (!ext) return blobPath.replace(/^\.?\//, '');
  return blobPath.replace(/^\.?\//, '').slice(0, -ext.length);
}

function resourceTypeForPath(blobPath: string): ResourceType {
  return IMAGE_EXTENSIONS.has(extensionOf(blobPath)) ? 'image' : 'raw';
}

function cloudinarySignature(params: Record<string, string>, apiSecret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${canonical}${apiSecret}`).digest('hex');
}

function walkFiles(root: string, prefix: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    const rel = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, rel));
      continue;
    }
    out.push(rel);
  }
  return out;
}

async function getBlobPaths(repo: string, ref: string): Promise<string[]> {
  const localBlobsRoot =
    process.env.CONTENT_BLOBS_ROOT || path.join(process.cwd(), 'content', 'blobs');

  if (fs.existsSync(localBlobsRoot)) {
    const paths = walkFiles(localBlobsRoot, 'blobs');
    return paths.sort();
  }

  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    throw new Error(`Invalid CONTENT_REPO value: ${repo}`);
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'shr-web-cloudinary-migrator',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/repos/${owner}/${name}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 404) {
      throw new Error(
        `GitHub tree lookup returned 404 for ${repo}@${ref}. If the repo is private, set GITHUB_TOKEN with repo read access, or set CONTENT_BLOBS_ROOT to a local blobs checkout.`
      );
    }
    throw new Error(`GitHub tree lookup failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    truncated?: boolean;
    tree?: Array<{ path: string; type: string }>;
  };

  if (data.truncated) {
    throw new Error(
      'GitHub tree response is truncated; set CONTENT_BLOBS_ROOT to a local checkout of blobs for full migration'
    );
  }

  return (data.tree ?? [])
    .filter((entry) => entry.type === 'blob' && entry.path.startsWith('blobs/'))
    .map((entry) => entry.path)
    .sort();
}

async function fetchBlobContent(
  repo: string,
  ref: string,
  blobPath: string
): Promise<Buffer> {
  // Check for a local blobs checkout first (fastest, works offline)
  const localRoot =
    process.env.CONTENT_BLOBS_ROOT || path.join(process.cwd(), 'content', 'blobs');
  const localFile = path.join(
    localRoot,
    blobPath.replace(/^blobs\//, '')
  );
  if (fs.existsSync(localFile)) {
    return fs.readFileSync(localFile);
  }

  // Fall back to GitHub raw URL with optional auth
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${ref}/${encodeRepoPath(blobPath)}`;
  const headers: Record<string, string> = {};
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(rawUrl, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${blobPath} (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function uploadBlob(options: {
  repo: string;
  ref: string;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  blobPath: string;
  dryRun: boolean;
}): Promise<UploadResult> {
  const { repo, ref, cloudName, apiKey, apiSecret, blobPath, dryRun } = options;

  const publicId = toPublicId(blobPath);
  const resourceType = resourceTypeForPath(blobPath);

  if (dryRun) {
    return { path: blobPath, publicId, resourceType, status: 'uploaded' };
  }

  // Fetch blob locally (handles private repos via GITHUB_TOKEN or local checkout)
  let blobBuffer: Buffer;
  try {
    blobBuffer = await fetchBlobContent(repo, ref, blobPath);
  } catch (e) {
    return {
      path: blobPath,
      publicId,
      resourceType,
      status: 'failed',
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const ext = extensionOf(blobPath);
  const mimeType = resourceType === 'image' ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'application/octet-stream';
  const dataUri = `data:${mimeType};base64,${blobBuffer.toString('base64')}`;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const uploadParams = {
    overwrite: 'false',
    public_id: publicId,
    timestamp,
    unique_filename: 'false',
    use_filename: 'false',
  };
  const signature = cloudinarySignature(uploadParams, apiSecret);

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`;

  const body = new FormData();
  body.set('file', dataUri);
  body.set('api_key', apiKey);
  body.set('timestamp', timestamp);
  body.set('signature', signature);
  body.set('public_id', publicId);
  body.set('overwrite', 'false');
  body.set('unique_filename', 'false');
  body.set('use_filename', 'false');

  const response = await fetch(endpoint, { method: 'POST', body });
  const text = await response.text();

  if (!response.ok) {
    if (response.status === 409 || text.includes('already exists')) {
      return {
        path: blobPath,
        publicId,
        resourceType,
        status: 'exists',
        message: text,
      };
    }
    return {
      path: blobPath,
      publicId,
      resourceType,
      status: 'failed',
      message: text,
    };
  }

  const parsed = JSON.parse(text) as { secure_url?: string };
  return {
    path: blobPath,
    publicId,
    resourceType,
    status: 'uploaded',
    secureUrl: parsed.secure_url,
  };
}

function printSummary(results: UploadResult[]) {
  const uploaded = results.filter((r) => r.status === 'uploaded').length;
  const exists = results.filter((r) => r.status === 'exists').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  console.log('\nMigration summary');
  console.log(`- uploaded: ${uploaded}`);
  console.log(`- already exists: ${exists}`);
  console.log(`- failed: ${failed}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = normalizeRepo(args.repo);

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName) {
    throw new Error('Set CLOUDINARY_CLOUD_NAME before running migration');
  }

  if (!args.dryRun && (!apiKey || !apiSecret)) {
    throw new Error(
      'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET before running migration'
    );
  }

  const allPaths = await getBlobPaths(repo, args.ref);
  const blobPaths = args.limit > 0 ? allPaths.slice(0, args.limit) : allPaths;

  if (blobPaths.length === 0) {
    throw new Error(
      'No blob assets were discovered. Ensure CONTENT_BLOBS_ROOT points to a blobs directory, or CONTENT_REPO/CONTENT_REF resolve to a repository tree containing blobs/.'
    );
  }

  console.log(`Preparing Cloudinary migration for ${blobPaths.length} blob assets`);
  console.log(`- repo: ${repo}`);
  console.log(`- ref: ${args.ref}`);
  console.log(`- cloud: ${cloudName}`);
  console.log(`- dry run: ${args.dryRun ? 'yes' : 'no'}`);

  const results: UploadResult[] = [];

  for (let i = 0; i < blobPaths.length; i += 1) {
    const blobPath = blobPaths[i];
    const result = await uploadBlob({
      repo,
      ref: args.ref,
      cloudName,
      apiKey: apiKey || '',
      apiSecret: apiSecret || '',
      blobPath,
      dryRun: args.dryRun,
    });
    results.push(result);

    if ((i + 1) % 25 === 0 || i + 1 === blobPaths.length) {
      console.log(`Processed ${i + 1}/${blobPaths.length}`);
    }
  }

  fs.writeFileSync(args.output, JSON.stringify(results, null, 2));
  console.log(`Wrote report: ${args.output}`);

  printSummary(results);

  const failures = results.filter((r) => r.status === 'failed');
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
