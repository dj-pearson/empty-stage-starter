/**
 * Browser and Device Detection Utilities
 *
 * Helper functions for detecting browsers, devices, operating systems,
 * and browser capabilities.
 */

export type BrowserName =
  | 'chrome'
  | 'firefox'
  | 'safari'
  | 'edge'
  | 'opera'
  | 'ie'
  | 'samsung'
  | 'unknown';

export type OSName =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'ios'
  | 'android'
  | 'chromeos'
  | 'unknown';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface BrowserInfo {
  name: BrowserName;
  version: string;
  majorVersion: number;
}

export interface OSInfo {
  name: OSName;
  version: string;
}

export interface DeviceInfo {
  type: DeviceType;
  vendor: string;
  model: string;
  isTouchDevice: boolean;
}

/**
 * Get user agent string
 */
export function getUserAgent(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent;
}

/**
 * Detect browser information
 *
 * Usage:
 * ```tsx
 * const browser = getBrowserInfo();
 * console.log(browser.name); // 'chrome'
 * console.log(browser.version); // '120.0.0'
 * ```
 */
export function getBrowserInfo(): BrowserInfo {
  const ua = getUserAgent();

  // Edge (Chromium-based)
  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/(\d+\.\d+\.\d+)/);
    const version = match ? match[1] : 'unknown';
    return {
      name: 'edge',
      version,
      majorVersion: parseInt(version.split('.')[0], 10),
    };
  }

  // Chrome
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const match = ua.match(/Chrome\/(\d+\.\d+\.\d+)/);
    const version = match ? match[1] : 'unknown';
    return {
      name: 'chrome',
      version,
      majorVersion: parseInt(version.split('.')[0], 10),
    };
  }

  // Safari
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    const match = ua.match(/Version\/(\d+\.\d+(\.\d+)?)/);
    const version = match ? match[1] : 'unknown';
    return {
      name: 'safari',
      version,
      majorVersion: parseInt(version.split('.')[0], 10),
    };
  }

  // Firefox
  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/(\d+\.\d+)/);
    const version = match ? match[1] : 'unknown';
    return {
      name: 'firefox',
      version,
      majorVersion: parseInt(version.split('.')[0], 10),
    };
  }

  // Opera
  if (ua.includes('OPR/') || ua.includes('Opera/')) {
    const match = ua.match(/(?:OPR|Opera)\/(\d+\.\d+\.\d+)/);
    const version = match ? match[1] : 'unknown';
    return {
      name: 'opera',
      version,
      majorVersion: parseInt(version.split('.')[0], 10),
    };
  }

  // Samsung Internet
  if (ua.includes('SamsungBrowser/')) {
    const match = ua.match(/SamsungBrowser\/(\d+\.\d+)/);
    const version = match ? match[1] : 'unknown';
    return {
      name: 'samsung',
      version,
      majorVersion: parseInt(version.split('.')[0], 10),
    };
  }

  // Internet Explorer
  if (ua.includes('MSIE ') || ua.includes('Trident/')) {
    const match = ua.match(/(?:MSIE |rv:)(\d+\.\d+)/);
    const version = match ? match[1] : 'unknown';
    return {
      name: 'ie',
      version,
      majorVersion: parseInt(version.split('.')[0], 10),
    };
  }

  return {
    name: 'unknown',
    version: 'unknown',
    majorVersion: 0,
  };
}

/**
 * Detect operating system
 */
export function getOSInfo(): OSInfo {
  const ua = getUserAgent();

  // Windows
  if (ua.includes('Windows NT')) {
    const match = ua.match(/Windows NT (\d+\.\d+)/);
    const version = match ? match[1] : 'unknown';
    return { name: 'windows', version };
  }

  // macOS
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X (\d+[._]\d+([._]\d+)?)/);
    const version = match ? match[1].replace(/_/g, '.') : 'unknown';
    return { name: 'macos', version };
  }

  // iOS
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) {
    const match = ua.match(/OS (\d+[._]\d+([._]\d+)?)/);
    const version = match ? match[1].replace(/_/g, '.') : 'unknown';
    return { name: 'ios', version };
  }

  // Android
  if (ua.includes('Android')) {
    const match = ua.match(/Android (\d+\.\d+(\.\d+)?)/);
    const version = match ? match[1] : 'unknown';
    return { name: 'android', version };
  }

  // Linux
  if (ua.includes('Linux')) {
    return { name: 'linux', version: 'unknown' };
  }

  // Chrome OS
  if (ua.includes('CrOS')) {
    return { name: 'chromeos', version: 'unknown' };
  }

  return { name: 'unknown', version: 'unknown' };
}

/**
 * Detect device type and info
 */
export function getDeviceInfo(): DeviceInfo {
  const ua = getUserAgent();

  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (navigator as any).msMaxTouchPoints > 0);

  // Tablet detection
  const isTablet =
    /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua) ||
    (isTouchDevice && window.innerWidth >= 768);

  // Mobile detection
  const isMobile =
    /Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) && !isTablet;

  // Vendor detection
  let vendor = 'unknown';
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('Mac')) {
    vendor = 'Apple';
  } else if (ua.includes('Samsung')) {
    vendor = 'Samsung';
  } else if (ua.includes('Huawei')) {
    vendor = 'Huawei';
  } else if (ua.includes('Xiaomi')) {
    vendor = 'Xiaomi';
  }

  // Model detection (basic)
  let model = 'unknown';
  const modelMatch = ua.match(/\(([^)]+)\)/);
  if (modelMatch) {
    model = modelMatch[1].split(';')[0].trim();
  }

  return {
    type: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
    vendor,
    model,
    isTouchDevice,
  };
}

/**
 * Browser detection shortcuts
 */
export const isChrome = (): boolean => getBrowserInfo().name === 'chrome';
export const isFirefox = (): boolean => getBrowserInfo().name === 'firefox';
export const isSafari = (): boolean => getBrowserInfo().name === 'safari';
export const isEdge = (): boolean => getBrowserInfo().name === 'edge';
export const isOpera = (): boolean => getBrowserInfo().name === 'opera';
export const isIE = (): boolean => getBrowserInfo().name === 'ie';
export const isSamsungBrowser = (): boolean => getBrowserInfo().name === 'samsung';

/**
 * OS detection shortcuts
 */
export const isWindows = (): boolean => getOSInfo().name === 'windows';
export const isMacOS = (): boolean => getOSInfo().name === 'macos';
export const isLinux = (): boolean => getOSInfo().name === 'linux';
export const isIOS = (): boolean => getOSInfo().name === 'ios';
export const isAndroid = (): boolean => getOSInfo().name === 'android';
export const isChromeOS = (): boolean => getOSInfo().name === 'chromeos';

/**
 * Device detection shortcuts
 */
export const isMobile = (): boolean => getDeviceInfo().type === 'mobile';
export const isTablet = (): boolean => getDeviceInfo().type === 'tablet';
export const isDesktop = (): boolean => getDeviceInfo().type === 'desktop';
export const isTouchDevice = (): boolean => getDeviceInfo().isTouchDevice;

/**
 * Check if browser supports specific feature
 *
 * Usage:
 * ```tsx
 * if (supportsFeature('localStorage')) {
 *   // Use localStorage
 * }
 * ```
 */
export function supportsFeature(feature: string): boolean {
  if (typeof window === 'undefined') return false;

  const features: Record<string, () => boolean> = {
    localStorage: () => {
      try {
        const test = '__test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
      } catch {
        return false;
      }
    },
    sessionStorage: () => {
      try {
        const test = '__test__';
        sessionStorage.setItem(test, test);
        sessionStorage.removeItem(test);
        return true;
      } catch {
        return false;
      }
    },
    indexedDB: () => 'indexedDB' in window,
    serviceWorker: () => 'serviceWorker' in navigator,
    pushNotifications: () => 'Notification' in window && 'PushManager' in window,
    geolocation: () => 'geolocation' in navigator,
    webgl: () => {
      try {
        const canvas = document.createElement('canvas');
        return !!(
          canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
        );
      } catch {
        return false;
      }
    },
    webgl2: () => {
      try {
        const canvas = document.createElement('canvas');
        return !!canvas.getContext('webgl2');
      } catch {
        return false;
      }
    },
    webWorker: () => typeof Worker !== 'undefined',
    webSocket: () => 'WebSocket' in window,
    webRTC: () => 'RTCPeerConnection' in window,
    canvas: () => {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext && canvas.getContext('2d'));
    },
    svg: () => !!document.createElementNS &&
      !!document.createElementNS('http://www.w3.org/2000/svg', 'svg').createSVGRect,
    touchEvents: () => 'ontouchstart' in window,
    pointerEvents: () => 'PointerEvent' in window,
    webAssembly: () => typeof WebAssembly !== 'undefined',
    intersectionObserver: () => 'IntersectionObserver' in window,
    mutationObserver: () => 'MutationObserver' in window,
    resizeObserver: () => 'ResizeObserver' in window,
    crypto: () => 'crypto' in window && 'subtle' in window.crypto,
    clipboard: () => 'clipboard' in navigator,
    share: () => 'share' in navigator,
    bluetooth: () => 'bluetooth' in navigator,
    usb: () => 'usb' in navigator,
    mediaDevices: () => 'mediaDevices' in navigator,
    getUserMedia: () =>
      'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
    fullscreen: () =>
      'requestFullscreen' in document.documentElement ||
      'webkitRequestFullscreen' in document.documentElement,
    pictureInPicture: () => 'pictureInPictureEnabled' in document,
    wakeLock: () => 'wakeLock' in navigator,
    vibrate: () => 'vibrate' in navigator,
    battery: () => 'getBattery' in navigator,
    permissions: () => 'permissions' in navigator,
    credentials: () => 'credentials' in navigator,
  };

  const checker = features[feature];
  return checker ? checker() : false;
}

/**
 * Get all browser capabilities
 */
export function getBrowserCapabilities() {
  return {
    localStorage: supportsFeature('localStorage'),
    sessionStorage: supportsFeature('sessionStorage'),
    indexedDB: supportsFeature('indexedDB'),
    serviceWorker: supportsFeature('serviceWorker'),
    pushNotifications: supportsFeature('pushNotifications'),
    geolocation: supportsFeature('geolocation'),
    webgl: supportsFeature('webgl'),
    webgl2: supportsFeature('webgl2'),
    webWorker: supportsFeature('webWorker'),
    webSocket: supportsFeature('webSocket'),
    webRTC: supportsFeature('webRTC'),
    canvas: supportsFeature('canvas'),
    svg: supportsFeature('svg'),
    touchEvents: supportsFeature('touchEvents'),
    pointerEvents: supportsFeature('pointerEvents'),
    webAssembly: supportsFeature('webAssembly'),
    intersectionObserver: supportsFeature('intersectionObserver'),
    mutationObserver: supportsFeature('mutationObserver'),
    resizeObserver: supportsFeature('resizeObserver'),
    crypto: supportsFeature('crypto'),
    clipboard: supportsFeature('clipboard'),
    share: supportsFeature('share'),
    bluetooth: supportsFeature('bluetooth'),
    usb: supportsFeature('usb'),
    mediaDevices: supportsFeature('mediaDevices'),
    getUserMedia: supportsFeature('getUserMedia'),
    fullscreen: supportsFeature('fullscreen'),
    pictureInPicture: supportsFeature('pictureInPicture'),
    wakeLock: supportsFeature('wakeLock'),
    vibrate: supportsFeature('vibrate'),
    battery: supportsFeature('battery'),
    permissions: supportsFeature('permissions'),
    credentials: supportsFeature('credentials'),
  };
}

/**
 * Check if browser is outdated
 */
export function isBrowserOutdated(): boolean {
  const browser = getBrowserInfo();

  const minVersions: Record<BrowserName, number> = {
    chrome: 90,
    firefox: 88,
    safari: 14,
    edge: 90,
    opera: 76,
    ie: Infinity, // IE is always outdated
    samsung: 14,
    unknown: 0,
  };

  const minVersion = minVersions[browser.name];
  return browser.majorVersion < minVersion;
}

/**
 * Get screen information
 */
export function getScreenInfo() {
  if (typeof window === 'undefined' || typeof screen === 'undefined') {
    return {
      width: 0,
      height: 0,
      availWidth: 0,
      availHeight: 0,
      colorDepth: 0,
      pixelDepth: 0,
      orientation: 'unknown' as const,
      pixelRatio: 1,
    };
  }

  return {
    width: screen.width,
    height: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    orientation: screen.orientation?.type || 'unknown',
    pixelRatio: window.devicePixelRatio || 1,
  };
}

/**
 * Get viewport size
 */
export function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Check if user prefers dark mode
 */
export function prefersDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Check if user prefers light mode
 */
export function prefersLightMode(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

/**
 * Check if user prefers high contrast
 */
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: high)').matches;
}

/**
 * Get connection information
 */
export function getConnectionInfo() {
  if (typeof navigator === 'undefined' || !(navigator as any).connection) {
    return {
      effectiveType: 'unknown',
      downlink: 0,
      rtt: 0,
      saveData: false,
    };
  }

  const connection = (navigator as any).connection;

  return {
    effectiveType: connection.effectiveType || 'unknown',
    downlink: connection.downlink || 0,
    rtt: connection.rtt || 0,
    saveData: connection.saveData || false,
  };
}

/**
 * Check if connection is slow
 */
export function isSlowConnection(): boolean {
  const connection = getConnectionInfo();
  return (
    connection.effectiveType === 'slow-2g' ||
    connection.effectiveType === '2g' ||
    connection.saveData
  );
}

/**
 * Check if online
 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Get battery status (if available)
 */
export async function getBatteryStatus() {
  if (!supportsFeature('battery')) {
    return null;
  }

  try {
    const battery = await (navigator as any).getBattery();
    return {
      charging: battery.charging,
      level: battery.level,
      chargingTime: battery.chargingTime,
      dischargingTime: battery.dischargingTime,
    };
  } catch {
    return null;
  }
}

/**
 * Get memory information (Chrome only)
 */
export function getMemoryInfo() {
  if (typeof performance === 'undefined' || !(performance as any).memory) {
    return null;
  }

  const memory = (performance as any).memory;

  return {
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    totalJSHeapSize: memory.totalJSHeapSize,
    usedJSHeapSize: memory.usedJSHeapSize,
    usagePercentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
  };
}

/**
 * Check if running in iframe
 */
export function isInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  return window.self !== window.top;
}

/**
 * Check if running as PWA
 */
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Get installed PWA display mode
 */
export function getDisplayMode(): 'browser' | 'standalone' | 'minimal-ui' | 'fullscreen' {
  if (typeof window === 'undefined') return 'browser';

  if (window.matchMedia('(display-mode: fullscreen)').matches) {
    return 'fullscreen';
  }
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return 'standalone';
  }
  if (window.matchMedia('(display-mode: minimal-ui)').matches) {
    return 'minimal-ui';
  }
  return 'browser';
}

/**
 * Get language preferences
 */
export function getLanguagePreferences() {
  if (typeof navigator === 'undefined') {
    return {
      language: 'en',
      languages: ['en'],
    };
  }

  return {
    language: navigator.language,
    languages: navigator.languages || [navigator.language],
  };
}

/**
 * Get timezone
 */
export function getTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get complete system info
 */
export function getSystemInfo() {
  return {
    browser: getBrowserInfo(),
    os: getOSInfo(),
    device: getDeviceInfo(),
    screen: getScreenInfo(),
    viewport: getViewportSize(),
    capabilities: getBrowserCapabilities(),
    connection: getConnectionInfo(),
    preferences: {
      reducedMotion: prefersReducedMotion(),
      darkMode: prefersDarkMode(),
      lightMode: prefersLightMode(),
      highContrast: prefersHighContrast(),
    },
    language: getLanguagePreferences(),
    timezone: getTimezone(),
    isOnline: isOnline(),
    isPWA: isPWA(),
    displayMode: getDisplayMode(),
    isInIframe: isInIframe(),
    isBrowserOutdated: isBrowserOutdated(),
  };
}
