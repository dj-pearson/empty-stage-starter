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

import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

export interface EdgeFunctionResponse<T = unknown> {
  data: T | null;
  error: Error | null;
}

export interface EdgeFunctionError extends Error {
  status?: number;
  functionName: string;
  url: string;
}

// Cache the functions URL after first validation
let cachedFunctionsUrl: string | null = null;
let urlValidationError: string | null = null;

/**
 * Validate that a URL is properly formatted
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Derive functions URL from Supabase URL
 * Supports multiple patterns:
 * - https://api.example.com -> https://functions.example.com
 * - https://supabase.example.com/rest/v1 -> https://supabase.example.com/functions/v1
 * - https://xyz.supabase.co -> https://xyz.supabase.co/functions/v1 (cloud)
 */
function deriveFunctionsUrl(supabaseUrl: string): string | null {
  try {
    const parsed = new URL(supabaseUrl);
    const host = parsed.hostname;

    // Pattern 1: api.example.com -> functions.example.com
    if (host.startsWith('api.')) {
      const functionsHost = 'functions.' + host.slice(4);
      return `${parsed.protocol}//${functionsHost}`;
    }

    // Pattern 2: supabase cloud (xyz.supabase.co)
    if (host.endsWith('.supabase.co')) {
      return `${parsed.protocol}//${host}/functions/v1`;
    }

    // Pattern 3: Self-hosted with /rest/v1 path
    if (parsed.pathname.includes('/rest/v1')) {
      const basePath = parsed.pathname.replace('/rest/v1', '/functions/v1');
      return `${parsed.protocol}//${host}${basePath}`;
    }

    // Pattern 4: Just append /functions/v1
    return `${parsed.protocol}//${host}/functions/v1`;
  } catch {
    return null;
  }
}

/**
 * Get the Edge Functions URL from environment or derive from Supabase URL
 */
function getEdgeFunctionsUrl(): string {
  // Return cached URL if available
  if (cachedFunctionsUrl) {
    return cachedFunctionsUrl;
  }

  // Return cached error if already validated and failed
  if (urlValidationError) {
    throw new Error(urlValidationError);
  }

  const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL;

  if (functionsUrl) {
    if (!isValidUrl(functionsUrl)) {
      urlValidationError = `VITE_FUNCTIONS_URL is invalid: "${functionsUrl}" - must be a valid URL`;
      throw new Error(urlValidationError);
    }
    cachedFunctionsUrl = functionsUrl.replace(/\/$/, ''); // Remove trailing slash
    return cachedFunctionsUrl;
  }

  // Fallback: derive from SUPABASE_URL
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    urlValidationError = 'VITE_FUNCTIONS_URL is not set and VITE_SUPABASE_URL is not available to derive from';
    throw new Error(urlValidationError);
  }

  const derivedUrl = deriveFunctionsUrl(supabaseUrl);
  if (!derivedUrl) {
    urlValidationError = `Could not derive functions URL from VITE_SUPABASE_URL: "${supabaseUrl}". Please set VITE_FUNCTIONS_URL explicitly.`;
    throw new Error(urlValidationError);
  }

  // Log in development that we're using a derived URL
  if (import.meta.env.DEV) {
    console.info(`[EatPal] VITE_FUNCTIONS_URL not set. Derived from SUPABASE_URL: ${derivedUrl}`);
  }

  cachedFunctionsUrl = derivedUrl;
  return cachedFunctionsUrl;
}

/**
 * Create a detailed error for edge function failures
 */
function createEdgeFunctionError(
  message: string,
  functionName: string,
  url: string,
  status?: number
): EdgeFunctionError {
  const error = new Error(message) as EdgeFunctionError;
  error.name = 'EdgeFunctionError';
  error.functionName = functionName;
  error.url = url;
  error.status = status;
  return error;
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
  let functionUrl = '';

  try {
    // Check if Supabase is configured first
    if (!isSupabaseConfigured) {
      return {
        data: null,
        error: createEdgeFunctionError(
          'Supabase is not configured. Cannot invoke edge functions.',
          functionName,
          '',
        ),
      };
    }

    const functionsUrl = getEdgeFunctionsUrl();
    functionUrl = `${functionsUrl}/${functionName}`;

    // Get the current session for authorization
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    // Log session errors but continue (function might not require auth)
    if (sessionError) {
      console.warn(`[EdgeFunction] Session error for '${functionName}':`, sessionError.message);
    }

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    // Add authorization header if session exists
    if (session?.access_token) {
      requestHeaders['Authorization'] = `Bearer ${session.access_token}`;
    }

    const response = await fetch(functionUrl, {
      method: options?.method || 'POST',
      headers: requestHeaders,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage: string;
      let errorDetails = '';

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || response.statusText;
        errorDetails = errorJson.details || '';
      } catch {
        errorMessage = errorText || response.statusText;
      }

      // Create detailed error message with status code and URL
      const fullMessage = [
        `Edge Function '${functionName}' failed with status ${response.status}`,
        errorMessage,
        errorDetails,
        import.meta.env.DEV ? `URL: ${functionUrl}` : '',
      ].filter(Boolean).join(' - ');

      throw createEdgeFunctionError(fullMessage, functionName, functionUrl, response.status);
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
    // Network errors
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      const networkError = createEdgeFunctionError(
        `Cannot reach edge function '${functionName}'. Check network connectivity and ensure the functions server is running at ${functionUrl || 'configured URL'}.`,
        functionName,
        functionUrl,
      );
      console.error(`[EdgeFunction] Network error for '${functionName}':`, networkError.message);
      return { data: null, error: networkError };
    }

    // Already an EdgeFunctionError
    if (error instanceof Error && 'functionName' in error) {
      console.error(`[EdgeFunction] Error for '${functionName}':`, error.message);
      return { data: null, error: error as EdgeFunctionError };
    }

    // Generic errors
    const genericError = createEdgeFunctionError(
      error instanceof Error ? error.message : String(error),
      functionName,
      functionUrl,
    );
    console.error(`[EdgeFunction] Unexpected error for '${functionName}':`, genericError.message);
    return { data: null, error: genericError };
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

/**
 * Check if edge functions are available and properly configured
 */
export async function checkEdgeFunctionsHealth(): Promise<{
  isConfigured: boolean;
  url: string | null;
  configError: string | null;
  isReachable: boolean;
  reachabilityError: string | null;
}> {
  const result = {
    isConfigured: false,
    url: null as string | null,
    configError: null as string | null,
    isReachable: false,
    reachabilityError: null as string | null,
  };

  // Check Supabase configuration first
  if (!isSupabaseConfigured) {
    result.configError = 'Supabase is not configured';
    return result;
  }

  // Try to get the URL
  try {
    result.url = getEdgeFunctionsUrl();
    result.isConfigured = true;
  } catch (error) {
    result.configError = error instanceof Error ? error.message : 'Unknown configuration error';
    return result;
  }

  // Try to reach the functions endpoint (basic health check)
  try {
    const response = await fetch(result.url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    // Any response (even 404 for the root) means the server is reachable
    result.isReachable = true;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      result.reachabilityError = `Cannot reach edge functions server at ${result.url}`;
    } else {
      result.reachabilityError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  return result;
}

/**
 * Get the current edge functions URL (useful for debugging)
 */
export function getConfiguredFunctionsUrl(): string | null {
  try {
    return getEdgeFunctionsUrl();
  } catch {
    return null;
  }
}
