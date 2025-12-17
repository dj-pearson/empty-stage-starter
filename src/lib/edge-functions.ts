/**
 * Edge Functions Helper for Self-Hosted Supabase
 *
 * Since we're using a separate domain for Edge Functions (functions.tryeatpal.com),
 * we can't use supabase.functions.invoke() which assumes functions are at
 * {SUPABASE_URL}/functions/v1/
 *
 * This helper provides a drop-in replacement that works with our self-hosted setup.
 *
 * Self-hosted Supabase endpoints:
 * - API (PostgREST/Auth/Storage): https://api.tryeatpal.com
 * - Edge Functions (Kong): https://functions.tryeatpal.com
 */

import { supabase } from '@/integrations/supabase/client';

export interface EdgeFunctionResponse<T = unknown> {
  data: T | null;
  error: Error | null;
}

/**
 * Get the Edge Functions URL from environment or default
 */
function getEdgeFunctionsUrl(): string {
  const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;

  if (!functionsUrl) {
    // Fallback: derive from SUPABASE_URL by replacing 'api' with 'functions'
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (supabaseUrl) {
      return supabaseUrl.replace('api.', 'functions.');
    }
    throw new Error('VITE_FUNCTIONS_URL environment variable is not set');
  }

  return functionsUrl;
}

/**
 * Invoke an Edge Function on the self-hosted Supabase instance
 *
 * @param functionName - Name of the Edge Function to invoke
 * @param options - Optional configuration
 * @returns Response data or error
 *
 * @example
 * // Simple call
 * const { data, error } = await invokeEdgeFunction('list-users');
 *
 * // With body
 * const { data, error } = await invokeEdgeFunction('create-user', {
 *   body: { email: 'user@example.com' }
 * });
 *
 * // With custom method
 * const { data, error } = await invokeEdgeFunction('get-user', {
 *   method: 'GET'
 * });
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  options?: {
    body?: unknown;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
  }
): Promise<EdgeFunctionResponse<T>> {
  try {
    const functionsUrl = getEdgeFunctionsUrl();

    // Get the current session for authorization
    const { data: { session } } = await supabase.auth.getSession();

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    // Add authorization header if session exists
    if (session?.access_token) {
      requestHeaders['Authorization'] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(`${functionsUrl}/${functionName}`, {
      method: options?.method || 'POST',
      headers: requestHeaders,
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

    // Handle empty responses
    const contentType = response.headers.get('content-type');
    let data: T | null = null;

    if (contentType?.includes('application/json')) {
      const text = await response.text();
      if (text) {
        data = JSON.parse(text) as T;
      }
    }

    return {
      data,
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
