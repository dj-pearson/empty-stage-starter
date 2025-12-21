/**
 * URL and Query String Utilities
 *
 * Helper functions for URL manipulation, query string parsing, and deep linking.
 */

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

/**
 * Parse query string to object
 *
 * Usage:
 * ```tsx
 * parseQueryString('?foo=bar&baz=qux'); // { foo: 'bar', baz: 'qux' }
 * parseQueryString('?tags=js&tags=react'); // { tags: ['js', 'react'] }
 * ```
 */
export function parseQueryString(queryString: string): QueryParams {
  const params: QueryParams = {};

  // Remove leading '?' if present
  const cleanQuery = queryString.startsWith('?') ? queryString.slice(1) : queryString;

  if (!cleanQuery) return params;

  const pairs = cleanQuery.split('&');

  for (const pair of pairs) {
    const [key, value] = pair.split('=').map(decodeURIComponent);

    if (!key) continue;

    // Handle array parameters (same key multiple times)
    if (params[key]) {
      if (Array.isArray(params[key])) {
        (params[key] as QueryValue[]).push(value || '');
      } else {
        params[key] = [params[key] as QueryValue, value || ''];
      }
    } else {
      params[key] = value || '';
    }
  }

  return params;
}

/**
 * Build query string from object
 *
 * Usage:
 * ```tsx
 * buildQueryString({ foo: 'bar', baz: 'qux' }); // 'foo=bar&baz=qux'
 * buildQueryString({ tags: ['js', 'react'] }); // 'tags=js&tags=react'
 * ```
 */
export function buildQueryString(params: QueryParams): string {
  const pairs: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined) {
          pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
        }
      }
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return pairs.join('&');
}

/**
 * Get query parameter from URL
 *
 * Usage:
 * ```tsx
 * getQueryParam('id'); // Get 'id' from current URL
 * getQueryParam('id', 'https://example.com?id=123'); // Get from specific URL
 * ```
 */
export function getQueryParam(key: string, url?: string): string | null {
  const queryString = url ? new URL(url).search : window.location.search;
  const params = parseQueryString(queryString);
  const value = params[key];

  if (Array.isArray(value)) {
    return value[0] as string;
  }

  return value ? String(value) : null;
}

/**
 * Get all query parameters from URL
 */
export function getQueryParams(url?: string): QueryParams {
  const queryString = url ? new URL(url).search : window.location.search;
  return parseQueryString(queryString);
}

/**
 * Add query parameter to URL
 *
 * Usage:
 * ```tsx
 * addQueryParam('/path', 'foo', 'bar'); // '/path?foo=bar'
 * addQueryParam('/path?existing=true', 'foo', 'bar'); // '/path?existing=true&foo=bar'
 * ```
 */
export function addQueryParam(url: string, key: string, value: QueryValue): string {
  const [path, queryString] = url.split('?');
  const params = parseQueryString(queryString || '');
  params[key] = value;

  const newQuery = buildQueryString(params);
  return newQuery ? `${path}?${newQuery}` : path;
}

/**
 * Add multiple query parameters to URL
 */
export function addQueryParams(url: string, params: QueryParams): string {
  const [path, queryString] = url.split('?');
  const existingParams = parseQueryString(queryString || '');
  const mergedParams = { ...existingParams, ...params };

  const newQuery = buildQueryString(mergedParams);
  return newQuery ? `${path}?${newQuery}` : path;
}

/**
 * Remove query parameter from URL
 */
export function removeQueryParam(url: string, key: string): string {
  const [path, queryString] = url.split('?');
  const params = parseQueryString(queryString || '');
  delete params[key];

  const newQuery = buildQueryString(params);
  return newQuery ? `${path}?${newQuery}` : path;
}

/**
 * Remove multiple query parameters from URL
 */
export function removeQueryParams(url: string, keys: string[]): string {
  const [path, queryString] = url.split('?');
  const params = parseQueryString(queryString || '');

  for (const key of keys) {
    delete params[key];
  }

  const newQuery = buildQueryString(params);
  return newQuery ? `${path}?${newQuery}` : path;
}

/**
 * Update current URL query parameters without reload
 */
export function updateQueryParams(params: QueryParams, replace: boolean = false): void {
  if (typeof window === 'undefined') return;

  const currentParams = getQueryParams();
  const mergedParams = { ...currentParams, ...params };
  const newQuery = buildQueryString(mergedParams);
  const newUrl = `${window.location.pathname}${newQuery ? '?' + newQuery : ''}`;

  if (replace) {
    window.history.replaceState({}, '', newUrl);
  } else {
    window.history.pushState({}, '', newUrl);
  }
}

/**
 * Parse URL into components
 *
 * Usage:
 * ```tsx
 * parseUrl('https://example.com:8080/path?foo=bar#section');
 * // {
 * //   protocol: 'https:',
 * //   hostname: 'example.com',
 * //   port: '8080',
 * //   pathname: '/path',
 * //   search: '?foo=bar',
 * //   hash: '#section',
 * //   origin: 'https://example.com:8080',
 * //   href: 'https://example.com:8080/path?foo=bar#section'
 * // }
 * ```
 */
export function parseUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      origin: parsed.origin,
      href: parsed.href,
      params: parseQueryString(parsed.search),
    };
  } catch {
    return null;
  }
}

/**
 * Build URL from components
 */
export function buildUrl(components: {
  protocol?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  params?: QueryParams;
}): string {
  const {
    protocol = 'https:',
    hostname = '',
    port = '',
    pathname = '/',
    search = '',
    hash = '',
    params = {},
  } = components;

  if (!hostname) return pathname;

  let url = `${protocol}//${hostname}`;

  if (port) {
    url += `:${port}`;
  }

  url += pathname;

  const queryString = params && Object.keys(params).length > 0 ? buildQueryString(params) : search;

  if (queryString) {
    url += queryString.startsWith('?') ? queryString : `?${queryString}`;
  }

  if (hash) {
    url += hash.startsWith('#') ? hash : `#${hash}`;
  }

  return url;
}

/**
 * Check if URL is absolute
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

/**
 * Check if URL is relative
 */
export function isRelativeUrl(url: string): boolean {
  return !isAbsoluteUrl(url);
}

/**
 * Check if URL is external (different domain)
 */
export function isExternalUrl(url: string, baseUrl?: string): boolean {
  if (!isAbsoluteUrl(url)) return false;

  try {
    const urlObj = new URL(url);
    const baseUrlObj = baseUrl ? new URL(baseUrl) : new URL(window.location.href);
    return urlObj.hostname !== baseUrlObj.hostname;
  } catch {
    return false;
  }
}

/**
 * Join URL paths
 *
 * Usage:
 * ```tsx
 * joinPaths('/api', 'users', '123'); // '/api/users/123'
 * joinPaths('/api/', '/users/', '/123'); // '/api/users/123'
 * ```
 */
export function joinPaths(...paths: string[]): string {
  return paths
    .map((path, index) => {
      // Remove leading slash except for first path
      if (index > 0 && path.startsWith('/')) {
        path = path.slice(1);
      }
      // Remove trailing slash
      if (path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      return path;
    })
    .filter(Boolean)
    .join('/');
}

/**
 * Normalize URL (remove trailing slash, etc.)
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove trailing slash from pathname
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Sort query parameters alphabetically
    const params = new URLSearchParams(parsed.search);
    params.sort();
    
    let result = `${parsed.origin}${parsed.pathname}`;
    const search = params.toString();
    if (search) {
      result += `?${search}`;
    }
    result += parsed.hash;

    return result;
  } catch {
    return url;
  }
}

/**
 * Get domain from URL
 */
export function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Get root domain (TLD + domain)
 *
 * Usage:
 * ```tsx
 * getRootDomain('https://blog.example.com'); // 'example.com'
 * ```
 */
export function getRootDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');

    if (parts.length <= 2) {
      return hostname;
    }

    // Handle country-specific TLDs (e.g., .co.uk)
    const twoPartTlds = ['co.uk', 'com.au', 'co.nz', 'co.za'];
    const lastTwo = parts.slice(-2).join('.');

    if (twoPartTlds.includes(lastTwo)) {
      return parts.slice(-3).join('.');
    }

    return parts.slice(-2).join('.');
  } catch {
    return '';
  }
}

/**
 * Get subdomain from URL
 */
export function getSubdomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    const rootDomain = getRootDomain(url);
    const subdomain = hostname.replace(`.${rootDomain}`, '');

    return subdomain !== hostname ? subdomain : null;
  } catch {
    return null;
  }
}

/**
 * Check if URL is valid
 */
export function isValidUrl(url: string): boolean {
  try {
    const newUrl = new URL(url);
    return newUrl.protocol === 'http:' || newUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize URL (remove potentially harmful parts)
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    return parsed.href;
  } catch {
    return '';
  }
}

/**
 * Get URL hash without '#'
 */
export function getHash(url?: string): string {
  const hash = url ? new URL(url).hash : window.location.hash;
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

/**
 * Set URL hash without reload
 */
export function setHash(hash: string, replace: boolean = false): void {
  if (typeof window === 'undefined') return;

  const newHash = hash.startsWith('#') ? hash : `#${hash}`;

  if (replace) {
    window.history.replaceState({}, '', newHash);
  } else {
    window.history.pushState({}, '', newHash);
  }
}

/**
 * Remove URL hash
 */
export function removeHash(replace: boolean = false): void {
  if (typeof window === 'undefined') return;

  const url = window.location.pathname + window.location.search;

  if (replace) {
    window.history.replaceState({}, '', url);
  } else {
    window.history.pushState({}, '', url);
  }
}

/**
 * Create deep link
 *
 * Usage:
 * ```tsx
 * createDeepLink('myapp', '/profile', { id: '123' });
 * // 'myapp://profile?id=123'
 * ```
 */
export function createDeepLink(scheme: string, path: string, params?: QueryParams): string {
  const queryString = params ? buildQueryString(params) : '';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  return `${scheme}://${cleanPath}${queryString ? '?' + queryString : ''}`;
}

/**
 * Parse deep link
 */
export function parseDeepLink(deepLink: string) {
  try {
    const match = deepLink.match(/^([^:]+):\/\/([^?#]+)(\?[^#]*)?(#.*)?$/);
    if (!match) return null;

    const [, scheme, path, search, hash] = match;

    return {
      scheme,
      path: `/${path}`,
      params: parseQueryString(search || ''),
      hash: hash || '',
    };
  } catch {
    return null;
  }
}

/**
 * Encode URL component safely
 */
export function encodeUrlComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

/**
 * Decode URL component safely
 */
export function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Get current URL
 */
export function getCurrentUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href;
}

/**
 * Get current path
 */
export function getCurrentPath(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname;
}

/**
 * Get current origin
 */
export function getCurrentOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

/**
 * Navigate to URL
 */
export function navigateTo(url: string): void {
  if (typeof window === 'undefined') return;
  window.location.href = url;
}

/**
 * Reload page
 */
export function reloadPage(forceReload: boolean = false): void {
  if (typeof window === 'undefined') return;
  window.location.reload();
}

/**
 * Open URL in new tab
 */
export function openInNewTab(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Copy URL to clipboard
 */
export async function copyUrlToClipboard(url?: string): Promise<void> {
  const urlToCopy = url || getCurrentUrl();

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(urlToCopy);
  } else {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = urlToCopy;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

/**
 * Share URL using Web Share API
 */
export async function shareUrl(
  url: string,
  title?: string,
  text?: string
): Promise<void> {
  if (!navigator.share) {
    throw new Error('Web Share API not supported');
  }

  await navigator.share({
    url,
    title,
    text,
  });
}

/**
 * Create shareable URL for social media
 */
export function createSocialShareUrl(
  platform: 'facebook' | 'twitter' | 'linkedin' | 'whatsapp' | 'telegram' | 'email',
  url: string,
  text?: string
): string {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = text ? encodeURIComponent(text) : '';

  const shareUrls: Record<string, string> = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    email: `mailto:?subject=${encodedText}&body=${encodedUrl}`,
  };

  return shareUrls[platform] || '';
}

/**
 * Create QR code URL for a URL (using external service)
 */
export function createQRCodeUrl(url: string, size: number = 200): string {
  const encodedUrl = encodeURIComponent(url);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedUrl}`;
}

/**
 * Shorten URL using external service
 *
 * Requires API key configuration:
 * - Bitly: Set VITE_BITLY_API_KEY environment variable
 * - TinyURL: No API key required for basic usage
 *
 * @throws Error if service is not configured
 */
export async function shortenUrl(url: string, service: 'bitly' | 'tinyurl' = 'tinyurl'): Promise<string> {
  if (service === 'bitly') {
    const apiKey = import.meta.env.VITE_BITLY_API_KEY;
    if (!apiKey) {
      throw new Error('Bitly API key not configured. Set VITE_BITLY_API_KEY environment variable.');
    }

    const response = await fetch('https://api-ssl.bitly.com/v4/shorten', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ long_url: url }),
    });

    if (!response.ok) {
      throw new Error(`Bitly API error: ${response.status}`);
    }

    const data = await response.json();
    return data.link;
  }

  if (service === 'tinyurl') {
    // TinyURL has a simple API that doesn't require authentication
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);

    if (!response.ok) {
      throw new Error(`TinyURL API error: ${response.status}`);
    }

    return await response.text();
  }

  throw new Error(`Unknown URL shortening service: ${service}`);
}

/**
 * Track UTM parameters
 */
export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  [key: string]: string | undefined;
}

/**
 * Add UTM parameters to URL
 */
export function addUTMParams(url: string, utmParams: UTMParams): string {
  return addQueryParams(url, utmParams);
}

/**
 * Get UTM parameters from current URL
 */
export function getUTMParams(): UTMParams {
  const params = getQueryParams();
  return {
    utm_source: params.utm_source as string | undefined,
    utm_medium: params.utm_medium as string | undefined,
    utm_campaign: params.utm_campaign as string | undefined,
    utm_term: params.utm_term as string | undefined,
    utm_content: params.utm_content as string | undefined,
  };
}

/**
 * Remove UTM parameters from URL
 */
export function removeUTMParams(url: string): string {
  return removeQueryParams(url, [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
  ]);
}
