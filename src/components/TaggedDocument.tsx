'use client';

import { Children, isValidElement, useEffect, useState } from 'react';
import { AssetEntry, getAssets, parseTags, pickBestMatch, pickAllMatches } from '@/lib/assetCollections';
import { cloudinaryUrl } from '@/lib/cloudinary';
import Link from 'next/link';

const DOCUMENTS_FOLDER = 'documents';

// Markdown images written as `document:tag1,tag2` are resolved
// client-side to the best tag-matching Cloudinary asset in the documents folder.
// In plural form, `documents:tag1,tag2` resolves to a <ul> list of
// all matching assets in the documents folder.
function parseDocumentTags(href?: string): string[] | null {
  if (!href) return null;
  const match = href.match(/^documents?:(.*)$/);
  return match ? parseTags(match[1]) : null;
}

export default function TaggedDocument({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const tags = parseDocumentTags(href);
  const key = tags ? tags.join(',') : null;
  // Keyed by tags so a stale fetch response can never overwrite a newer one.
  const [result, setResult] = useState<{ key: string; asset: AssetEntry[] | AssetEntry | null } | null>(null);

  useEffect(() => {
    if (!tags || !key) return;
    let cancelled = false;
    getAssets(DOCUMENTS_FOLDER).then((assets) => {
      if (cancelled) return;
      setResult({
        key,
        asset: href && href.startsWith('documents:')
          ? pickAllMatches(assets, tags)
          : pickBestMatch(assets, tags)
      });
    });
    return () => {
      cancelled = true;
    };
    // tags is derived fresh from src/key each render; key alone is a stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!tags)
    return <a href={href}>{children}</a>;

  const asset = result?.key === key ? result.asset : null;
  if (!asset) return null;

  if (Array.isArray(asset))
    return (
      <div>
        <h2>{children}</h2>
        <ul>
          {Array.isArray(asset) &&
            asset.map((a) => (
              <li key={a.public_id}>
                <Link
                  href={cloudinaryUrl(a, 'document')}
                  className="inline-block rounded-lg"
                  referrerPolicy="no-referrer"
                >
                  {a.title ?? a.description ?? a.public_id}
                </Link>
              </li>
            ))}
        </ul>
      </div>
    );

  return (
      <Link
        href={cloudinaryUrl(asset, 'document')}
        className="inline-block rounded-lg"
        referrerPolicy="no-referrer"
      >
        {children}
      </Link>
    );
}

// TaggedDocument renders a block-level <div>/<h2>/<ul> for `documents:` links,
// so paragraphs containing only such a link must skip the <p> wrapper to
// avoid invalid (and hydration-breaking) <div> inside <p> nesting.
export function MarkdownParagraph({ children }: { children?: React.ReactNode }) {
  const childArray = Children.toArray(children);
  const onlyChild = childArray.length === 1 ? childArray[0] : null;
  const isDocumentsList =
    isValidElement(onlyChild) &&
    typeof (onlyChild.props as { href?: string }).href === 'string' &&
    (onlyChild.props as { href: string }).href.startsWith('documents:');

  return isDocumentsList ? children : <p>{children}</p>;
}
