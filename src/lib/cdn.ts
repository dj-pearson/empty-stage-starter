/**
 * CDN Integration Utilities
 *
 * Provides helpers for working with Cloudflare CDN, image optimization,
 * and cache management.
 *
 * Features:
 * - Cloudflare Image Resizing support
 * - Cache control headers management
 * - Asset URL generation
 * - LQIP (Low Quality Image Placeholder) generation
 *
 * Usage:
 * ```typescript
 * import { cdn } from '@/lib/cdn';
 *
 * // Get optimized image URL
 * const url = cdn.getImageUrl('/images/hero.jpg', { width: 800, format: 'webp' });
 *
 * // Get LQIP placeholder
 * const placeholder = cdn.getLqipUrl('/images/hero.jpg');
 *
 * // Get cache control header
 * const cacheControl = cdn.getCacheControl('image');
 * ```
 */

/**
 * CDN configuration
 */
export interface CdnConfig {
  enabled: boolean;
  baseUrl: string;
  imageResizingEnabled: boolean;
  defaultImageQuality: number;
  defaultFormat: 'auto' | 'webp' | 'avif';
}

/**
 * Image transformation options
 */
export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  fit?: 'contain' | 'cover' | 'crop' | 'scale-down';
  gravity?: 'auto' | 'center' | 'top' | 'bottom' | 'left' | 'right';
  blur?: number; // 0-250 for Cloudflare
  sharpen?: number;
  dpr?: number;
}

/**
 * LQIP options
 */
export interface LqipOptions {
  width?: number;
  quality?: number;
  blur?: number;
}

/**
 * Cache control presets (in seconds)
 */
export const CACHE_DURATIONS = {
  // No cache
  none: 0,
  // Short-lived content
  short: 300, // 5 minutes
  // Medium-lived content (HTML pages)
  medium: 3600, // 1 hour
  // Long-lived content
  long: 86400, // 24 hours
  // Very long-lived (versioned assets)
  immutable: 31536000, // 1 year
};

/**
 * Asset type cache configurations
 */
export const ASSET_CACHE_CONFIG: Record<string, { maxAge: number; swr?: number; immutable?: boolean }> = {
  // Versioned assets (with hash in filename)
  'js': { maxAge: CACHE_DURATIONS.immutable, immutable: true },
  'css': { maxAge: CACHE_DURATIONS.immutable, immutable: true },
  'font': { maxAge: CACHE_DURATIONS.immutable, immutable: true },

  // Images
  'image': { maxAge: CACHE_DURATIONS.immutable, immutable: true },
  'lqip': { maxAge: CACHE_DURATIONS.long },

  // Dynamic content
  'html': { maxAge: CACHE_DURATIONS.short, swr: CACHE_DURATIONS.medium },
  'api': { maxAge: 0 },

  // Static files
  'manifest': { maxAge: CACHE_DURATIONS.medium },
  'sitemap': { maxAge: CACHE_DURATIONS.medium },
  'robots': { maxAge: CACHE_DURATIONS.long },
};

/**
 * CDN Service
 */
class CdnService {
  private config: CdnConfig = {
    enabled: true,
    baseUrl: '',
    imageResizingEnabled: true,
    defaultImageQuality: 85,
    defaultFormat: 'auto',
  };

  /**
   * Configure CDN settings
   */
  configure(config: Partial<CdnConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get optimized image URL with Cloudflare Image Resizing
   *
   * Cloudflare Image Resizing URL format:
   * /cdn-cgi/image/OPTIONS/IMAGE_URL
   *
   * Options: width, height, quality, format, fit, gravity, blur, sharpen, dpr
   */
  getImageUrl(src: string, options: ImageTransformOptions = {}): string {
    if (!this.config.imageResizingEnabled || !src) {
      return src;
    }

    // Don't transform external URLs or data URIs
    if (src.startsWith('http') || src.startsWith('data:')) {
      return src;
    }

    const params: string[] = [];

    if (options.width) params.push(`width=${options.width}`);
    if (options.height) params.push(`height=${options.height}`);
    if (options.quality) params.push(`quality=${options.quality}`);
    else params.push(`quality=${this.config.defaultImageQuality}`);
    if (options.format) params.push(`format=${options.format}`);
    else params.push(`format=${this.config.defaultFormat}`);
    if (options.fit) params.push(`fit=${options.fit}`);
    if (options.gravity) params.push(`gravity=${options.gravity}`);
    if (options.blur) params.push(`blur=${Math.min(250, options.blur)}`);
    if (options.sharpen) params.push(`sharpen=${options.sharpen}`);
    if (options.dpr) params.push(`dpr=${options.dpr}`);

    const optionsString = params.join(',');

    // Cloudflare Image Resizing URL format
    return `/cdn-cgi/image/${optionsString}${src}`;
  }

  /**
   * Get LQIP (Low Quality Image Placeholder) URL
   *
   * Creates a tiny, blurred version of the image for placeholders
   */
  getLqipUrl(src: string, options: LqipOptions = {}): string {
    return this.getImageUrl(src, {
      width: options.width || 20,
      quality: options.quality || 10,
      blur: options.blur || 10,
      format: 'webp',
    });
  }

  /**
   * Generate responsive srcSet for an image
   */
  getResponsiveSrcSet(
    src: string,
    widths: number[] = [640, 768, 1024, 1280, 1920],
    options: Omit<ImageTransformOptions, 'width'> = {}
  ): string {
    return widths
      .map((width) => `${this.getImageUrl(src, { ...options, width })} ${width}w`)
      .join(', ');
  }

  /**
   * Get cache control header value
   */
  getCacheControl(assetType: keyof typeof ASSET_CACHE_CONFIG): string {
    const config = ASSET_CACHE_CONFIG[assetType];
    if (!config) return 'no-store';

    const directives: string[] = ['public'];

    if (config.maxAge === 0) {
      return 'no-store, must-revalidate';
    }

    directives.push(`max-age=${config.maxAge}`);

    if (config.swr) {
      directives.push(`stale-while-revalidate=${config.swr}`);
    }

    if (config.immutable) {
      directives.push('immutable');
    }

    return directives.join(', ');
  }

  /**
   * Get preload link attributes for critical resources
   */
  getPreloadAttrs(
    src: string,
    type: 'image' | 'font' | 'script' | 'style'
  ): Record<string, string> {
    const attrs: Record<string, string> = {
      rel: 'preload',
      href: src,
    };

    switch (type) {
      case 'image':
        attrs.as = 'image';
        break;
      case 'font':
        attrs.as = 'font';
        attrs.crossorigin = 'anonymous';
        break;
      case 'script':
        attrs.as = 'script';
        break;
      case 'style':
        attrs.as = 'style';
        break;
    }

    return attrs;
  }

  /**
   * Get prefetch link attributes
   */
  getPrefetchAttrs(src: string): Record<string, string> {
    return {
      rel: 'prefetch',
      href: src,
    };
  }

  /**
   * Check if URL is cached by CDN (via headers)
   */
  isCdnCached(response: Response): boolean {
    const cfCache = response.headers.get('cf-cache-status');
    return cfCache === 'HIT' || cfCache === 'STALE';
  }

  /**
   * Generate integrity hash for subresource integrity
   * Note: This should be called during build time, not runtime
   */
  async generateIntegrityHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-384', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));
    return `sha384-${hashBase64}`;
  }

  /**
   * Get base URL for absolute URLs
   */
  getBaseUrl(): string {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return this.config.baseUrl || '';
  }

  /**
   * Convert relative URL to absolute
   */
  toAbsoluteUrl(path: string): string {
    if (path.startsWith('http')) return path;
    const base = this.getBaseUrl();
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /**
   * Get optimal format based on browser support
   */
  getOptimalFormat(): 'avif' | 'webp' | 'jpeg' {
    if (typeof document === 'undefined') return 'webp';

    // Check AVIF support
    const avifSupport = document.createElement('canvas').toDataURL('image/avif').indexOf('data:image/avif') === 0;
    if (avifSupport) return 'avif';

    // Check WebP support
    const webpSupport = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
    if (webpSupport) return 'webp';

    return 'jpeg';
  }

  /**
   * Purge CDN cache for specific URLs (requires API access)
   * Note: This would need Cloudflare API integration in production
   */
  async purgeCache(urls: string[]): Promise<boolean> {
    // This would integrate with Cloudflare API in production
    console.warn('CDN cache purge not implemented - requires Cloudflare API integration');
    return false;
  }
}

// Export singleton instance
export const cdn = new CdnService();

// Export types and constants
export type { CdnConfig, ImageTransformOptions, LqipOptions };
