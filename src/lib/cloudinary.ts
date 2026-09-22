import { AssetEntry } from './assetCollections';
import { CLOUDINARY_CLOUD_NAME } from './site-config';

export type CloudinaryPreset =
  | 'homepage'
  | 'raceHero'
  | 'gallery'
  | 'portrait'
  | 'document';

const PRESET_TRANSFORMS: Record<CloudinaryPreset, string[]> = {
  homepage: ['f_auto', 'q_auto', 'c_fill', 'g_auto', 'w_640'],
  raceHero: ['f_auto', 'q_auto', 'c_fill', 'g_auto', 'w_1600'],
  gallery: ['f_auto', 'q_auto', 'c_fill', 'g_auto', 'w_800'],
  portrait: ['f_auto', 'q_auto', 'c_fill', 'g_auto', 'w_400'],
  document: [],
};

export function cloudinaryUrl(asset: AssetEntry, preset: CloudinaryPreset): string {
  if (!CLOUDINARY_CLOUD_NAME)
    throw new Error('CLOUDINARY_CLOUD_NAME is required for Cloudinary image URLs');
  const transforms = PRESET_TRANSFORMS[preset];
  const format = asset.format ? `.${asset.format}` : '';
  const transformSegment = transforms.length > 0 ? `${transforms.join(',')}/` : '';
  return `https://res.cloudinary.com/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/${asset.resource_type}/upload/${transformSegment}${asset.public_id}${format}`;
}
