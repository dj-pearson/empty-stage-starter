/**
 * String Manipulation Utilities
 *
 * Helper functions for string formatting, transformation, and validation.
 */

/**
 * Truncate string to specified length
 *
 * Usage:
 * ```tsx
 * truncate('This is a long string', 10); // "This is a..."
 * truncate('Short', 10); // "Short"
 * ```
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Truncate string to word boundary
 */
export function truncateWords(str: string, maxWords: number, suffix: string = '...'): string {
  const words = str.split(/\s+/);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(' ') + suffix;
}

/**
 * Capitalize first letter of string
 */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Capitalize first letter of each word
 */
export function titleCase(str: string): string {
  return str
    .split(' ')
    .map((word) => capitalize(word))
    .join(' ');
}

/**
 * Convert string to camelCase
 */
export function camelCase(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
      index === 0 ? letter.toLowerCase() : letter.toUpperCase()
    )
    .replace(/\s+/g, '');
}

/**
 * Convert string to snake_case
 */
export function snakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/^_/, '');
}

/**
 * Convert string to kebab-case
 */
export function kebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^-/, '');
}

/**
 * Pluralize word based on count
 *
 * Usage:
 * ```tsx
 * pluralize('item', 1); // "item"
 * pluralize('item', 2); // "items"
 * pluralize('child', 2, 'children'); // "children"
 * ```
 */
export function pluralize(singular: string, count: number, plural?: string): string {
  if (count === 1) return singular;

  if (plural) return plural;

  // Simple pluralization rules
  if (singular.endsWith('y')) {
    return singular.slice(0, -1) + 'ies';
  }

  if (
    singular.endsWith('s') ||
    singular.endsWith('x') ||
    singular.endsWith('z') ||
    singular.endsWith('ch') ||
    singular.endsWith('sh')
  ) {
    return singular + 'es';
  }

  return singular + 's';
}

/**
 * Format number with word
 *
 * Usage:
 * ```tsx
 * formatCount(1, 'item'); // "1 item"
 * formatCount(5, 'item'); // "5 items"
 * ```
 */
export function formatCount(count: number, word: string, plural?: string): string {
  return `${count} ${pluralize(word, count, plural)}`;
}

/**
 * Remove HTML tags from string
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML entities
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Unescape HTML entities
 */
export function unescapeHtml(html: string): string {
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
  };

  return html.replace(/&(amp|lt|gt|quot|#039);/g, (entity) => map[entity]);
}

/**
 * Extract initials from name
 *
 * Usage:
 * ```tsx
 * getInitials('John Doe'); // "JD"
 * getInitials('Mary Jane Watson'); // "MJ"
 * ```
 */
export function getInitials(name: string, maxInitials: number = 2): string {
  const words = name.trim().split(/\s+/);
  const initials = words.map((word) => word.charAt(0).toUpperCase());
  return initials.slice(0, maxInitials).join('');
}

/**
 * Generate random string
 */
export function randomString(length: number, chars: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Mask string (e.g., for credit cards, SSN)
 *
 * Usage:
 * ```tsx
 * maskString('1234567890', 4); // "******7890"
 * maskString('secret@email.com', 6, '@'); // "******@email.com"
 * ```
 */
export function maskString(
  str: string,
  visibleChars: number = 4,
  preserveAfter?: string,
  maskChar: string = '*'
): string {
  if (!str) return str;

  if (preserveAfter) {
    const index = str.indexOf(preserveAfter);
    if (index !== -1) {
      const beforeChar = str.slice(0, index);
      const afterChar = str.slice(index);
      return maskChar.repeat(beforeChar.length) + afterChar;
    }
  }

  if (str.length <= visibleChars) return str;

  const masked = maskChar.repeat(str.length - visibleChars);
  return masked + str.slice(-visibleChars);
}

/**
 * Highlight search term in text
 *
 * Usage:
 * ```tsx
 * highlight('Hello World', 'world'); // "Hello <mark>World</mark>"
 * ```
 */
export function highlight(text: string, searchTerm: string, tag: string = 'mark'): string {
  if (!searchTerm) return text;

  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, `<${tag}>$1</${tag}>`);
}

/**
 * Count words in text
 */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Count characters (excluding spaces)
 */
export function charCount(text: string, includeSpaces: boolean = false): number {
  if (includeSpaces) return text.length;
  return text.replace(/\s/g, '').length;
}

/**
 * Reverse string
 */
export function reverse(str: string): string {
  return str.split('').reverse().join('');
}

/**
 * Check if string is palindrome
 */
export function isPalindrome(str: string): boolean {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned === reverse(cleaned);
}

/**
 * Repeat string n times
 */
export function repeat(str: string, count: number): string {
  return str.repeat(count);
}

/**
 * Pad string to specified length
 */
export function pad(
  str: string,
  length: number,
  char: string = ' ',
  direction: 'left' | 'right' | 'both' = 'right'
): string {
  if (str.length >= length) return str;

  const padLength = length - str.length;

  if (direction === 'left') {
    return char.repeat(padLength) + str;
  }

  if (direction === 'right') {
    return str + char.repeat(padLength);
  }

  // both
  const leftPad = Math.floor(padLength / 2);
  const rightPad = padLength - leftPad;
  return char.repeat(leftPad) + str + char.repeat(rightPad);
}

/**
 * Extract domain from URL or email
 */
export function extractDomain(urlOrEmail: string): string {
  // Email
  if (urlOrEmail.includes('@')) {
    return urlOrEmail.split('@')[1];
  }

  // URL
  try {
    const url = new URL(urlOrEmail);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return urlOrEmail;
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Format large numbers with abbreviations
 *
 * Usage:
 * ```tsx
 * formatNumber(1234); // "1.2K"
 * formatNumber(1234567); // "1.2M"
 * ```
 */
export function formatNumber(num: number, decimals: number = 1): string {
  if (num < 1000) return num.toString();

  const units = ['K', 'M', 'B', 'T'];
  const order = Math.floor(Math.log10(Math.abs(num)) / 3);
  const unitIndex = order - 1;

  if (unitIndex >= units.length) {
    return num.toExponential(decimals);
  }

  const scaled = num / Math.pow(1000, order);
  return scaled.toFixed(decimals) + units[unitIndex];
}

/**
 * Clean whitespace (trim, remove multiple spaces)
 */
export function cleanWhitespace(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Remove accents/diacritics from string
 */
export function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Check if string contains only digits
 */
export function isNumeric(str: string): boolean {
  return /^\d+$/.test(str);
}

/**
 * Check if string is valid email (basic check)
 */
export function isEmail(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

/**
 * Check if string is valid URL
 */
export function isURL(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Levenshtein distance (string similarity)
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate string similarity percentage
 */
export function similarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return ((maxLength - distance) / maxLength) * 100;
}
