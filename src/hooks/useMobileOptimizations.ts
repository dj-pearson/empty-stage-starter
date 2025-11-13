import { useEffect, useState } from 'react';

/**
 * Mobile device detection and optimization utilities
 */

export interface MobileInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isTouchDevice: boolean;
  hasReducedMotion: boolean;
  hasLowBandwidth: boolean;
  isLowEndDevice: boolean;
  screenSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  orientation: 'portrait' | 'landscape';
}

/**
 * Detect mobile device and capabilities
 */
export function useMobileOptimizations(): MobileInfo {
  const [mobileInfo, setMobileInfo] = useState<MobileInfo>(() => ({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isIOS: false,
    isAndroid: false,
    isTouchDevice: false,
    hasReducedMotion: false,
    hasLowBandwidth: false,
    isLowEndDevice: false,
    screenSize: 'lg',
    orientation: 'landscape',
  }));

  useEffect(() => {
    const updateMobileInfo = () => {
      const ua = navigator.userAgent.toLowerCase();
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Device detection
      const isMobile = /mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua);
      const isTablet = /ipad|android(?!.*mobile)|tablet|kindle/i.test(ua) || (width >= 768 && width < 1024);
      const isDesktop = !isMobile && !isTablet;
      const isIOS = /iphone|ipad|ipod/i.test(ua);
      const isAndroid = /android/i.test(ua);
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      // Performance hints
      const hasReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Network detection
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      const hasLowBandwidth = connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g' || connection?.saveData;

      // Device capability detection (very basic heuristic)
      const hardwareConcurrency = navigator.hardwareConcurrency || 4;
      const deviceMemory = (navigator as any).deviceMemory || 4;
      const isLowEndDevice = hardwareConcurrency < 4 || deviceMemory < 4;

      // Screen size
      let screenSize: MobileInfo['screenSize'] = 'lg';
      if (width < 640) screenSize = 'xs';
      else if (width < 768) screenSize = 'sm';
      else if (width < 1024) screenSize = 'md';
      else if (width < 1280) screenSize = 'lg';
      else if (width < 1536) screenSize = 'xl';
      else screenSize = '2xl';

      // Orientation
      const orientation = width > height ? 'landscape' : 'portrait';

      setMobileInfo({
        isMobile,
        isTablet,
        isDesktop,
        isIOS,
        isAndroid,
        isTouchDevice,
        hasReducedMotion,
        hasLowBandwidth,
        isLowEndDevice,
        screenSize,
        orientation,
      });
    };

    // Initial detection
    updateMobileInfo();

    // Update on resize and orientation change
    window.addEventListener('resize', updateMobileInfo);
    window.addEventListener('orientationchange', updateMobileInfo);

    // Update on connection change
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      connection.addEventListener('change', updateMobileInfo);
    }

    return () => {
      window.removeEventListener('resize', updateMobileInfo);
      window.removeEventListener('orientationchange', updateMobileInfo);
      if (connection) {
        connection.removeEventListener('change', updateMobileInfo);
      }
    };
  }, []);

  return mobileInfo;
}

/**
 * Get optimized settings based on device capabilities
 */
export function useOptimizedSettings() {
  const mobileInfo = useMobileOptimizations();

  return {
    // Animation settings
    shouldReduceMotion: mobileInfo.hasReducedMotion || mobileInfo.isLowEndDevice,
    animationDuration: mobileInfo.hasReducedMotion ? 0 : mobileInfo.isLowEndDevice ? 150 : 300,

    // Image quality settings
    imageQuality: mobileInfo.hasLowBandwidth ? 'low' : mobileInfo.isMobile ? 'medium' : 'high',
    useWebP: !mobileInfo.isIOS || parseInt(navigator.userAgent.match(/OS (\d+)_/)?.[1] || '14') >= 14,
    useAVIF: 'avif' in document.createElement('img'),

    // Performance settings
    enableLazyLoading: true,
    enableVirtualization: mobileInfo.isMobile || mobileInfo.isLowEndDevice,
    maxConcurrentRequests: mobileInfo.hasLowBandwidth ? 2 : mobileInfo.isMobile ? 4 : 6,

    // Feature flags
    enable3D: !mobileInfo.isLowEndDevice && !mobileInfo.hasLowBandwidth,
    enableVideoAutoplay: !mobileInfo.hasLowBandwidth && mobileInfo.isDesktop,
    enableHapticFeedback: mobileInfo.isTouchDevice && ('vibrate' in navigator),

    // Layout settings
    columnCount: mobileInfo.isMobile ? 1 : mobileInfo.isTablet ? 2 : 3,
    maxItemsPerPage: mobileInfo.isMobile ? 10 : mobileInfo.isTablet ? 20 : 50,

    // Touch settings
    touchTargetSize: mobileInfo.isTouchDevice ? 'large' : 'medium',
    enableSwipeGestures: mobileInfo.isTouchDevice,

    // Device info
    ...mobileInfo,
  };
}

/**
 * Apply mobile-specific optimizations to the document
 */
export function useMobileDocumentOptimizations() {
  const mobileInfo = useMobileOptimizations();

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // Add mobile-specific classes
    html.classList.toggle('is-mobile', mobileInfo.isMobile);
    html.classList.toggle('is-tablet', mobileInfo.isTablet);
    html.classList.toggle('is-desktop', mobileInfo.isDesktop);
    html.classList.toggle('is-touch', mobileInfo.isTouchDevice);
    html.classList.toggle('has-reduced-motion', mobileInfo.hasReducedMotion);
    html.classList.toggle('is-low-end', mobileInfo.isLowEndDevice);

    // Disable hover effects on touch devices
    if (mobileInfo.isTouchDevice) {
      html.classList.add('no-hover');
    }

    // Prevent bounce/overscroll on iOS
    if (mobileInfo.isIOS) {
      body.style.overscrollBehavior = 'none';
    }

    // Optimize for low-end devices
    if (mobileInfo.isLowEndDevice) {
      // Disable complex animations
      html.classList.add('disable-animations');

      // Reduce font smoothing
      (body.style as any).webkitFontSmoothing = 'subpixel-antialiased';
      (body.style as any).mozOsxFontSmoothing = 'auto';
    }

    // Viewport height fix for mobile (accounts for browser chrome)
    if (mobileInfo.isMobile) {
      const setViewportHeight = () => {
        html.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
      };
      setViewportHeight();
      window.addEventListener('resize', setViewportHeight);
      return () => window.removeEventListener('resize', setViewportHeight);
    }
  }, [mobileInfo]);
}

/**
 * Haptic feedback utility (for mobile devices)
 */
export function useHapticFeedback() {
  const { enableHapticFeedback } = useOptimizedSettings();

  const vibrate = (pattern: number | number[]) => {
    if (enableHapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };

  return {
    light: () => vibrate(10),
    medium: () => vibrate(20),
    heavy: () => vibrate(30),
    success: () => vibrate([10, 50, 10]),
    error: () => vibrate([50, 50, 50]),
    warning: () => vibrate([10, 30, 10, 30]),
    selection: () => vibrate(5),
  };
}

/**
 * Network status monitoring
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState({
    online: navigator.onLine,
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    saveData: false,
  });

  useEffect(() => {
    const updateNetworkStatus = () => {
      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

      setStatus({
        online: navigator.onLine,
        effectiveType: connection?.effectiveType || '4g',
        downlink: connection?.downlink || 10,
        rtt: connection?.rtt || 50,
        saveData: connection?.saveData || false,
      });
    };

    updateNetworkStatus();

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      connection.addEventListener('change', updateNetworkStatus);
    }

    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
      if (connection) {
        connection.removeEventListener('change', updateNetworkStatus);
      }
    };
  }, []);

  return status;
}
