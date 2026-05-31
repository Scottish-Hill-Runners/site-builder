import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { parse as parseYaml } from 'yaml';
import { contentPath, contentRoot } from './content-paths';
import { writeGz, progress } from './write-gz-util';

// ── Source schema types ────────────────────────────────────────────────────

interface SourceImageItem {
  path: string;
  tier?: string;
  tags?: string[];
  title?: string;
  description?: string;
}

interface SourceRaceImagesFile {
  hero?: Array<{ path: string; caption?: string; year?: number; tags?: string[] }>;
  gallery?: Array<{ path: string; caption?: string; year?: number; tags?: string[] }>;
}

interface SourceHomepageFile {
  images?: SourceImageItem[];
}

interface SourceDocumentsFile {
  documents?: SourceImageItem[];
}

interface SourceCommitteeFile {
  portraits?: SourceImageItem[];
}

// ── Utilities ──────────────────────────────────────────────────────────────

function stripExtension(filePath: string): string {
  const ext = path.extname(filePath);
  if (!ext) return filePath;
  return filePath.slice(0, -ext.length);
}

function extensionOf(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase();
}

function isImagePath(filePath: string): boolean {
  const ext = extensionOf(filePath);
  return new Set([
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
  ]).has(ext);
}

function encodePublicId(publicId: string): string {
  return publicId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function cloudinaryDeliveryUrl(cloudName: string, repoPath: string): string {
  const normalizedPath = repoPath.replace(/^\.\//, '');
  const publicId = stripExtension(normalizedPath);
  const ext = extensionOf(normalizedPath);
  const resourceType = isImagePath(normalizedPath) ? 'image' : 'raw';
  const encodedPublicId = encodePublicId(publicId);
  const suffix = ext ? `.${encodeURIComponent(ext)}` : '';
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/${resourceType}/upload/${encodedPublicId}${suffix}`;
}

function resolveRepo(repo: string): string {
  const trimmed = repo.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname
        .replace(/^\//, '')
        .replace(/\.git$/, '')
        .split('/');
      if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    } catch {
      // fall through
    }
  }
  return trimmed.replace(/\.git$/, '');
}

function getContentSha(root: string): string {
  try {
    return execSync(`git -C "${root}" rev-parse HEAD`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return process.env.CONTENT_REF || 'main';
  }
}

function readYaml<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return parseYaml(fs.readFileSync(filePath, 'utf-8')) as T;
}

function resolveItem<T extends { path: string }>(
  item: T,
  cloudName: string
): T & { sourcePath: string; imageUrl: string } {
  return {
    ...item,
    sourcePath: item.path,
    imageUrl: cloudinaryDeliveryUrl(cloudName, item.path),
  };
}

// ── Main build ─────────────────────────────────────────────────────────────

function buildImageCollections() {
  const outputDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const root = contentRoot();
  const repo = resolveRepo(
    process.env.CONTENT_REPO || 'Scottish-Hill-Runners/contents'
  );
  const sha = getContentSha(root);
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName) {
    throw new Error(
      'CLOUDINARY_CLOUD_NAME is required to build Cloudinary image collections'
    );
  }
  const baseUrl = `https://res.cloudinary.com/${encodeURIComponent(cloudName)}`;

  progress(
    `Building image collections from distributed manifests (CONTENT_ROOT=${root})...`
  );

  // 1. Homepage images
  const homepageSrc = readYaml<SourceHomepageFile>(
    contentPath('homepage', 'images.yaml')
  );
  const homepageImages = (homepageSrc?.images ?? []).map((item) =>
    resolveItem(item, cloudName)
  );

  // 2. Per-race images — scan races/*/images.yaml
  const racesDir = contentPath('races');
  const raceImagesBySlug: Record<
    string,
    {
      hero: ReturnType<typeof resolveItem>[];
      gallery: ReturnType<typeof resolveItem>[];
    }
  > = {};

  if (fs.existsSync(racesDir)) {
    for (const entry of fs.readdirSync(racesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const imagesFile = path.join(racesDir, entry.name, 'images.yaml');
      const src = readYaml<SourceRaceImagesFile>(imagesFile);
      if (!src) continue;
      raceImagesBySlug[entry.name] = {
        hero: (src.hero ?? []).map((item) => resolveItem(item, cloudName)),
        gallery: (src.gallery ?? []).map((item) =>
          resolveItem(item, cloudName)
        ),
      };
    }
  }

  // 3. Documents
  const docsSrc = readYaml<SourceDocumentsFile>(
    contentPath('documents', 'manifest.yaml')
  );
  const documents = (docsSrc?.documents ?? []).map((item) =>
    resolveItem(item, cloudName)
  );

  // 4. Committee portraits
  const committeeSrc = readYaml<SourceCommitteeFile>(
    contentPath('committee', 'portraits.yaml')
  );
  const committeePortraits = (committeeSrc?.portraits ?? []).map((item) =>
    resolveItem(item, cloudName)
  );

  const payload = {
    version: 3,
    generatedAt: new Date().toISOString(),
    source: { provider: 'cloudinary', cloudName, repo, sha, baseUrl },
    homepageImages,
    raceImagesBySlug,
    documents,
    committeePortraits,
  };

  writeGz(outputDir, 'image-collections.json', JSON.stringify(payload));
  progress(
    `✓ Built image collections: ${homepageImages.length} homepage, ` +
      `${Object.keys(raceImagesBySlug).length} races, ` +
      `${documents.length} documents, ` +
      `${committeePortraits.length} portraits`
  );
}

buildImageCollections();
