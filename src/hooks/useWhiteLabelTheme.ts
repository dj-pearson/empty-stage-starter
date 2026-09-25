import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { logger } from '@/lib/logger';
import { fetchEffectivePlanName } from '@/lib/accountQueries';
import { useAuth } from '@/contexts/AuthContext';

// Same rule as the table's valid_colors CHECK (and practiceProfileSchema). Kept
// local so the dashboard shell does not pull zod in for one regex.
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

type BrandSettings = Pick<
  Database['public']['Tables']['professional_brand_settings']['Row'],
  'primary_color' | 'secondary_color' | 'accent_color' | 'business_name' | 'favicon_url'
>;

/**
 * Apply a Professional account's practice colors to its own screens.
 *
 * The gate is the server-effective plan (current_user_plan_name), shared with
 * useNavEntitlements through sharedQuery, so a trial, App Store or complimentary
 * Professional is themed and a lapsed one is not.
 *
 * The realtime channel is filtered to the signed-in user's row. Unfiltered, it
 * delivered every Professional's brand changes to every dashboard and applied
 * them, so one clinician's save recolored everybody else's app. The handler
 * re-checks the entitlement too: a plan that lapsed mid-session stops theming.
 */
export function useWhiteLabelTheme() {
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const isProfessional = async (): Promise<boolean> => {
      try {
        return (await fetchEffectivePlanName(userId)) === 'Professional';
      } catch (error: unknown) {
        logger.error('useWhiteLabelTheme: plan lookup failed', error);
        return false;
      }
    };

    const apply = (settings: BrandSettings) => {
      applyThemeColors(settings);
      applyBusinessName(settings.business_name);
      applyFavicon(settings.favicon_url);
    };

    const applyCustomTheme = async () => {
      try {
        if (!(await isProfessional()) || cancelled) return;

        const { data: brandSettings, error } = await supabase
          .from('professional_brand_settings')
          .select('primary_color, secondary_color, accent_color, business_name, favicon_url')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw error;

        if (brandSettings && !cancelled) apply(brandSettings);
      } catch (error: unknown) {
        logger.error('Error applying white-label theme:', error);
      }
    };

    void applyCustomTheme();

    logger.debug('Subscribing to brand_settings_changes');
    const channel = supabase
      .channel(`brand_settings_changes:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'professional_brand_settings',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new;
          if (!next || typeof next !== 'object' || !('user_id' in next) || next.user_id !== userId) return;
          const settings = next as BrandSettings;
          void isProfessional().then((ok) => {
            if (ok && !cancelled) apply(settings);
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      logger.debug('Unsubscribing from brand_settings_changes');
      supabase.removeChannel(channel);
    };
  }, [userId]);
}

/**
 * Convert hex color to HSL format for Tailwind CSS variables
 */
function hexToHSL(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // Convert hex to RGB
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  // Find max and min values
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  // Convert to degrees and percentages
  const hDeg = Math.round(h * 360);
  const sPercent = Math.round(s * 100);
  const lPercent = Math.round(l * 100);

  return `${hDeg} ${sPercent}% ${lPercent}%`;
}

/**
 * Apply theme colors to CSS custom properties
 */
function applyThemeColors(brandSettings: BrandSettings) {
  const root = document.documentElement;

  try {
    const entries: Array<[string, string, string | null]> = [
      ['--primary', 'data-brand-primary', brandSettings.primary_color],
      ['--secondary', 'data-brand-secondary', brandSettings.secondary_color],
      ['--accent', 'data-brand-accent', brandSettings.accent_color],
    ];
    for (const [cssVar, attr, hex] of entries) {
      // The table CHECK already requires this; a null column keeps the app's own token.
      if (!hex || !HEX_COLOR.test(hex)) continue;
      root.style.setProperty(cssVar, hexToHSL(hex));
      root.setAttribute(attr, hex);
    }
  } catch (error) {
    logger.error('Error applying theme colors:', error);
  }
}

/**
 * Apply business name to the page
 */
function applyBusinessName(businessName: string | null) {
  if (businessName) {
    // Store in data attribute for use in UI
    document.documentElement.setAttribute('data-business-name', businessName);

    // Optionally update page title
    const currentTitle = document.title;
    if (!currentTitle.includes(businessName)) {
      document.title = `${businessName} - EatPal`;
    }
  }
}

/**
 * Only a favicon served over https from this project's own Supabase origin
 * (storage) is accepted. favicon_url is free text the account writes; a
 * third-party URL would let a Professional account point the tab icon at a tracker.
 */
export function isAllowedFaviconUrl(faviconUrl: string | null | undefined): faviconUrl is string {
  if (!faviconUrl) return false;
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (typeof base !== 'string' || !base) return false;
  try {
    const url = new URL(faviconUrl);
    return url.protocol === 'https:' && url.origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/**
 * Apply custom favicon if provided and allowed
 */
function applyFavicon(faviconUrl: string | null) {
  if (!isAllowedFaviconUrl(faviconUrl)) return;

  let faviconLink = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
  if (!faviconLink) {
    faviconLink = document.createElement('link');
    faviconLink.rel = 'icon';
    document.head.appendChild(faviconLink);
  }
  faviconLink.href = faviconUrl;
}

/**
 * Get the current business name from the data attribute
 */
export function getBusinessName(): string {
  const businessName = document.documentElement.getAttribute('data-business-name');
  return businessName || 'EatPal';
}

/**
 * Check if white-label theme is active
 */
export function isWhiteLabelActive(): boolean {
  return document.documentElement.hasAttribute('data-business-name');
}
