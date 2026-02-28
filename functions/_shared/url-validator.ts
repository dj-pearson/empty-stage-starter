/**
 * URL Validation Utility
 *
 * Validates URLs to prevent SSRF (Server-Side Request Forgery) attacks.
 * Blocks private IP ranges, cloud metadata endpoints, and non-HTTP protocols.
 */

export function validateUrl(urlString: string): { valid: boolean; error?: string } {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Only allow HTTP/HTTPS
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
  }

  const hostname = url.hostname;

  // Block private IP ranges and internal hostnames
  const privatePatterns = [
    /^127\./,                      // Loopback (127.0.0.0/8)
    /^10\./,                       // Private Class A (10.0.0.0/8)
    /^172\.(1[6-9]|2\d|3[01])\./,  // Private Class B (172.16.0.0/12)
    /^192\.168\./,                 // Private Class C (192.168.0.0/16)
    /^169\.254\./,                 // Link-local / cloud metadata (169.254.0.0/16)
    /^0\./,                        // Current network (0.0.0.0/8)
    /^localhost$/i,                // Localhost hostname
    /^::1$/,                       // IPv6 loopback
    /^fd[0-9a-f]{2}:/i,           // IPv6 unique local (fd00::/8)
    /^fe80:/i,                     // IPv6 link-local (fe80::/10)
  ];

  for (const pattern of privatePatterns) {
    if (pattern.test(hostname)) {
      return { valid: false, error: 'Access to private/internal networks is not allowed' };
    }
  }

  return { valid: true };
}
