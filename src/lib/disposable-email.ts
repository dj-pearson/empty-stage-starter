/**
 * Disposable email detection helpers.
 *
 * The authoritative blocklist lives in the `disposable_email_domains` table
 * in Supabase. Because the signup flow runs before authentication, we use
 * the `is_disposable_email_domain` SECURITY DEFINER RPC which only returns
 * a boolean (the full list is never exposed to the anon role).
 *
 * Inspired by https://github.com/disposable-email-domains/disposable-email-domains
 */

import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Extract the domain portion of an email address, lowercased and trimmed.
 * Returns null if the string does not look like a valid email.
 */
export function extractEmailDomain(email: string): string | null {
  if (typeof email !== 'string') return null;

  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex < 1 || atIndex === trimmed.length - 1) return null;

  const domain = trimmed.slice(atIndex + 1);
  // Basic shape check: must contain at least one dot and valid chars
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return null;
  }

  return domain;
}

/**
 * Check whether the given email address uses a disposable email provider.
 *
 * Fails open (returns `false`) if Supabase is not configured or the RPC
 * call errors out — we don't want infrastructure hiccups to block real
 * signups. Errors are logged so they can be investigated.
 */
export async function isDisposableEmail(email: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  const domain = extractEmailDomain(email);
  if (!domain) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(
      'is_disposable_email_domain',
      { p_domain: domain }
    );

    if (error) {
      logger.warn('Disposable email RPC failed, allowing signup', {
        domain,
        error: error.message,
      });
      return false;
    }

    return data === true;
  } catch (err) {
    logger.warn('Disposable email check threw, allowing signup', {
      domain,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Human-readable error message for blocked signups. Kept here so the same
 * copy can be reused across the Auth page and any future programmatic
 * callers (e.g. an invite flow).
 */
export const DISPOSABLE_EMAIL_ERROR_MESSAGE =
  'Disposable and temporary email addresses are not allowed. Please use a permanent email address to sign up.';
