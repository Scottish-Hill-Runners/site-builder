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
  item: T
): Omit<T, 'path'> & { sourcePath: string } {
  const { path: sourcePath, ...rest } = item;
  return {
    ...rest,
    sourcePath,
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
    resolveItem(item)
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
        hero: (src.hero ?? []).map((item) =>
          resolveItem(item)
        ),
        gallery: (src.gallery ?? []).map((item) =>
          resolveItem(item)
        ),
      };
    }
  }

  // 3. Documents
  const docsSrc = readYaml<SourceDocumentsFile>(
    contentPath('documents', 'manifest.yaml')
  );
  const documents = (docsSrc?.documents ?? []).map((item) =>
    resolveItem(item)
  );

  // 4. Committee portraits
  const committeeSrc = readYaml<SourceCommitteeFile>(
    contentPath('committee', 'portraits.yaml')
  );
  const committeePortraits = (committeeSrc?.portraits ?? []).map((item) =>
    resolveItem(item)
  );

  const payload = {
    version: 5,
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
