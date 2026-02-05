/**
 * User Agent Parser
 *
 * Parses user agent strings to extract device, browser, and OS information
 * without external dependencies for lightweight usage.
 */

export interface ParsedUserAgent {
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isBot: boolean;
}

// Browser detection patterns
const BROWSERS: { name: string; pattern: RegExp; versionPattern?: RegExp }[] = [
  { name: 'Edge', pattern: /Edg(e|A|iOS)?\//, versionPattern: /Edg(e|A|iOS)?\/(\d+[\.\d]*)/ },
  { name: 'Chrome', pattern: /Chrome\//, versionPattern: /Chrome\/(\d+[\.\d]*)/ },
  { name: 'Firefox', pattern: /Firefox\//, versionPattern: /Firefox\/(\d+[\.\d]*)/ },
  { name: 'Safari', pattern: /Safari\//, versionPattern: /Version\/(\d+[\.\d]*)/ },
  { name: 'Opera', pattern: /OPR\/|Opera\//, versionPattern: /(?:OPR|Opera)\/(\d+[\.\d]*)/ },
  { name: 'Samsung Browser', pattern: /SamsungBrowser\//, versionPattern: /SamsungBrowser\/(\d+[\.\d]*)/ },
  { name: 'UC Browser', pattern: /UCBrowser\//, versionPattern: /UCBrowser\/(\d+[\.\d]*)/ },
  { name: 'Brave', pattern: /Brave\//, versionPattern: /Brave\/(\d+[\.\d]*)/ },
  { name: 'Vivaldi', pattern: /Vivaldi\//, versionPattern: /Vivaldi\/(\d+[\.\d]*)/ },
  { name: 'IE', pattern: /MSIE|Trident\//, versionPattern: /(?:MSIE |rv:)(\d+[\.\d]*)/ },
];

// OS detection patterns
const OPERATING_SYSTEMS: { name: string; pattern: RegExp; versionPattern?: RegExp }[] = [
  { name: 'iOS', pattern: /iPhone|iPad|iPod/, versionPattern: /OS (\d+[_\.\d]*)/ },
  { name: 'Android', pattern: /Android/, versionPattern: /Android (\d+[\.\d]*)/ },
  { name: 'Windows', pattern: /Windows/, versionPattern: /Windows NT (\d+[\.\d]*)/ },
  { name: 'macOS', pattern: /Mac OS X|macOS/, versionPattern: /Mac OS X (\d+[_\.\d]*)/ },
  { name: 'Linux', pattern: /Linux/, versionPattern: /Linux/ },
  { name: 'Chrome OS', pattern: /CrOS/, versionPattern: /CrOS \S+ (\d+[\.\d]*)/ },
  { name: 'Ubuntu', pattern: /Ubuntu/, versionPattern: /Ubuntu\/(\d+[\.\d]*)/ },
  { name: 'Fedora', pattern: /Fedora/, versionPattern: /Fedora/ },
];

// Windows version mapping
const WINDOWS_VERSIONS: Record<string, string> = {
  '10.0': '10/11',
  '6.3': '8.1',
  '6.2': '8',
  '6.1': '7',
  '6.0': 'Vista',
  '5.1': 'XP',
  '5.0': '2000',
};

// Mobile device patterns
const MOBILE_PATTERNS = /iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini|Mobile Safari/i;
const TABLET_PATTERNS = /iPad|Android(?!.*Mobile)|Tablet|PlayBook|Silk/i;
const BOT_PATTERNS = /bot|crawl|spider|slurp|googlebot|bingbot|yandex|baidu|duckduckbot/i;

/**
 * Parse a user agent string to extract device, browser, and OS information
 */
export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  if (!userAgent) {
    return {
      deviceType: 'unknown',
      browserName: null,
      browserVersion: null,
      osName: null,
      osVersion: null,
      isMobile: false,
      isTablet: false,
      isDesktop: false,
      isBot: false,
    };
  }

  const ua = userAgent;

  // Detect bot
  const isBot = BOT_PATTERNS.test(ua);

  // Detect device type
  const isMobile = MOBILE_PATTERNS.test(ua);
  const isTablet = TABLET_PATTERNS.test(ua);
  const isDesktop = !isMobile && !isTablet && !isBot;

  let deviceType: ParsedUserAgent['deviceType'] = 'unknown';
  if (isMobile) deviceType = 'mobile';
  else if (isTablet) deviceType = 'tablet';
  else if (isDesktop) deviceType = 'desktop';

  // Detect browser
  let browserName: string | null = null;
  let browserVersion: string | null = null;

  for (const browser of BROWSERS) {
    if (browser.pattern.test(ua)) {
      browserName = browser.name;
      if (browser.versionPattern) {
        const match = ua.match(browser.versionPattern);
        if (match) {
          browserVersion = match[1] || match[2] || null;
        }
      }
      break;
    }
  }

  // Fallback browser detection for Safari (must check after Chrome)
  if (!browserName && /Safari\//.test(ua) && !/Chrome\//.test(ua)) {
    browserName = 'Safari';
    const versionMatch = ua.match(/Version\/(\d+[\.\d]*)/);
    browserVersion = versionMatch ? versionMatch[1] : null;
  }

  // Detect OS
  let osName: string | null = null;
  let osVersion: string | null = null;

  for (const os of OPERATING_SYSTEMS) {
    if (os.pattern.test(ua)) {
      osName = os.name;
      if (os.versionPattern) {
        const match = ua.match(os.versionPattern);
        if (match && match[1]) {
          osVersion = match[1].replace(/_/g, '.');
          // Map Windows NT versions to friendly names
          if (osName === 'Windows' && WINDOWS_VERSIONS[osVersion]) {
            osVersion = WINDOWS_VERSIONS[osVersion];
          }
        }
      }
      break;
    }
  }

  return {
    deviceType,
    browserName,
    browserVersion,
    osName,
    osVersion,
    isMobile,
    isTablet,
    isDesktop,
    isBot,
  };
}

/**
 * Get a human-readable device description
 */
export function getDeviceDescription(parsed: ParsedUserAgent): string {
  const parts: string[] = [];

  if (parsed.browserName) {
    parts.push(parsed.browserVersion ? `${parsed.browserName} ${parsed.browserVersion}` : parsed.browserName);
  }

  if (parsed.osName) {
    parts.push(parsed.osVersion ? `${parsed.osName} ${parsed.osVersion}` : parsed.osName);
  }

  if (parts.length === 0) {
    return 'Unknown device';
  }

  const deviceLabel = parsed.deviceType !== 'unknown' ? ` (${parsed.deviceType})` : '';
  return parts.join(' on ') + deviceLabel;
}

/**
 * Generate a simple device fingerprint from available browser data
 * Note: This is not a robust fingerprint, just for basic tracking
 */
export async function generateDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'server-side';
  }

  try {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width.toString(),
      screen.height.toString(),
      screen.colorDepth.toString(),
      new Date().getTimezoneOffset().toString(),
      (navigator.hardwareConcurrency || 0).toString(),
      // @ts-ignore - deviceMemory is not in all browsers
      (navigator.deviceMemory || 0).toString(),
      navigator.maxTouchPoints?.toString() || '0',
    ];

    const fingerprint = components.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch {
    // Fallback to simple hash
    const simple = `${navigator.userAgent}|${screen.width}|${screen.height}`;
    let hash = 0;
    for (let i = 0; i < simple.length; i++) {
      const char = simple.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}
