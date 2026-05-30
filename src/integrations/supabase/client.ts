// Updated to use environment variables for self-hosted Supabase
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL;

// A real Supabase anon key is a JWT and always starts with "eyJ". Our CI
// injects the literal "placeholder-for-ci-build" so PR builds don't need the
// secret — but if that placeholder (or an empty value) ever reaches a deployed
// bundle, the client is created with a bogus apikey and EVERY request, sign-in
// included, fails with 401 "Invalid API key". Treat that as "not configured"
// so we fall back to the mock client instead of silently 401-ing forever.
const hasValidAnonKey = !!SUPABASE_PUBLISHABLE_KEY && SUPABASE_PUBLISHABLE_KEY.startsWith('eyJ');

// Flag to track if Supabase is properly configured
export const isSupabaseConfigured = !!SUPABASE_URL && hasValidAnonKey;

// Surface misconfiguration LOUDLY, in production too. A silent failure here is
// indistinguishable from "sign-in is broken" with nothing in the console — the
// exact symptom behind the desktop sign-in reports.
if (!isSupabaseConfigured) {
  const detail = !SUPABASE_URL
    ? 'VITE_SUPABASE_URL is missing'
    : 'VITE_SUPABASE_ANON_KEY is missing or a placeholder (expected a JWT starting with "eyJ")';
  console.error(
    `[EatPal] Supabase is not properly configured: ${detail}. ` +
    'Authentication and database access are disabled. ' +
    'Check the deploy build environment (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
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

// Create mock auth object for when Supabase is not configured.
// Mirror every auth method the app actually calls — a missing method here
// turns a config problem into a `TypeError: ... is not a function` crash.
const mockAuth = {
  getSession: () => Promise.resolve({ data: { session: null }, error: null }),
  getUser: () => Promise.resolve({ data: { user: null }, error: null }),
  signIn: () => Promise.resolve(mockResponse),
  signInWithPassword: () => Promise.resolve(mockResponse),
  signInWithOAuth: () => Promise.resolve(mockResponse),
  signInWithIdToken: () => Promise.resolve(mockResponse),
  signUp: () => Promise.resolve(mockResponse),
  signOut: () => Promise.resolve({ error: null }),
  onAuthStateChange: (_callback: unknown) => ({
    data: { subscription: mockSubscription },
  }),
  resetPasswordForEmail: () => Promise.resolve(mockResponse),
  updateUser: () => Promise.resolve(mockResponse),
  verifyOtp: () => Promise.resolve(mockResponse),
  resend: () => Promise.resolve(mockResponse),
  refreshSession: () => Promise.resolve({ data: { session: null, user: null }, error: null }),
  setSession: () => Promise.resolve(mockResponse),
  exchangeCodeForSession: () => Promise.resolve(mockResponse),
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
    // Configure options for self-hosted Supabase
    const options: Parameters<typeof createClient>[2] = {
      auth: {
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
        // Use PKCE flow for OAuth - more secure and works better with self-hosted
        flowType: 'pkce',
        // Detect session from URL for OAuth callbacks
        detectSessionInUrl: true,
        // Session lives in localStorage (above), so it is NOT shared across
        // subdomains — each origin has its own. (The old comment here claimed
        // cookie-based cross-subdomain sharing, which this config never did.)
        storageKey: 'sb-auth-token',
      },
      global: {
        headers: {
          'X-Client-Info': 'eatpal-web',
        },
        // Custom functions URL for self-hosted edge functions
        ...(FUNCTIONS_URL && {
          fetch: (url: RequestInfo | URL, options?: RequestInit) => {
            const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            // Rewrite /functions/v1/ URLs to point to custom functions domain
            if (urlString.includes('/functions/v1/')) {
              const functionPath = urlString.split('/functions/v1/')[1];
              const newUrl = `${FUNCTIONS_URL}/${functionPath}`;
              return fetch(newUrl, options);
            }
            return fetch(url, options);
          }
        })
      },
      realtime: {
        params: {
          // Heartbeat interval to detect dropped connections
          heartbeat_interval_ms: 15_000,
        },
      },
      db: {
        // Schema to use for all queries
        schema: 'public',
      },
    };
    
    return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, options);
  }

  return createMockClient();
}

export const supabase = createSupabaseClient();
