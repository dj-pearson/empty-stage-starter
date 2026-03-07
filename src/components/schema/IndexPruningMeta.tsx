/**
 * IndexPruningMeta - Strategic index management for quality signals
 *
 * Implements index pruning strategy to ensure only high-quality pages
 * are indexed. Low-quality, thin, or auto-generated pages should be
 * noindexed to preserve domain quality signals.
 *
 * Key principles:
 * - Noindex thin/auto-generated pages
 * - Noindex faceted navigation / filter pages
 * - Noindex paginated archive pages (except page 1)
 * - Noindex internal search results pages
 * - Use canonical URLs for duplicate content
 * - Block via robots.txt for pages that shouldn't even be crawled
 *
 * Usage:
 * ```tsx
 * // On a thin or auto-generated page
 * <IndexPruningMeta noindex reason="thin-content" />
 *
 * // On a paginated page (page 2+)
 * <IndexPruningMeta noindex reason="pagination" page={3} />
 *
 * // On a faceted navigation page
 * <IndexPruningMeta noindex reason="faceted-navigation" />
 *
 * // On a page with canonical pointing elsewhere
 * <IndexPruningMeta canonicalUrl="https://tryeatpal.com/original-page" />
 * ```
 */

import { Helmet } from "react-helmet-async";

export type NoindexReason =
  | "thin-content"
  | "auto-generated"
  | "faceted-navigation"
  | "pagination"
  | "internal-search"
  | "duplicate"
  | "staging"
  | "expired";

export interface IndexPruningMetaProps {
  noindex?: boolean;
  nofollow?: boolean;
  reason?: NoindexReason;
  canonicalUrl?: string;
  page?: number;
  unavailableAfter?: string;
}

/**
 * Pages that should always be noindexed based on URL patterns.
 * Used as a safety net in addition to per-page configuration.
 */
export const NOINDEX_PATTERNS: string[] = [
  "/dashboard",
  "/admin",
  "/auth",
  "/api/",
  "/search?",
  "/settings",
  "/checkout",
  "/seo-dashboard",
  "/search-traffic",
  "/oauth",
];

/**
 * Check if a URL should be noindexed based on patterns
 */
export function shouldNoindex(url: string): boolean {
  return NOINDEX_PATTERNS.some(
    (pattern) =>
      url.includes(pattern) ||
      url.endsWith(pattern),
  );
}

export function IndexPruningMeta({
  noindex = false,
  nofollow = false,
  reason,
  canonicalUrl,
  page,
  unavailableAfter,
}: IndexPruningMetaProps) {
  const directives: string[] = [];

  if (noindex) {
    directives.push("noindex");
  } else {
    directives.push("index");
  }

  if (nofollow) {
    directives.push("nofollow");
  } else {
    directives.push("follow");
  }

  // Add max-snippet and max-image-preview for indexed pages
  if (!noindex) {
    directives.push("max-snippet:-1");
    directives.push("max-image-preview:large");
    directives.push("max-video-preview:-1");
  }

  const robotsContent = directives.join(", ");

  return (
    <Helmet>
      <meta name="robots" content={robotsContent} />
      <meta name="googlebot" content={robotsContent} />

      {/* Canonical URL for duplicate content management */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Pagination hints */}
      {page && page > 1 && (
        <meta name="robots" content="noindex, follow" />
      )}

      {/* Time-limited availability */}
      {unavailableAfter && (
        <meta
          name="googlebot"
          content={`unavailable_after: ${unavailableAfter}`}
        />
      )}

      {/* Debug: reason for noindex (hidden comment for developers) */}
      {noindex && reason && (
        <meta name="pruning-reason" content={reason} />
      )}
    </Helmet>
  );
}
