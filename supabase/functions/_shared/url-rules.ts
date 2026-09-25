/**
 * The static half of the SSRF guards in url-validator.ts: scheme, embedded
 * credentials, and hosts that are private, loopback, link-local or a cloud
 * metadata service.
 *
 * Split out so code that must also type-check in the web project (the vitest
 * mirrors under src/lib) can use the same rules. Nothing here names a Deno
 * global; the DNS check and the guarded fetch stay in url-validator.ts, which
 * re-exports everything below.
 */

/**
 * Private, loopback, link-local and obfuscated-loopback hosts.
 *
 * The hex and decimal forms matter: `http://0x7f000001/` and
 * `http://2130706433/` both reach 127.0.0.1 and both survive a naive
 * "does it start with 127." check.
 */
const PRIVATE_PATTERNS = [
  /^127\./, // loopback 127.0.0.0/8
  /^10\./, // private 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // private 172.16.0.0/12
  /^192\.168\./, // private 192.168.0.0/16
  /^169\.254\./, // link-local, incl. the 169.254.169.254 metadata service
  /^0\./, // 0.0.0.0/8
  /^localhost$/i,
  /^::1$/,
  /^\[::1\]$/,
  /^fd[0-9a-f]{2}:/i, // IPv6 unique local fd00::/8
  /^fe80:/i, // IPv6 link-local fe80::/10
  /^0x7f/i, // hex-encoded 127.x
  /^2130706/, // decimal-encoded 127.0.0.1
];

/** Hostnames that name a metadata service directly rather than by IP. */
const METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.goog',
]);

export function isPrivateHost(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '');
  if (METADATA_HOSTS.has(host.toLowerCase())) return true;
  return PRIVATE_PATTERNS.some((p) => p.test(host)) || PRIVATE_PATTERNS.some((p) => p.test(bare));
}

export interface UrlCheck {
  valid: boolean;
  error?: string;
}

/**
 * Static checks on a URL: scheme and the literal host.
 *
 * `httpsOnly` is on for recipe fetching. Plain http to a public host is not
 * itself an SSRF, but it is never needed to import a recipe and it is one more
 * way to reach a service that only listens on 80.
 */
export function validateUrl(urlString: string, httpsOnly = true): UrlCheck {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  const allowed = httpsOnly ? ['https:'] : ['http:', 'https:'];
  if (!allowed.includes(url.protocol)) {
    return {
      valid: false,
      error: httpsOnly ? 'Only https URLs are allowed' : 'Only http and https URLs are allowed',
    };
  }

  if (url.username || url.password) {
    return { valid: false, error: 'Credentials in the URL are not allowed' };
  }

  if (isPrivateHost(url.hostname)) {
    return { valid: false, error: 'Access to private or internal addresses is not allowed' };
  }

  return { valid: true };
}

