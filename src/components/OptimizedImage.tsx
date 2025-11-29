/**
 * OptimizedImage Component
 *
 * SEO and Performance optimized image component with:
 * - Automatic lazy loading for below-fold images
 * - fetchPriority="high" for LCP/above-fold images (Core Web Vitals)
 * - Modern format support (AVIF, WebP with fallbacks)
 * - Blur placeholder during load
 * - Error state handling
 * - Decorative image support (aria-hidden)
 *
 * Usage:
 * ```tsx
 * // Hero image (above fold - high priority for LCP)
 * <OptimizedImage
 *   src="/images/cover.png"
 *   alt="Family enjoying healthy meal"
 *   width={1920}
 *   height={1080}
 *   priority={true}
 * />
 *
 * // Below-fold image (lazy loaded)
 * <OptimizedImage
 *   src="/images/feature.png"
 *   alt="Meal planning dashboard"
 *   width={800}
 *   height={600}
 * />
 *
 * // Decorative image (no SEO value)
 * <OptimizedImage
 *   src="/images/pattern.svg"
 *   alt=""
 *   decorative={true}
 * />
 * ```
 */

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface OptimizedImageProps {
  /** Image source URL (required) */
  src: string;
  /** Alt text for accessibility and SEO - required unless decorative */
  alt: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
  /** Load immediately with high priority (for LCP/above-fold images) */
  priority?: boolean;
  /** Responsive sizes attribute */
  sizes?: string;
  /** Object fit style */
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  /** Mark as decorative (sets aria-hidden, alt="") */
  decorative?: boolean;
  /** Callback when image loads */
  onLoad?: () => void;
  /** Callback when image fails to load */
  onError?: () => void;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  sizes,
  objectFit = 'cover',
  decorative = false,
  onLoad,
  onError,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get base path without extension
  const basePath = src.replace(/\.[^/.]+$/, '');

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Accessibility attributes for decorative images
  const a11yProps = decorative
    ? { alt: '', 'aria-hidden': true as const, role: 'presentation' as const }
    : { alt };

  return (
    <div
      ref={containerRef}
      data-image-src={src}
      className={cn('relative overflow-hidden bg-muted', className)}
      style={{ aspectRatio: width && height ? `${width} / ${height}` : undefined }}
    >
      {/* Blur placeholder - tiny base64 image */}
      {!isLoaded && !hasError && (
        <div
          className="absolute inset-0 blur-xl scale-110 animate-pulse"
          style={{
            backgroundImage: `url(data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width || 100} ${height || 100}'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='%2391a7b8' filter='url(%23b)'/%3E%3C/svg%3E)`,
            backgroundSize: 'cover',
          }}
          aria-hidden="true"
        />
      )}

      {/* Error state */}
      {hasError && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <span className="text-sm">Image unavailable</span>
        </div>
      )}

      {/* Actual image - only load when in view or priority */}
      {isInView && !hasError && (
        <picture>
          {/* AVIF - Best compression */}
          <source srcSet={`${basePath}.avif`} type="image/avif" />

          {/* WebP - Good compression, wide support */}
          <source srcSet={`${basePath}.webp`} type="image/webp" />

          {/* Fallback to original format */}
          <img
            src={src}
            width={width}
            height={height}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding={priority ? 'sync' : 'async'}
            sizes={sizes}
            onLoad={handleLoad}
            onError={handleError}
            className={cn(
              'transition-opacity duration-300',
              isLoaded ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              objectFit,
              width: '100%',
              height: '100%',
            }}
            {...a11yProps}
          />
        </picture>
      )}
    </div>
  );
}

/**
 * Responsive Image Component
 *
 * Serves different image sizes based on viewport width.
 * Includes all SEO and performance optimizations from OptimizedImage.
 */
interface ResponsiveImageProps extends OptimizedImageProps {
  srcSet?: {
    sm?: string; // 640px
    md?: string; // 768px
    lg?: string; // 1024px
    xl?: string; // 1280px
    '2xl'?: string; // 1920px
  };
}

export function ResponsiveImage({
  src,
  srcSet,
  alt,
  width,
  height,
  className,
  priority = false,
  sizes = '(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw',
  objectFit = 'cover',
  decorative = false,
  onLoad,
  onError,
}: ResponsiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '50px', threshold: 0.01 }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [priority]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Build srcSet string for AVIF
  const avifSrcSet = srcSet
    ? Object.entries(srcSet)
        .map(([size, path]) => {
          const basePath = path.replace(/\.[^/.]+$/, '');
          const w = size === 'sm' ? 640 : size === 'md' ? 768 : size === 'lg' ? 1024 : size === 'xl' ? 1280 : 1920;
          return `${basePath}.avif ${w}w`;
        })
        .join(', ')
    : undefined;

  // Build srcSet string for WebP
  const webpSrcSet = srcSet
    ? Object.entries(srcSet)
        .map(([size, path]) => {
          const basePath = path.replace(/\.[^/.]+$/, '');
          const w = size === 'sm' ? 640 : size === 'md' ? 768 : size === 'lg' ? 1024 : size === 'xl' ? 1280 : 1920;
          return `${basePath}.webp ${w}w`;
        })
        .join(', ')
    : undefined;

  // Accessibility attributes for decorative images
  const a11yProps = decorative
    ? { alt: '', 'aria-hidden': true as const, role: 'presentation' as const }
    : { alt };

  return (
    <div
      ref={containerRef}
      data-image-src={src}
      className={cn('relative overflow-hidden bg-muted', className)}
      style={{ aspectRatio: width && height ? `${width} / ${height}` : undefined }}
    >
      {!isLoaded && !hasError && (
        <div
          className="absolute inset-0 blur-xl scale-110 animate-pulse"
          style={{
            backgroundImage: `url(data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width || 100} ${height || 100}'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='%2391a7b8' filter='url(%23b)'/%3E%3C/svg%3E)`,
            backgroundSize: 'cover',
          }}
          aria-hidden="true"
        />
      )}

      {hasError && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <span className="text-sm">Image unavailable</span>
        </div>
      )}

      {isInView && !hasError && (
        <picture>
          {avifSrcSet && <source srcSet={avifSrcSet} type="image/avif" sizes={sizes} />}
          {webpSrcSet && <source srcSet={webpSrcSet} type="image/webp" sizes={sizes} />}
          <img
            src={src}
            width={width}
            height={height}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding={priority ? 'sync' : 'async'}
            sizes={sizes}
            onLoad={handleLoad}
            onError={handleError}
            className={cn(
              'transition-opacity duration-300',
              isLoaded ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              objectFit,
              width: '100%',
              height: '100%',
            }}
            {...a11yProps}
          />
        </picture>
      )}
    </div>
  );
}
