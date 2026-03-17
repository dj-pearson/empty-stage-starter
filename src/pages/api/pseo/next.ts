// API route for Make.com or external automation to trigger the next pSEO build step
// Place in: src/pages/api/pseo/next.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { processQueue } from '@/lib/pseo/generator';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Optionally accept a batchId or just process the next item in the queue
    const { batchId } = req.body || {};
    const result = await processQueue(batchId);
    return res.status(200).json({ success: true, result });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
}
