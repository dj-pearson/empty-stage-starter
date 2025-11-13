/**
 * OptimizedImage Component
 *
 * Automatically serves optimized images in modern formats (AVIF, WebP)
 * with fallbacks for older browsers. Includes lazy loading and blur placeholder.
 *
 * Usage:
 * ```tsx
 * <OptimizedImage
 *   src="/images/cover.png"
 *   alt="Description"
 *   width={1920}
 *   height={1080}
 *   priority={false} // Set true for above-the-fold images
 * />
 * ```
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean; // Load immediately, skip lazy loading
  sizes?: string; // Responsive sizes attribute
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
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
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);

  // Get base path without extension
  const basePath = src.replace(/\.[^/.]+$/, '');
  const ext = src.split('.').pop() || 'png';

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority) return; // Skip lazy loading for priority images

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
      }
    );

    const element = document.querySelector(`[data-image-src="${src}"]`);
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [src, priority]);

  return (
    <div
      data-image-src={src}
      className={cn('relative overflow-hidden bg-muted', className)}
      style={{ aspectRatio: width && height ? `${width} / ${height}` : undefined }}
    >
      {/* Blur placeholder - tiny base64 image */}
      {!isLoaded && (
        <div
          className="absolute inset-0 blur-xl scale-110"
          style={{
            backgroundImage: `url(data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width || 100} ${height || 100}'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='%2391a7b8' filter='url(%23b)'/%3E%3C/svg%3E)`,
            backgroundSize: 'cover',
          }}
        />
      )}

      {/* Actual image - only load when in view or priority */}
      {isInView && (
        <picture>
          {/* AVIF - Best compression */}
          <source srcSet={`${basePath}.avif`} type="image/avif" />

          {/* WebP - Good compression, wide support */}
          <source srcSet={`${basePath}.webp`} type="image/webp" />

          {/* Fallback to original format */}
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            sizes={sizes}
            onLoad={() => setIsLoaded(true)}
            className={cn(
              'transition-opacity duration-300',
              isLoaded ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              objectFit,
              width: '100%',
              height: '100%',
            }}
          />
        </picture>
      )}
    </div>
  );
}

/**
 * Responsive Image Component
 *
 * Serves different image sizes based on viewport width
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
}: ResponsiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);

  const basePath = src.replace(/\.[^/.]+$/, '');

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '50px' }
    );

    const element = document.querySelector(`[data-image-src="${src}"]`);
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [src, priority]);

  // Build srcSet string for AVIF
  const avifSrcSet = srcSet
    ? Object.entries(srcSet)
        .map(([size, path]) => {
          const basePath = path.replace(/\.[^/.]+$/, '');
          const width = size === 'sm' ? 640 : size === 'md' ? 768 : size === 'lg' ? 1024 : size === 'xl' ? 1280 : 1920;
          return `${basePath}.avif ${width}w`;
        })
        .join(', ')
    : undefined;

  // Build srcSet string for WebP
  const webpSrcSet = srcSet
    ? Object.entries(srcSet)
        .map(([size, path]) => {
          const basePath = path.replace(/\.[^/.]+$/, '');
          const width = size === 'sm' ? 640 : size === 'md' ? 768 : size === 'lg' ? 1024 : size === 'xl' ? 1280 : 1920;
          return `${basePath}.webp ${width}w`;
        })
        .join(', ')
    : undefined;

  return (
    <div
      data-image-src={src}
      className={cn('relative overflow-hidden bg-muted', className)}
      style={{ aspectRatio: width && height ? `${width} / ${height}` : undefined }}
    >
      {!isLoaded && (
        <div
          className="absolute inset-0 blur-xl scale-110"
          style={{
            backgroundImage: `url(data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width || 100} ${height || 100}'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' fill='%2391a7b8' filter='url(%23b)'/%3E%3C/svg%3E)`,
            backgroundSize: 'cover',
          }}
        />
      )}

      {isInView && (
        <picture>
          {avifSrcSet && <source srcSet={avifSrcSet} type="image/avif" sizes={sizes} />}
          {webpSrcSet && <source srcSet={webpSrcSet} type="image/webp" sizes={sizes} />}
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            sizes={sizes}
            onLoad={() => setIsLoaded(true)}
            className={cn(
              'transition-opacity duration-300',
              isLoaded ? 'opacity-100' : 'opacity-0'
            )}
            style={{
              objectFit,
              width: '100%',
              height: '100%',
            }}
          />
        </picture>
      )}
    </div>
  );
}
