import { DOCUMENTS_API_URL } from '@/lib/site-config';

export type RemoteDocument = {
  assetId: string;
  publicId: string;
  resourceType: 'image' | 'raw';
  title?: string;
  description?: string;
  tags: string[];
  url: string;
};

type DocumentsResponse = {
  documents?: unknown;
  stale?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function parseDocument(value: unknown): RemoteDocument | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.assetId !== 'string' ||
    typeof value.publicId !== 'string' ||
    (value.resourceType !== 'image' && value.resourceType !== 'raw') ||
    typeof value.url !== 'string'
  ) {
    return null;
  }

  return {
    assetId: value.assetId,
    publicId: value.publicId,
    resourceType: value.resourceType,
    title: typeof value.title === 'string' ? value.title : undefined,
    description:
      typeof value.description === 'string' ? value.description : undefined,
    tags: Array.isArray(value.tags)
      ? value.tags.map(String).map((tag) => tag.trim().toLowerCase()).filter(Boolean)
      : [],
    url: value.url,
  };
}

export async function fetchDocuments(signal?: AbortSignal): Promise<{
  documents: RemoteDocument[];
  stale: boolean;
}> {
  const response = await fetch(DOCUMENTS_API_URL, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Documents are temporarily unavailable.');

  const payload = (await response.json()) as DocumentsResponse;
  return {
    documents: Array.isArray(payload.documents)
      ? payload.documents.map(parseDocument).filter((doc): doc is RemoteDocument => doc !== null)
      : [],
    stale: payload.stale === true,
  };
}