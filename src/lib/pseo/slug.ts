/**
 * URL <-> `pseo_pages.slug` mapping.
 *
 * `pseo_pages.slug` stores a FULL multi-segment path that already carries its own
 * type prefix — 'food-chaining/chicken-nuggets', 'challenges/arfid/dinner',
 * 'meals/breakfast' (see SLUG_PREFIXES in ./generator.ts). The generator writes
 * canonical_url and every breadcrumb href as `/guides/<slug>`, so /guides is the
 * canonical mount point and the slug is just the pathname with that mount removed.
 */

export const GUIDES_MOUNT = '/guides';

/**
 * Extract the `pseo_pages.slug` to look up from a pathname.
 * Returns null when the path carries no slug (e.g. the bare `/guides` index).
 */
export function slugFromPathname(pathname: string): string | null {
  const withoutMount = pathname.replace(/^\/guides\/?/, '');
  const trimmed = withoutMount.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

/** Build the canonical public URL path for a stored slug. */
export function pathnameForSlug(slug: string): string {
  return `${GUIDES_MOUNT}/${slug.replace(/^\/+/, '')}`;
}
