// Updated to use environment variables for self-hosted Supabase
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Flag to track if Supabase is properly configured
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

// Log warning in development if Supabase is not configured
if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[EatPal] Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.\n' +
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
