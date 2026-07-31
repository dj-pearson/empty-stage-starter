/**
 * App store listing configuration.
 *
 * EatPal is live on the App Store and that is where its discovery currently works —
 * yet the marketing site did not link to it anywhere, and no structured data told
 * search engines the website and the App Store listing are the same product. That
 * costs two things: the conversion (visitors who want the iOS app can't find it) and
 * the entity signal (`sameAs` / `installUrl` is how Google consolidates a website and
 * an app listing into one entity, which is what surfaces app links in search).
 *
 * The numeric App Store ID is not in the repo (eas.json still holds the
 * `YOUR_APP_STORE_CONNECT_APP_ID` placeholder), so it is read from the environment.
 * Everything that depends on it degrades to "not shown" while it is unset — nothing
 * renders a broken link, and nothing invents an ID.
 *
 * To enable: set VITE_APP_STORE_APP_ID (digits only, e.g. 6479… from the listing URL
 * https://apps.apple.com/us/app/eatpal/id<APP_ID>) in the build environment.
 */

const rawAppId = import.meta.env.VITE_APP_STORE_APP_ID as string | undefined;

/** Numeric Apple App Store ID, or null when not configured. */
export const APP_STORE_APP_ID: string | null =
  rawAppId && /^\d+$/.test(rawAppId.trim()) ? rawAppId.trim() : null;

/** Canonical App Store listing URL, or null when not configured. */
export const APP_STORE_URL: string | null = APP_STORE_APP_ID
  ? `https://apps.apple.com/us/app/eatpal/id${APP_STORE_APP_ID}`
  : null;

/** Google Play listing URL, or null when not configured. */
const rawPlayId = import.meta.env.VITE_PLAY_STORE_PACKAGE as string | undefined;
export const PLAY_STORE_URL: string | null = rawPlayId?.trim()
  ? `https://play.google.com/store/apps/details?id=${rawPlayId.trim()}`
  : null;

/**
 * Store URLs suitable for schema.org `sameAs`. Empty when nothing is configured, so
 * callers can spread it unconditionally.
 */
export const storeSameAs = (): string[] =>
  [APP_STORE_URL, PLAY_STORE_URL].filter((url): url is string => url !== null);
