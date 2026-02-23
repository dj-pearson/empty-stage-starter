/**
 * CSRF Protection Module
 *
 * Generates and validates CSRF tokens stored in sessionStorage
 * with SameSite=Strict cookie semantics.
 */

const CSRF_STORAGE_KEY = 'eatpal_csrf_token';
const CSRF_HEADER = 'x-csrf-token';

/**
 * Generate a cryptographically random CSRF token.
 */
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the current CSRF token, creating one if it doesn't exist.
 */
export function getCsrfToken(): string {
  let token = sessionStorage.getItem(CSRF_STORAGE_KEY);
  if (!token) {
    token = generateToken();
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  }
  return token;
}

/**
 * Validate a CSRF token against the stored one.
 */
export function validateCsrfToken(token: string): boolean {
  const storedToken = sessionStorage.getItem(CSRF_STORAGE_KEY);
  if (!storedToken || !token) return false;

  // Constant-time comparison to prevent timing attacks
  if (storedToken.length !== token.length) return false;

  let result = 0;
  for (let i = 0; i < storedToken.length; i++) {
    result |= storedToken.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Regenerate the CSRF token (e.g., after login).
 */
export function regenerateCsrfToken(): string {
  const token = generateToken();
  sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  return token;
}

/**
 * Get headers object with the CSRF token included.
 * Useful for adding to fetch() or Supabase client requests.
 */
export function getCsrfHeaders(): Record<string, string> {
  return { [CSRF_HEADER]: getCsrfToken() };
}

/**
 * The header name used for CSRF tokens.
 */
export { CSRF_HEADER };
