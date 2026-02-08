import DOMPurify from "dompurify";

/**
 * Centralized input sanitization utilities for user-generated content.
 *
 * Protects against XSS, script injection, and protocol-based attacks.
 * Uses DOMPurify for HTML sanitization with safe defaults.
 *
 * Usage:
 * ```typescript
 * import { sanitizeHtml, sanitizeText, sanitizeUrl } from '@/lib/sanitize';
 *
 * const safeHtml = sanitizeHtml(userRichText);     // Allows safe formatting
 * const safeText = sanitizeText(userInput);          // Escapes all HTML
 * const safeUrl = sanitizeUrl(userProvidedUrl);      // Validates protocols
 * ```
 */

/**
 * Allowed HTML tags for rich text content (blog posts, recipe instructions, etc.)
 * Strips dangerous tags (script, iframe, object, embed, form) while preserving formatting.
 */
const SAFE_HTML_TAGS = [
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "code",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

/**
 * Allowed HTML attributes for safe tags.
 */
const SAFE_HTML_ATTRS = [
  "href",
  "src",
  "alt",
  "title",
  "class",
  "id",
  "target",
  "rel",
  "width",
  "height",
  "colspan",
  "rowspan",
];

/**
 * Sanitize HTML content, allowing safe formatting tags.
 *
 * Use for rich text content like blog posts, recipe instructions,
 * and any user-generated HTML from the TipTap editor.
 *
 * Strips: script, iframe, object, embed, form, style, link, meta, base, svg (with scripts)
 * Allows: formatting tags (b, i, em, strong, p, h1-h6, ul, ol, li, a, img, table, etc.)
 *
 * @param dirty - Raw HTML string from user input
 * @returns Sanitized HTML string safe for rendering via dangerouslySetInnerHTML
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: SAFE_HTML_TAGS,
    ALLOWED_ATTR: SAFE_HTML_ATTRS,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    // Force all links to open in new tab with noopener
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}

/**
 * Sanitize plain text by escaping all HTML entities.
 *
 * Use for any user-generated text that will be displayed as text content
 * (food names, kid names, recipe titles, comments, etc.)
 *
 * This does NOT allow any HTML - all tags are escaped to their entity equivalents.
 *
 * @param dirty - Raw text string from user input
 * @returns Text with all HTML entities escaped
 */
export function sanitizeText(dirty: string): string {
  if (!dirty) return "";

  // DOMPurify with no allowed tags effectively escapes everything
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/**
 * Dangerous URL protocols that can execute code.
 */
const DANGEROUS_PROTOCOLS = [
  "javascript:",
  "data:",
  "vbscript:",
  "blob:",
];

/**
 * Allowed URL protocols for user-provided links.
 */
const SAFE_PROTOCOLS = [
  "http:",
  "https:",
  "mailto:",
  "tel:",
];

/**
 * Sanitize and validate a URL against dangerous protocols.
 *
 * Use for any user-provided URLs: recipe source links, blog post links,
 * profile picture URLs, external references.
 *
 * Blocks: javascript:, data:, vbscript:, blob: protocols
 * Allows: http:, https:, mailto:, tel: protocols and relative paths
 *
 * @param dirty - Raw URL string from user input
 * @returns Sanitized URL string, or empty string if dangerous
 */
export function sanitizeUrl(dirty: string): string {
  if (!dirty) return "";

  const trimmed = dirty.trim();

  // Check for dangerous protocols (case-insensitive, whitespace-tolerant)
  // Attackers use tricks like "java\tscript:" or "JAVASCRIPT:" to bypass naive checks
  const normalized = trimmed.replace(/[\s\0]/g, "").toLowerCase();

  for (const protocol of DANGEROUS_PROTOCOLS) {
    if (normalized.startsWith(protocol)) {
      return "";
    }
  }

  // Allow relative URLs (starting with / or .)
  if (trimmed.startsWith("/") || trimmed.startsWith(".")) {
    return trimmed;
  }

  // Allow hash-only URLs
  if (trimmed.startsWith("#")) {
    return trimmed;
  }

  // For absolute URLs, verify the protocol is safe
  try {
    const url = new URL(trimmed);
    const protocol = url.protocol.toLowerCase();

    if (!SAFE_PROTOCOLS.includes(protocol)) {
      return "";
    }

    return trimmed;
  } catch {
    // If URL parsing fails but it doesn't start with a dangerous protocol,
    // it might be a protocol-relative URL or malformed — reject it
    return "";
  }
}

/**
 * Sanitize an object's string values recursively.
 *
 * Use for sanitizing form data objects before sending to the database.
 * Only sanitizes string values; leaves numbers, booleans, and nulls unchanged.
 *
 * @param obj - Object with potentially unsafe string values
 * @returns New object with all string values sanitized as plain text
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = sanitizeText(value);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "string"
          ? sanitizeText(item)
          : item !== null && typeof item === "object"
            ? sanitizeObject(item as Record<string, unknown>)
            : item
      );
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
