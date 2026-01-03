// Updated to use environment variables for self-hosted Supabase
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate URL format for self-hosted Supabase
function isValidSupabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// Validate anon key format (JWT-like structure)
function isValidAnonKey(key: string | undefined): boolean {
  if (!key || key === 'your-anon-key-here') return false;
  // Basic JWT structure check: three base64 segments separated by dots
  const parts = key.split('.');
  return parts.length === 3 && parts.every(part => part.length > 0);
}

// Flag to track if Supabase is properly configured
export const isSupabaseConfigured = isValidSupabaseUrl(SUPABASE_URL) && isValidAnonKey(SUPABASE_PUBLISHABLE_KEY);

// Store configuration errors for debugging
export const configurationErrors: string[] = [];

if (!SUPABASE_URL) {
  configurationErrors.push('VITE_SUPABASE_URL is not set');
} else if (!isValidSupabaseUrl(SUPABASE_URL)) {
  configurationErrors.push(`VITE_SUPABASE_URL is invalid: "${SUPABASE_URL}" - must be a valid URL starting with http:// or https://`);
}

if (!SUPABASE_PUBLISHABLE_KEY) {
  configurationErrors.push('VITE_SUPABASE_ANON_KEY is not set');
} else if (!isValidAnonKey(SUPABASE_PUBLISHABLE_KEY)) {
  configurationErrors.push('VITE_SUPABASE_ANON_KEY appears invalid - should be a JWT token (three dot-separated segments)');
}

// Log warning in development if Supabase is not configured
if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[EatPal] Supabase configuration issues detected:\n' +
    configurationErrors.map(e => `  - ${e}`).join('\n') + '\n\n' +
    'Create a .env file in the project root with:\n' +
    '  VITE_SUPABASE_URL=https://api.tryeatpal.com\n' +
    '  VITE_SUPABASE_ANON_KEY=<your-anon-key>\n' +
    'The app will run in limited mode without database functionality.'
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Mock response helper
const mockError = {
  message: 'Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  code: 'NOT_CONFIGURED',
};

const mockResponse = { data: null, error: mockError };

// Create a mock subscription object
const mockSubscription = {
  unsubscribe: () => {},
};

// Create a mock channel object
const mockChannel = {
  on: () => mockChannel,
  subscribe: () => mockChannel,
  unsubscribe: () => {},
};

// Create mock auth object for when Supabase is not configured
const mockAuth = {
  getSession: () => Promise.resolve({ data: { session: null }, error: null }),
  getUser: () => Promise.resolve({ data: { user: null }, error: null }),
  signIn: () => Promise.resolve(mockResponse),
  signInWithPassword: () => Promise.resolve(mockResponse),
  signInWithOAuth: () => Promise.resolve(mockResponse),
  signUp: () => Promise.resolve(mockResponse),
  signOut: () => Promise.resolve({ error: null }),
  onAuthStateChange: (_callback: unknown) => ({
    data: { subscription: mockSubscription },
  }),
  resetPasswordForEmail: () => Promise.resolve(mockResponse),
  updateUser: () => Promise.resolve(mockResponse),
};

// Create mock query builder
function createMockQueryBuilder() {
  const builder = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    gt: () => builder,
    gte: () => builder,
    lt: () => builder,
    lte: () => builder,
    like: () => builder,
    ilike: () => builder,
    is: () => builder,
    in: () => builder,
    contains: () => builder,
    containedBy: () => builder,
    range: () => builder,
    order: () => builder,
    limit: () => builder,
    offset: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    then: (resolve: (value: { data: null; error: typeof mockError }) => void) => {
      resolve(mockResponse);
      return Promise.resolve(mockResponse);
    },
  };
  return builder;
}

// Create mock supabase client for when not configured
function createMockClient(): SupabaseClient<Database> {
  const mock = {
    auth: mockAuth,
    from: () => createMockQueryBuilder(),
    rpc: () => Promise.resolve(mockResponse),
    channel: () => mockChannel,
    removeChannel: () => Promise.resolve('ok'),
    removeAllChannels: () => Promise.resolve([]),
    getChannels: () => [],
    storage: {
      from: () => ({
        upload: () => Promise.resolve(mockResponse),
        download: () => Promise.resolve(mockResponse),
        list: () => Promise.resolve(mockResponse),
        remove: () => Promise.resolve(mockResponse),
        createSignedUrl: () => Promise.resolve(mockResponse),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    functions: {
      invoke: () => Promise.resolve(mockResponse),
    },
  };

  return mock as unknown as SupabaseClient<Database>;
}

// Create supabase client only if configured, otherwise create a mock
function createSupabaseClient(): SupabaseClient<Database> {
  if (isSupabaseConfigured) {
    return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        headers: {
          'X-Client-Info': 'eatpal-web',
        },
      },
    });
  }

  return createMockClient();
}

export const supabase = createSupabaseClient();

/**
 * Health check result for Supabase connection
 */
export interface SupabaseHealthCheck {
  isConfigured: boolean;
  configErrors: string[];
  isConnected: boolean;
  connectionError: string | null;
  authServiceAvailable: boolean;
  authError: string | null;
  latencyMs: number | null;
}

/**
 * Check Supabase connection health
 * Useful for debugging 500 errors in self-hosted environments
 */
export async function checkSupabaseHealth(): Promise<SupabaseHealthCheck> {
  const result: SupabaseHealthCheck = {
    isConfigured: isSupabaseConfigured,
    configErrors: [...configurationErrors],
    isConnected: false,
    connectionError: null,
    authServiceAvailable: false,
    authError: null,
    latencyMs: null,
  };

  if (!isSupabaseConfigured) {
    result.connectionError = 'Supabase is not configured';
    return result;
  }

  const startTime = performance.now();

  try {
    // Test basic connectivity by checking auth service
    const { error: sessionError } = await supabase.auth.getSession();

    result.latencyMs = Math.round(performance.now() - startTime);

    if (sessionError) {
      // Auth service responded but with an error
      result.isConnected = true;
      result.authServiceAvailable = true;
      result.authError = sessionError.message;
    } else {
      result.isConnected = true;
      result.authServiceAvailable = true;
    }
  } catch (error) {
    result.latencyMs = Math.round(performance.now() - startTime);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Categorize the error
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      result.connectionError = `Network error: Cannot reach Supabase at ${SUPABASE_URL}. Check if the URL is correct and the server is running.`;
    } else if (errorMessage.includes('CORS')) {
      result.connectionError = `CORS error: The Supabase server is not configured to accept requests from ${window.location.origin}`;
    } else if (errorMessage.includes('SSL') || errorMessage.includes('certificate')) {
      result.connectionError = `SSL/TLS error: Certificate issue with ${SUPABASE_URL}. For self-hosted, ensure valid SSL certificate.`;
    } else {
      result.connectionError = `Connection failed: ${errorMessage}`;
    }
  }

  return result;
}

/**
 * Log health check results to console for debugging
 */
export async function logSupabaseHealth(): Promise<void> {
  const health = await checkSupabaseHealth();

  console.group('[EatPal] Supabase Health Check');
  console.log('Configuration:', health.isConfigured ? '✓ Valid' : '✗ Invalid');

  if (health.configErrors.length > 0) {
    console.warn('Configuration Errors:', health.configErrors);
  }

  console.log('Connection:', health.isConnected ? '✓ Connected' : '✗ Failed');

  if (health.connectionError) {
    console.error('Connection Error:', health.connectionError);
  }

  console.log('Auth Service:', health.authServiceAvailable ? '✓ Available' : '✗ Unavailable');

  if (health.authError) {
    console.warn('Auth Error:', health.authError);
  }

  if (health.latencyMs !== null) {
    console.log('Latency:', `${health.latencyMs}ms`);
  }

  console.groupEnd();
}
