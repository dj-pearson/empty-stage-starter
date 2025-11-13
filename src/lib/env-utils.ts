/**
 * Environment and Configuration Utilities
 *
 * Helpers for working with environment variables, feature flags,
 * and application configuration.
 */

/**
 * Environment types
 */
export type Environment = 'development' | 'staging' | 'production' | 'test';

/**
 * Get current environment
 */
export function getEnvironment(): Environment {
  if (typeof process !== 'undefined' && process.env.NODE_ENV) {
    const env = process.env.NODE_ENV;
    if (env === 'development' || env === 'staging' || env === 'production' || env === 'test') {
      return env;
    }
  }

  // Fallback detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    }

    if (hostname.includes('staging') || hostname.includes('dev')) {
      return 'staging';
    }
  }

  return 'production';
}

/**
 * Environment checks
 */
export const isDevelopment = (): boolean => getEnvironment() === 'development';
export const isStaging = (): boolean => getEnvironment() === 'staging';
export const isProduction = (): boolean => getEnvironment() === 'production';
export const isTest = (): boolean => getEnvironment() === 'test';

/**
 * Check if running on server (SSR)
 */
export const isServer = (): boolean => typeof window === 'undefined';

/**
 * Check if running on client
 */
export const isClient = (): boolean => typeof window !== 'undefined';

/**
 * Get environment variable with fallback
 *
 * Usage:
 * ```tsx
 * const apiUrl = getEnv('VITE_API_URL', 'http://localhost:3000');
 * ```
 */
export function getEnv(key: string, fallback: string = ''): string {
  if (typeof process !== 'undefined' && process.env[key]) {
    return process.env[key] as string;
  }

  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[key]) {
    return (import.meta as any).env[key];
  }

  return fallback;
}

/**
 * Get required environment variable (throws if missing)
 */
export function getRequiredEnv(key: string): string {
  const value = getEnv(key);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

/**
 * Parse environment variable as boolean
 */
export function getEnvBoolean(key: string, fallback: boolean = false): boolean {
  const value = getEnv(key).toLowerCase();

  if (value === 'true' || value === '1' || value === 'yes') {
    return true;
  }

  if (value === 'false' || value === '0' || value === 'no') {
    return false;
  }

  return fallback;
}

/**
 * Parse environment variable as number
 */
export function getEnvNumber(key: string, fallback: number = 0): number {
  const value = getEnv(key);
  const parsed = parseFloat(value);

  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Parse environment variable as JSON
 */
export function getEnvJSON<T = any>(key: string, fallback: T): T {
  const value = getEnv(key);

  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Feature flag system
 */
class FeatureFlags {
  private flags: Map<string, boolean> = new Map();

  /**
   * Set feature flag
   */
  setFlag(name: string, enabled: boolean): void {
    this.flags.set(name, enabled);
  }

  /**
   * Check if feature is enabled
   */
  isEnabled(name: string, defaultValue: boolean = false): boolean {
    if (this.flags.has(name)) {
      return this.flags.get(name)!;
    }

    // Check environment variable
    const envKey = `VITE_FEATURE_${name.toUpperCase().replace(/-/g, '_')}`;
    const envValue = getEnvBoolean(envKey);

    if (envValue !== false) {
      return envValue;
    }

    return defaultValue;
  }

  /**
   * Enable feature
   */
  enable(name: string): void {
    this.setFlag(name, true);
  }

  /**
   * Disable feature
   */
  disable(name: string): void {
    this.setFlag(name, false);
  }

  /**
   * Toggle feature
   */
  toggle(name: string): void {
    this.setFlag(name, !this.isEnabled(name));
  }

  /**
   * Get all flags
   */
  getAll(): Record<string, boolean> {
    return Object.fromEntries(this.flags);
  }

  /**
   * Clear all flags
   */
  clear(): void {
    this.flags.clear();
  }
}

// Singleton instance
export const featureFlags = new FeatureFlags();

/**
 * Configuration manager
 */
export class Config {
  private config: Map<string, any> = new Map();

  /**
   * Set config value
   */
  set<T>(key: string, value: T): void {
    this.config.set(key, value);
  }

  /**
   * Get config value
   */
  get<T>(key: string, fallback?: T): T {
    if (this.config.has(key)) {
      return this.config.get(key);
    }

    // Try environment variable
    const envValue = getEnv(key);
    if (envValue) {
      return envValue as T;
    }

    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`Config key not found: ${key}`);
  }

  /**
   * Check if config key exists
   */
  has(key: string): boolean {
    return this.config.has(key) || !!getEnv(key);
  }

  /**
   * Get all config
   */
  getAll(): Record<string, any> {
    return Object.fromEntries(this.config);
  }

  /**
   * Merge config
   */
  merge(newConfig: Record<string, any>): void {
    Object.entries(newConfig).forEach(([key, value]) => {
      this.config.set(key, value);
    });
  }

  /**
   * Clear config
   */
  clear(): void {
    this.config.clear();
  }
}

// Singleton instance
export const config = new Config();

/**
 * Application URLs
 */
export const getAppUrls = () => ({
  api: getEnv('VITE_API_URL', 'http://localhost:3000/api'),
  supabase: getEnv('VITE_SUPABASE_URL', ''),
  app: getEnv('VITE_APP_URL', 'http://localhost:5173'),
  cdn: getEnv('VITE_CDN_URL', ''),
});

/**
 * API keys (use carefully, never expose sensitive keys)
 */
export const getApiKeys = () => ({
  supabase: getEnv('VITE_SUPABASE_ANON_KEY', ''),
  stripe: getEnv('VITE_STRIPE_PUBLISHABLE_KEY', ''),
  ga: getEnv('VITE_GA_MEASUREMENT_ID', ''),
  sentry: getEnv('VITE_SENTRY_DSN', ''),
});

/**
 * App metadata
 */
export const getAppMetadata = () => ({
  name: getEnv('VITE_APP_NAME', 'EatPal'),
  version: getEnv('VITE_APP_VERSION', '1.0.0'),
  description: getEnv('VITE_APP_DESCRIPTION', ''),
  environment: getEnvironment(),
});

/**
 * Debug mode
 */
export const isDebugEnabled = (): boolean => {
  return getEnvBoolean('VITE_DEBUG', isDevelopment());
};

/**
 * Console logger with environment awareness
 */
export const logger = {
  log: (...args: any[]) => {
    if (isDebugEnabled()) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDebugEnabled()) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    console.error(...args);
  },
  debug: (...args: any[]) => {
    if (isDebugEnabled()) {
      console.debug(...args);
    }
  },
  table: (data: any) => {
    if (isDebugEnabled()) {
      console.table(data);
    }
  },
};

/**
 * Build info
 */
export const getBuildInfo = () => ({
  timestamp: getEnv('VITE_BUILD_TIMESTAMP', new Date().toISOString()),
  commitHash: getEnv('VITE_COMMIT_HASH', 'unknown'),
  branch: getEnv('VITE_BRANCH', 'unknown'),
});

/**
 * Storage keys prefix
 */
export const getStoragePrefix = (): string => {
  return getEnv('VITE_STORAGE_PREFIX', 'eatpal_');
};

/**
 * Create prefixed storage key
 */
export function createStorageKey(key: string): string {
  return `${getStoragePrefix()}${key}`;
}

/**
 * Check if feature is available
 */
export const checkFeatureAvailability = () => ({
  notifications: 'Notification' in window,
  serviceWorker: 'serviceWorker' in navigator,
  geolocation: 'geolocation' in navigator,
  webgl: (() => {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      );
    } catch {
      return false;
    }
  })(),
  webWorker: typeof Worker !== 'undefined',
  indexedDB: 'indexedDB' in window,
  localStorage: (() => {
    try {
      const test = '__test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  })(),
});
