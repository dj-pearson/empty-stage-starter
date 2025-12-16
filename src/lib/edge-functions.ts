/**
 * Edge Functions Helper for Self-Hosted Supabase
 * 
 * Since we're using a separate domain for Edge Functions (functions.tryeatpal.com),
 * we can't use invokeEdgeFunction() which assumes functions are at
 * {SUPABASE_URL}/functions/v1/
 * 
 * This helper provides a drop-in replacement that works with our self-hosted setup.
 */

import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';

export interface EdgeFunctionResponse<T = any> {
  data: T | null;
  error: Error | null;
}

/**
 * Invoke an Edge Function on the self-hosted Supabase instance
 * 
 * @param functionName - Name of the Edge Function to invoke
 * @param options - Optional configuration
 * @returns Response data or error
 */
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  options?: {
    body?: any;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
  }
): Promise<EdgeFunctionResponse<T>> {
  try {
    const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;
    
    if (!functionsUrl) {
      throw new Error('VITE_FUNCTIONS_URL environment variable is not set');
    }

    // Get the current session for authorization
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch(`${functionsUrl}/${functionName}`, {
      method: options?.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || response.statusText;
      } catch {
        errorMessage = errorText || response.statusText;
      }

      throw new Error(`Edge Function '${functionName}' failed: ${errorMessage}`);
    }

    const data = await response.json();
    
    return {
      data: data as T,
      error: null,
    };
  } catch (error) {
    console.error(`Error invoking Edge Function '${functionName}':`, error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Legacy compatibility wrapper for invokeEdgeFunction()
 * 
 * Use this to maintain compatibility with existing code that uses
 * the Supabase client's functions.invoke() method.
 */
export const edgeFunctions = {
  invoke: invokeEdgeFunction,
};

