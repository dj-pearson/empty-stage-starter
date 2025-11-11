// @ts-nocheck
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BrandSettings {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  business_name?: string;
  logo_url?: string;
  favicon_url?: string;
}

/**
 * Custom hook to apply white-label theme customizations for Professional tier users
 * Fetches brand settings and dynamically applies CSS variables to the root element
 */
export function useWhiteLabelTheme() {
  useEffect(() => {
    const applyCustomTheme = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check if user has Professional subscription
        const { data: subscriptionData } = await supabase
          .from('user_subscriptions')
          .select(`
            status,
            subscription_plans(name)
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        // Only apply custom theme for Professional users
        if (subscriptionData?.subscription_plans?.name !== 'Professional') {
          return;
        }

        // Fetch brand settings
        const { data: brandSettings } = await supabase
          .from('professional_brand_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (brandSettings) {
          applyThemeColors(brandSettings);
          applyBusinessName(brandSettings.business_name);
          applyFavicon(brandSettings.favicon_url);
        }
      } catch (error) {
        console.error('Error applying white-label theme:', error);
      }
    };

    applyCustomTheme();

    // Subscribe to changes in brand settings
    const subscription = supabase
      .channel('brand_settings_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'professional_brand_settings',
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const newSettings = payload.new as BrandSettings;
            applyThemeColors(newSettings);
            applyBusinessName(newSettings.business_name);
            applyFavicon(newSettings.favicon_url);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);
}

/**
 * Convert hex color to HSL format for Tailwind CSS variables
 */
function hexToHSL(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // Convert hex to RGB
  let r = parseInt(hex.slice(0, 2), 16) / 255;
  let g = parseInt(hex.slice(2, 4), 16) / 255;
  let b = parseInt(hex.slice(4, 6), 16) / 255;

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
    // Convert hex colors to HSL for Tailwind
    const primaryHSL = hexToHSL(brandSettings.primary_color);
    const secondaryHSL = hexToHSL(brandSettings.secondary_color);
    const accentHSL = hexToHSL(brandSettings.accent_color);

    // Apply to CSS variables
    root.style.setProperty('--primary', primaryHSL);
    root.style.setProperty('--secondary', secondaryHSL);
    root.style.setProperty('--accent', accentHSL);

    // Store the brand colors as data attributes for reference
    root.setAttribute('data-brand-primary', brandSettings.primary_color);
    root.setAttribute('data-brand-secondary', brandSettings.secondary_color);
    root.setAttribute('data-brand-accent', brandSettings.accent_color);
  } catch (error) {
    console.error('Error applying theme colors:', error);
  }
}

/**
 * Apply business name to the page
 */
function applyBusinessName(businessName?: string) {
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
 * Apply custom favicon if provided
 */
function applyFavicon(faviconUrl?: string) {
  if (faviconUrl) {
    // Find existing favicon link or create new one
    let faviconLink = document.querySelector("link[rel*='icon']") as HTMLLinkElement;

    if (!faviconLink) {
      faviconLink = document.createElement('link');
      faviconLink.rel = 'icon';
      document.head.appendChild(faviconLink);
    }

    faviconLink.href = faviconUrl;
  }
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
