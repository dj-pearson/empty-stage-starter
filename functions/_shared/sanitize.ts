/**
 * Input Sanitization Middleware
 *
 * Provides centralized sanitization utilities for all edge functions
 * to protect against SQL injection, XSS, and command injection attacks.
 */

// ---------------------------------------------------------------------------
// SQL Injection
// ---------------------------------------------------------------------------

const SQL_KEYWORDS = [
  'UNION',
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'EXEC',
  'EXECUTE',
  'XP_',
  'CHAR\\s*\\(',
  'CONCAT\\s*\\(',
  '0x[0-9a-fA-F]+',
];

const SQL_PATTERNS: RegExp[] = [
  // Keyword-based patterns (word-boundary aware, case insensitive)
  new RegExp(`\\b(${SQL_KEYWORDS.join('|')})\\b`, 'gi'),
  // Tautologies commonly used for auth bypass
  /\bOR\s+1\s*=\s*1\b/gi,
  /\bAND\s+1\s*=\s*1\b/gi,
  /\bOR\s+'[^']*'\s*=\s*'[^']*'/gi,
  /\bAND\s+'[^']*'\s*=\s*'[^']*'/gi,
  // Comment sequences
  /--/g,
  /\/\*/g,
  /\*\//g,
];

/**
 * Returns `true` when the input string contains patterns commonly associated
 * with SQL injection. Useful for early rejection with a 400 response.
 */
export function isSQLInjection(input: string): boolean {
  return SQL_PATTERNS.some((pattern) => {
    // Reset lastIndex so global regexps work across repeated calls
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}

/**
 * Strips known SQL injection patterns from a string, returning a cleaned
 * version that is safer to embed in queries. **Parameterized queries should
 * still be used as the primary defense.**
 */
export function sanitizeSQL(input: string): string {
  let result = input;
  for (const pattern of SQL_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, '');
  }
  // Collapse extra whitespace introduced by removals
  return result.replace(/\s{2,}/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// HTML / XSS
// ---------------------------------------------------------------------------

const XSS_PATTERNS: RegExp[] = [
  // Script tags (opening and closing)
  /<\s*script\b[^>]*>/gi,
  /<\s*\/\s*script\s*>/gi,
  // Event handler attributes
  /\bon(error|load|click|mouseover|mouseout|mouseenter|mouseleave|focus|blur|keydown|keyup|keypress|submit|change|input|abort|dblclick|contextmenu|drag|dragend|dragenter|dragleave|dragover|dragstart|drop)\s*=/gi,
  // Dangerous URI schemes
  /javascript\s*:/gi,
  /data\s*:\s*text\/html/gi,
  // Dangerous JS functions / properties
  /\beval\s*\(/gi,
  /\bdocument\s*\.\s*cookie\b/gi,
  /\binnerHTML\s*=/gi,
];

/**
 * Returns `true` when the input string contains patterns commonly associated
 * with cross-site scripting (XSS).
 */
export function isXSSAttempt(input: string): boolean {
  return XSS_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}

/**
 * Strips HTML tags, event handlers, and other XSS vectors from a string.
 */
export function sanitizeHTML(input: string): string {
  let result = input;
  for (const pattern of XSS_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, '');
  }
  // Strip any remaining HTML tags as a safety net
  result = result.replace(/<\/?[^>]+(>|$)/g, '');
  return result.trim();
}

// ---------------------------------------------------------------------------
// Command Injection
// ---------------------------------------------------------------------------

const COMMAND_INJECTION_CHARS: Array<[RegExp, string]> = [
  [/;/g, '\\;'],
  [/\|/g, '\\|'],
  [/&&/g, '\\&\\&'],
  [/\|\|/g, '\\|\\|'],
  [/\$\(/g, '\\$\\('],
  [/`/g, '\\`'],
  [/\$\{/g, '\\$\\{'],
];

/**
 * Escapes shell meta-characters that could be used for command injection.
 */
export function sanitizeCommand(input: string): string {
  let result = input;
  for (const [pattern, replacement] of COMMAND_INJECTION_CHARS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Recursive Input Sanitizer
// ---------------------------------------------------------------------------

/**
 * Recursively walks an object, array, or primitive value and applies all
 * string sanitizers (SQL, HTML, command) to every string leaf. Non-string
 * primitives are returned as-is.
 *
 * @example
 * ```ts
 * const body = await req.json();
 * const clean = sanitizeInput(body);
 * ```
 */
export function sanitizeInput(input: unknown): unknown {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    let sanitized = input;
    sanitized = sanitizeSQL(sanitized);
    sanitized = sanitizeHTML(sanitized);
    sanitized = sanitizeCommand(sanitized);
    return sanitized;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeInput(item));
  }

  if (typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  // Numbers, booleans, etc. pass through unchanged
  return input;
}
