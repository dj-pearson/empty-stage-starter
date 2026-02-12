/**
 * Centralized Environment Variable Validation
 *
 * Validates all VITE_ environment variables at startup using Zod.
 * Logs clear error messages in development if required vars are missing.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Required
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, 'VITE_SUPABASE_ANON_KEY is required'),

  // Optional
  VITE_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  VITE_SENTRY_ENABLED: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().optional().default(''),
  VITE_GA_MEASUREMENT_ID: z.string().optional().default(''),
  VITE_FUNCTIONS_URL: z.string().url().optional().or(z.literal('')),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Validates environment variables and returns a typed env object.
 * In development, logs clear error messages for missing required vars.
 * In production, silently returns null on failure (app handles gracefully via existing mock client).
 */
export function validateEnv(): Env | null {
  const raw = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
    VITE_SENTRY_ENABLED: import.meta.env.VITE_SENTRY_ENABLED,
    VITE_STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
    VITE_GA_MEASUREMENT_ID: import.meta.env.VITE_GA_MEASUREMENT_ID,
    VITE_FUNCTIONS_URL: import.meta.env.VITE_FUNCTIONS_URL,
  };

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    if (import.meta.env.DEV) {
      console.error(
        '[EatPal] Environment variable validation failed:\n' +
          result.error.issues
            .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
            .join('\n') +
          '\n\nCreate a .env file in the project root with required variables.\n' +
          'See .env.example for reference.'
      );
    }
    return null;
  }

  _env = result.data;
  return _env;
}

/**
 * Returns the validated env object, or null if validation hasn't run or failed.
 */
export function getEnv(): Env | null {
  return _env;
}
