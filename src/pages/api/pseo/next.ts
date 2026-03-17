/**
 * pSEO queue processor — triggers the next batch of pSEO page generation.
 *
 * This is NOT a Next.js API route. It exports a helper that the admin
 * dashboard can call, which invokes the `process-pseo-queue` edge function.
 *
 * For Make.com / external automation, call the edge function directly:
 *   POST https://functions.tryeatpal.com/process-pseo-queue
 *   Body: { "batchId": "<optional>", "limit": 5 }
 */

import { supabase } from '@/integrations/supabase/client';

export interface ProcessQueueResult {
  status: string;
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{
    queueId: string;
    pageType: string;
    slug: string;
    status: 'success' | 'failed';
    pageId?: string;
    qualityScore?: number;
    error?: string;
  }>;
  batchId: string | null;
}

/**
 * Trigger the pSEO queue processor edge function.
 */
export async function triggerPseoQueue(options?: {
  batchId?: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<ProcessQueueResult> {
  const { data, error } = await supabase.functions.invoke('process-pseo-queue', {
    body: {
      batchId: options?.batchId,
      limit: options?.limit ?? 5,
      dryRun: options?.dryRun ?? false,
    },
  });

  if (error) {
    throw new Error(`process-pseo-queue failed: ${error.message}`);
  }

  return data as ProcessQueueResult;
}
