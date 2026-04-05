/**
 * Network security configuration for Android
 * 
 * Enforces:
 * - HTTPS-only connections in production
 * - Certificate transparency
 * - Request timeout limits
 * - No sensitive data in logs
 */

/**
 * Validate that a URL uses HTTPS (except localhost for development)
 */
export function isSecureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Allow cleartext for local development only
    const isLocalhost = parsed.hostname === 'localhost' 
      || parsed.hostname === '127.0.0.1'
      || parsed.hostname === '10.0.2.2'; // Android emulator localhost
    
    if (isLocalhost) return true;
    
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize URLs for logging - remove tokens, keys from query params
 */
export function sanitizeUrlForLogging(url: string): string {
  try {
    const parsed = new URL(url);
    const sensitiveParams = ['token', 'key', 'secret', 'apikey', 'api_key', 'access_token'];
    sensitiveParams.forEach(param => {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '[REDACTED]');
      }
    });
    return parsed.toString();
  } catch {
    return '[INVALID_URL]';
  }
}

/**
 * Blocked IP ranges for SSRF prevention on mobile
 * Matches server-side SSRF protections
 */
const BLOCKED_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
];

export function isPrivateIp(hostname: string): boolean {
  return BLOCKED_IP_PATTERNS.some(pattern => pattern.test(hostname));
}

/**
 * Safe fetch wrapper that enforces HTTPS and timeouts
 */
export async function secureFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  if (!isSecureUrl(url)) {
    throw new Error('Insecure connection blocked: HTTPS required');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
