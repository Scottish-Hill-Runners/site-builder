import { resolvePublicUrl } from './asset-manifest';

type FetchJsonResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'not-found' }
  | { status: 'error'; error: Error };

async function parseGzipJsonResponse<T>(response: Response): Promise<T> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser does not support gzip decompression streams');
  }

  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const decompressedStream = response.body.pipeThrough(
    new DecompressionStream('gzip')
  );
  const text = await new Response(decompressedStream).text();
  return JSON.parse(text) as T;
}

export async function fetchJsonWithApiFallback<T>(
  apiUrl: string,
  gzipFallbackUrl: string
): Promise<FetchJsonResult<T>> {
  try {
    // Prefer the versioned .json.gz file so long-term immutable caching applies.
    const resolvedGzipUrl = await resolvePublicUrl(gzipFallbackUrl);
    const gzipResponse = await fetch(resolvedGzipUrl, { cache: 'force-cache' });

    if (gzipResponse.ok) {
      return {
        status: 'ok',
        data: await parseGzipJsonResponse<T>(gzipResponse),
      };
    }

    if (gzipResponse.status !== 404) {
      return {
        status: 'error',
        error: new Error(`Request failed with status ${gzipResponse.status}`),
      };
    }

    // .json.gz not found — fall back to the API route.
    const apiResponse = await fetch(apiUrl, { cache: 'force-cache' });

    if (apiResponse.ok) {
      return { status: 'ok', data: (await apiResponse.json()) as T };
    }

    if (apiResponse.status === 404) {
      return { status: 'not-found' };
    }

    return {
      status: 'error',
      error: new Error(`API request failed with status ${apiResponse.status}`),
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error : new Error('Unknown fetch error'),
    };
  }
}

export async function fetchGzipJson<T>(
  gzipUrl: string
): Promise<FetchJsonResult<T>> {
  try {
    const resolvedUrl = await resolvePublicUrl(gzipUrl);
    const response = await fetch(resolvedUrl, { cache: 'force-cache' });

    if (response.status === 404) {
      return { status: 'not-found' };
    }

    if (!response.ok) {
      return {
        status: 'error',
        error: new Error(`Request failed with status ${response.status}`),
      };
    }

    return { status: 'ok', data: await parseGzipJsonResponse<T>(response) };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error : new Error('Unknown fetch error'),
    };
  }
}
