'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AssetEntry, getAssets, parseTags, pickBestMatch } from '@/lib/assetCollections';
import { cloudinaryUrl } from '@/lib/cloudinary';

const PORTRAITS_FOLDER = 'portraits';

// Markdown images written as `portrait:tag1,tag2` (e.g. committee.md) are resolved
// client-side to the best tag-matching Cloudinary asset in the portraits folder.
function parsePortraitTags(src: string): string[] | null {
  const match = src.match(/^portrait:(.*)$/);
  return match ? parseTags(match[1]) : null;
}

export default function TaggedImage({
  src,
  alt,
}: {
  src?: string | Blob;
  alt?: string;
}) {
  const tags = typeof src === 'string' ? parsePortraitTags(src) : null;
  const key = tags ? tags.join(',') : null;
  // Keyed by tags so a stale fetch response can never overwrite a newer one.
  const [result, setResult] = useState<{ key: string; asset: AssetEntry | null } | null>(null);

  useEffect(() => {
    if (!tags || !key) return;
    let cancelled = false;
    getAssets(PORTRAITS_FOLDER).then((assets) => {
      if (cancelled) return;
      setResult({ key, asset: pickBestMatch(assets, tags) });
    });
    return () => {
      cancelled = true;
    };
    // tags is derived fresh from src/key each render; key alone is a stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!tags)
    // eslint-disable-next-line @next/next/no-img-element -- pass through non-tagged markdown images as-is
    return typeof src === 'string' ? <img src={src} alt={alt} /> : null;

  const asset = result?.key === key ? result.asset : null;
  if (!asset) return null;

  return (
    <Image
      src={cloudinaryUrl(asset, 'portrait')}
      alt={alt ?? asset.title ?? asset.public_id}
      width={asset.width ?? 400}
      height={asset.height ?? 400}
      unoptimized
      className="inline-block rounded-lg"
      referrerPolicy="no-referrer"
    />
  );
}
