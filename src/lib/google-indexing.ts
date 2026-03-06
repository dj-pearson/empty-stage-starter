/**
 * Google Indexing API Client
 *
 * Submits URLs to Google for indexing via the google-indexing Edge Function.
 * Requires a service account with Indexing API access configured server-side.
 *
 * Usage:
 * ```ts
 * import { submitUrlsForIndexing, notifyUrlUpdated, notifyUrlDeleted } from '@/lib/google-indexing';
 *
 * // Notify Google that a URL was updated or created
 * await notifyUrlUpdated('https://tryeatpal.com/blog/new-post');
 *
 * // Notify Google that a URL was removed
 * await notifyUrlDeleted('https://tryeatpal.com/blog/old-post');
 *
 * // Submit multiple URLs at once
 * const results = await submitUrlsForIndexing({
 *   urls: ['https://tryeatpal.com/blog/post-1', 'https://tryeatpal.com/blog/post-2'],
 *   type: 'URL_UPDATED',
 * });
 * ```
 */

import { invokeEdgeFunction } from '@/lib/edge-functions';

export type IndexingNotificationType = 'URL_UPDATED' | 'URL_DELETED';

export interface IndexingRequest {
  urls: string[];
  type?: IndexingNotificationType;
}

export interface IndexingResult {
  url: string;
  status: 'success' | 'error';
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface IndexingResponse {
  results: IndexingResult[];
  summary: {
    total: number;
    success: number;
    errors: number;
  };
}

/**
 * Submit URLs to Google for indexing or removal.
 */
export async function submitUrlsForIndexing(
  request: IndexingRequest
): Promise<IndexingResponse | null> {
  const { data, error } = await invokeEdgeFunction<IndexingResponse>('google-indexing', {
    body: request,
  });

  if (error) {
    console.error('Google Indexing API error:', error.message);
    return null;
  }

  return data;
}

/**
 * Notify Google that a URL has been updated or newly created.
 */
export async function notifyUrlUpdated(url: string): Promise<IndexingResult | null> {
  const response = await submitUrlsForIndexing({ urls: [url], type: 'URL_UPDATED' });
  return response?.results[0] ?? null;
}

/**
 * Notify Google that a URL has been deleted.
 */
export async function notifyUrlDeleted(url: string): Promise<IndexingResult | null> {
  const response = await submitUrlsForIndexing({ urls: [url], type: 'URL_DELETED' });
  return response?.results[0] ?? null;
}

/**
 * Submit multiple URLs for indexing in a single batch.
 */
export async function notifyUrlsUpdated(urls: string[]): Promise<IndexingResponse | null> {
  return submitUrlsForIndexing({ urls, type: 'URL_UPDATED' });
}
