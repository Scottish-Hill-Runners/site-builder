import { RaceData } from '@/types/datatable';
import { resolvePublicUrl } from './asset-manifest';

/**
 * Fetches and decompresses data from a gzipped JSON file
 * @param filePath - Path to the compressed JSON file (relative to public folder)
 * @returns Parsed data array
 */
export async function fetchCompressedJsonData(
  filePath: string
): Promise<RaceData[]> {
  try {
    const resolvedPath = await resolvePublicUrl(filePath);
    const url = new URL(
      resolvedPath,
      typeof window === 'undefined'
        ? `http://localhost:3000`
        : window.location.origin
    );
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    // Get the content as an ArrayBuffer
    const buffer = await response.arrayBuffer();

    // Decompress using DecompressionStream (gzip)
    const decompressedStream = new ReadableStream({
      start(controller) {
        const decompressionStream = new DecompressionStream('gzip');
        const reader = decompressionStream.readable.getReader();

        // Write the buffer to the decompression stream
        const writer = decompressionStream.writable.getWriter();
        writer.write(new Uint8Array(buffer));
        writer.close();

        // Read from the decompressed stream
        const read = async () => {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
          read();
        };

        read();
      },
    });

    const decompressedBuffer = await new Response(
      decompressedStream
    ).arrayBuffer();
    const decompressedText = new TextDecoder().decode(decompressedBuffer);
    const data = JSON.parse(decompressedText) as RaceData[];

    return data;
  } catch (error) {
    console.error('Error loading compressed data:', error);
    throw error;
  }
}

/**
 * Alternative: Fetch regular JSON file (uncompressed)
 * @param filePath - Path to the JSON file (relative to public folder)
 * @returns Parsed data array
 */
export async function fetchJsonData(filePath: string): Promise<RaceData[]> {
  try {
    const resolvedPath = await resolvePublicUrl(filePath);
    const url = new URL(
      resolvedPath,
      typeof window === 'undefined'
        ? `http://localhost:3000`
        : window.location.origin
    );
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    const data = (await response.json()) as RaceData[];
    return data;
  } catch (error) {
    console.error('Error loading JSON data:', error);
    throw error;
  }
}
