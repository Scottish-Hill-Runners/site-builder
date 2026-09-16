'use client';

import { AssetEntry, pickHomepageImages } from '@/lib/assetCollections';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cloudinaryUrl } from '@/lib/cloudinary';

function filenameToAltText(sourcePath: string): string {
  const fileName = sourcePath.split('/').pop() ?? sourcePath;
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return baseName.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function HomepageImageGrid() {
  const [displayedImages, setDisplayedImages] = useState<AssetEntry[]>([]);

  // Fetched on mount (not at build time) so the selection changes on every page refresh.
  useEffect(() => {
    let cancelled = false;
    pickHomepageImages().then((images) => {
      if (!cancelled) setDisplayedImages(images);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (displayedImages.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {displayedImages.map((item, index) => (
        <figure
          key={item.public_id}
          className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-slate-700 dark:bg-slate-900"
        >
          <Image
            src={cloudinaryUrl(item, 'homepage')}
            alt={filenameToAltText(item.title ?? item.public_id)}
            width={640}
            height={360}
            sizes="(min-width: 640px) 33vw, 50vw"
            priority={index === 0}
            unoptimized
            className="h-32 w-full object-cover sm:h-36"
            referrerPolicy="no-referrer"
          />
        </figure>
      ))}
    </div>
  );
}