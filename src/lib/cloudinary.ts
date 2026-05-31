import path from 'node:path';

export type CloudinaryPreset = 'homepage' | 'raceHero' | 'gallery' | 'portrait';

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

const PRESET_TRANSFORMS: Record<CloudinaryPreset, string[]> = {
  homepage: ['f_auto', 'q_auto', 'c_fill', 'g_auto', 'w_640'],
  raceHero: ['f_auto', 'q_auto', 'c_fill', 'g_auto', 'w_1600'],
  gallery: ['f_auto', 'q_auto', 'c_fill', 'g_auto', 'w_800'],
  portrait: ['f_auto', 'q_auto', 'c_fill', 'g_auto', 'w_400'],
};

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
  return IMAGE_EXTENSIONS.has(extensionOf(filePath));
}

function encodePublicId(publicId: string): string {
  return publicId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function cloudinaryDeliveryUrl(
  cloudName: string,
  repoPath: string,
  transforms: string[] = []
): string {
  const normalizedPath = repoPath.replace(/^\.\//, '');
  const publicId = stripExtension(normalizedPath);
  const ext = extensionOf(normalizedPath);
  const resourceType = isImagePath(normalizedPath) ? 'image' : 'raw';
  const encodedPublicId = encodePublicId(publicId);
  const transformSegment =
    transforms.length > 0 ? `${transforms.join(',')}/` : '';
  const suffix = ext ? `.${encodeURIComponent(ext)}` : '';

  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/${resourceType}/upload/${transformSegment}${encodedPublicId}${suffix}`;
}

export function cloudinaryUrlForPreset(
  cloudName: string,
  repoPath: string,
  preset: CloudinaryPreset
): string {
  return cloudinaryDeliveryUrl(cloudName, repoPath, PRESET_TRANSFORMS[preset]);
}

export function getCloudinaryCloudName(): string {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloudName) {
    throw new Error('CLOUDINARY_CLOUD_NAME is required for Cloudinary image URLs');
  }
  return cloudName;
}

export function cloudinaryUrlForPresetFromEnv(
  repoPath: string,
  preset: CloudinaryPreset
): string {
  return cloudinaryUrlForPreset(getCloudinaryCloudName(), repoPath, preset);
}
