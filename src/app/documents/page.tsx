import { Suspense } from 'react';
import { getDocuments } from '@/lib/imageCollections';
import { cloudinaryUrlForPresetFromEnv } from '@/lib/cloudinary';
import DocumentsPageClient from '@/app/documents/documents-page-client';

function toDocumentUrl(sourcePath: string): string | undefined {
  try {
    return cloudinaryUrlForPresetFromEnv(sourcePath, 'document');
  } catch {
    return undefined;
  }
}

export default async function DocumentsPage() {
  const documents = await getDocuments().catch(() => []);
  const documentsWithUrl = documents
    .map((doc) => ({ ...doc, url: toDocumentUrl(doc.sourcePath) }))
    .filter((doc): doc is typeof doc & { url: string } => doc.url != null);

  return (
    <Suspense fallback={null}>
      <DocumentsPageClient documents={documentsWithUrl} />
    </Suspense>
  );
}
