/**
 * LqipImage Component
 *
 * Progressive image loading with Low Quality Image Placeholder (LQIP).
 * Uses a tiny, blurred version of the image as a placeholder while
 * the full-resolution image loads.
 *
 * Features:
 * - Base64 or URL-based LQIP placeholders
 * - Smooth transition from placeholder to full image
 * - Intersection Observer for lazy loading
 * - Support for modern formats (AVIF, WebP)
 * - Accessibility compliant
 * - Configurable blur amount and transition speed
 *
 * Usage:
 * ```tsx
 * // With auto-generated LQIP (via CDN)
 * <LqipImage
 *   src="/images/hero.jpg"
 *   alt="Hero image"
 *   width={1920}
 *   height={1080}
 *   priority
 * />
 *
 * // With custom LQIP placeholder
 * <LqipImage
 *   src="/images/feature.jpg"
 *   lqipSrc="data:image/webp;base64,..."
 *   alt="Feature image"
 *   width={800}
 *   height={600}
 * />
 *
 * // With dominant color placeholder
 * <LqipImage
 *   src="/images/product.jpg"
 *   placeholderColor="#3b82f6"
 *   alt="Product image"
 *   width={400}
 *   height={400}
 * />
 * ```
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { cdn } from '@/lib/cdn';

interface LqipImageProps {
  /** Image source URL (required) */
  src: string;
  /** Alt text for accessibility and SEO */
  alt: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
  /** Container CSS classes */
  containerClassName?: string;
  /** Load immediately with high priority (for LCP/above-fold images) */
  priority?: boolean;
  /** Custom LQIP source (base64 or URL) */
  lqipSrc?: string;
  /** Fallback placeholder color (hex) */
  placeholderColor?: string;
  /** LQIP blur amount (in pixels) */
  blurAmount?: number;
  /** Transition duration (in ms) */
  transitionDuration?: number;
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
  /** Use native lazy loading instead of Intersection Observer */
  nativeLazy?: boolean;
}

/**
 * Generate a simple SVG blur placeholder
 */
function generateSvgPlaceholder(
  width: number,
  height: number,
  color: string = '#e5e7eb'
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
    <filter id="b" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="20"/>
    </filter>
    <rect width="100%" height="100%" fill="${color}" filter="url(#b)"/>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function LqipImage({
  src,
  alt,
  width,
  height,
  className,
  containerClassName,
  priority = false,
  lqipSrc,
  placeholderColor = '#e5e7eb',
  blurAmount = 20,
  transitionDuration = 500,
  sizes,
  objectFit = 'cover',
  decorative = false,
  onLoad,
  onError,
  nativeLazy = false,
}: LqipImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority || nativeLazy);
  const [lqipLoaded, setLqipLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Generate LQIP URL if not provided
  const effectiveLqipSrc = useMemo(() => {
    if (lqipSrc) return lqipSrc;
    // Use CDN LQIP generation for local images
    if (!src.startsWith('http') && !src.startsWith('data:')) {
      return cdn.getLqipUrl(src, { width: 20, quality: 10, blur: 10 });
    }
    // For external images, use SVG placeholder
    return generateSvgPlaceholder(width || 100, height || 100, placeholderColor);
  }, [lqipSrc, src, width, height, placeholderColor]);

  // Get base path without extension for format alternatives
  const basePath = src.replace(/\.[^/.]+$/, '');

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || nativeLazy || !containerRef.current) return;

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
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [priority, nativeLazy]);

  // Preload high-priority images
  useEffect(() => {
    if (!priority || !src) return;

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, [priority, src]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  const handleLqipLoad = () => {
    setLqipLoaded(true);
  };

  // Accessibility attributes for decorative images
  const a11yProps = decorative
    ? { alt: '', 'aria-hidden': true as const, role: 'presentation' as const }
    : { alt };

  // Calculate aspect ratio
  const aspectRatio = width && height ? width / height : undefined;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden bg-muted',
        containerClassName
      )}
      style={{
        aspectRatio: aspectRatio ? `${aspectRatio}` : undefined,
        width: width ? `${width}px` : '100%',
        maxWidth: '100%',
      }}
    >
      {/* LQIP placeholder layer */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity',
          isLoaded ? 'opacity-0' : 'opacity-100'
        )}
        style={{
          transitionDuration: `${transitionDuration}ms`,
          filter: `blur(${blurAmount}px)`,
          transform: 'scale(1.1)', // Prevent blur edge artifacts
        }}
        aria-hidden="true"
      >
        {/* Color placeholder (immediate) */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: placeholderColor }}
        />

        {/* LQIP image */}
        {effectiveLqipSrc && (
          <img
            src={effectiveLqipSrc}
            onLoad={handleLqipLoad}
            className={cn(
              'absolute inset-0 w-full h-full transition-opacity',
              lqipLoaded ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              objectFit,
              transitionDuration: `${transitionDuration / 2}ms`,
            }}
            alt=""
            aria-hidden="true"
          />
        )}
      </div>

      {/* Error state */}
      {hasError && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <span className="text-sm">Image unavailable</span>
        </div>
      )}

      {/* Full resolution image */}
      {isInView && !hasError && (
        <picture>
          {/* AVIF - Best compression */}
          <source
            srcSet={`${basePath}.avif`}
            type="image/avif"
          />

          {/* WebP - Good compression, wide support */}
          <source
            srcSet={`${basePath}.webp`}
            type="image/webp"
          />

          {/* Fallback to original format */}
          <img
            ref={imgRef}
            src={src}
            width={width}
            height={height}
            loading={priority ? 'eager' : nativeLazy ? 'lazy' : undefined}
            fetchPriority={priority ? 'high' : undefined}
            decoding={priority ? 'sync' : 'async'}
            sizes={sizes}
            onLoad={handleLoad}
            onError={handleError}
            className={cn(
              'relative transition-opacity',
              isLoaded ? 'opacity-100' : 'opacity-0',
              className
            )}
            style={{
              objectFit,
              width: '100%',
              height: '100%',
              transitionDuration: `${transitionDuration}ms`,
            }}
            {...a11yProps}
          />
        </picture>
      )}
    </div>
  );
}

/**
 * Responsive LQIP Image with srcSet support
 */
interface ResponsiveLqipImageProps extends Omit<LqipImageProps, 'width' | 'height'> {
  /** Responsive image sources */
  srcSet?: {
    sm?: string; // 640px
    md?: string; // 768px
    lg?: string; // 1024px
    xl?: string; // 1280px
    '2xl'?: string; // 1920px
  };
  /** Aspect ratio (e.g., 16/9) */
  aspectRatio?: number;
}

export function ResponsiveLqipImage({
  src,
  srcSet,
  alt,
  aspectRatio = 16 / 9,
  className,
  containerClassName,
  priority = false,
  lqipSrc,
  placeholderColor = '#e5e7eb',
  blurAmount = 20,
  transitionDuration = 500,
  sizes = '100vw',
  objectFit = 'cover',
  decorative = false,
  onLoad,
  onError,
}: ResponsiveLqipImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate LQIP URL if not provided
  const effectiveLqipSrc = useMemo(() => {
    if (lqipSrc) return lqipSrc;
    if (!src.startsWith('http') && !src.startsWith('data:')) {
      return cdn.getLqipUrl(src, { width: 20, quality: 10, blur: 10 });
    }
    return generateSvgPlaceholder(100, Math.round(100 / aspectRatio), placeholderColor);
  }, [lqipSrc, src, aspectRatio, placeholderColor]);

  // Build srcSet strings
  const buildSrcSet = (format: 'avif' | 'webp' | 'original') => {
    if (!srcSet) return undefined;

    const widths: Record<string, number> = {
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      '2xl': 1920,
    };

    return Object.entries(srcSet)
      .map(([size, path]) => {
        const basePath = path.replace(/\.[^/.]+$/, '');
        const w = widths[size] || 1280;
        const ext = format === 'original' ? '' : `.${format}`;
        const finalPath = format === 'original' ? path : `${basePath}${ext}`;
        return `${finalPath} ${w}w`;
      })
      .join(', ');
  };

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
      { rootMargin: '100px', threshold: 0.01 }
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

  const a11yProps = decorative
    ? { alt: '', 'aria-hidden': true as const, role: 'presentation' as const }
    : { alt };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden bg-muted w-full',
        containerClassName
      )}
      style={{ aspectRatio: `${aspectRatio}` }}
    >
      {/* LQIP placeholder */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity',
          isLoaded ? 'opacity-0' : 'opacity-100'
        )}
        style={{
          transitionDuration: `${transitionDuration}ms`,
          filter: `blur(${blurAmount}px)`,
          transform: 'scale(1.1)',
        }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0"
          style={{ backgroundColor: placeholderColor }}
        />
        {effectiveLqipSrc && (
          <img
            src={effectiveLqipSrc}
            className="absolute inset-0 w-full h-full"
            style={{ objectFit }}
            alt=""
            aria-hidden="true"
          />
        )}
      </div>

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
          {srcSet && (
            <>
              <source
                srcSet={buildSrcSet('avif')}
                type="image/avif"
                sizes={sizes}
              />
              <source
                srcSet={buildSrcSet('webp')}
                type="image/webp"
                sizes={sizes}
              />
            </>
          )}
          <img
            src={src}
            srcSet={srcSet ? buildSrcSet('original') : undefined}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding={priority ? 'sync' : 'async'}
            sizes={sizes}
            onLoad={handleLoad}
            onError={handleError}
            className={cn(
              'relative transition-opacity w-full h-full',
              isLoaded ? 'opacity-100' : 'opacity-0',
              className
            )}
            style={{
              objectFit,
              transitionDuration: `${transitionDuration}ms`,
            }}
            {...a11yProps}
          />
        </picture>
      )}
    </div>
  );
}
