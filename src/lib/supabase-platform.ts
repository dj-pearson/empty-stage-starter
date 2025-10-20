/**
 * Platform-aware Supabase client exports
 * This file automatically selects the correct Supabase client based on the platform
 */

import { isWeb } from './platform';

// Re-export types
export type { Database } from '@/integrations/supabase/types';

// Dynamically import the correct client based on platform
export const getSupabaseClient = async () => {
  if (isWeb()) {
    const { supabase } = await import('@/integrations/supabase/client');
    return supabase;
  } else {
    const { supabase } = await import('@/integrations/supabase/client.mobile');
    return supabase;
  }
};

// For synchronous imports (web-only, existing code)
// This maintains backwards compatibility with existing web code
let _cachedClient: any = null;

export const getSupabaseClientSync = () => {
  if (!isWeb()) {
    throw new Error('Synchronous Supabase client is only available on web. Use getSupabaseClient() instead.');
  }
  
  if (!_cachedClient) {
    // This will only work on web due to the synchronous require
    _cachedClient = require('@/integrations/supabase/client').supabase;
  }
  
  return _cachedClient;
};

