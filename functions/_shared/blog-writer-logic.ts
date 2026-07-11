/**
 * Pure helpers for the blog writer agent (US-503).
 * DB-free so slugging and reading-time are unit-testable.
 */

/** URL-safe slug from a title (base slug; the caller adds a uniqueness suffix). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Append a short uniqueness suffix (e.g. from the calendar id) to a base slug. */
export function slugWithSuffix(baseSlug: string, suffixSource: string): string {
  const suffix = suffixSource.replace(/-/g, '').slice(0, 6);
  return `${baseSlug || 'post'}-${suffix}`;
}

/** Reading time in minutes from HTML/text (~200 wpm, min 1). */
export function readingTimeMinutes(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
