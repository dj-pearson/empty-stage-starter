/**
 * Writes dist/.well-known/apple-app-site-association after `vite build`.
 *
 * ios/EatPal/EatPal/EatPal.entitlements has claimed `applinks:tryeatpal.com` and
 * `applinks:www.tryeatpal.com` since the Swift app shipped. The web side never served
 * the file that answers that claim: https://tryeatpal.com/.well-known/apple-app-site-association
 * returned the SPA's index.html. Apple's CDN fetches that URL, fails to parse HTML as
 * JSON, and silently disables Universal Links for the domain. The visible symptom is
 * that tapping any tryeatpal.com link on an iPhone opens Safari and never the app,
 * including invite links and share links that only make sense in the app.
 *
 * The file is generated rather than committed because it is keyed by the Apple Team
 * ID, which is not in this repo (ios/EatPal/project.yml has DEVELOPMENT_TEAM: "" and
 * eas.json has the YOUR_TEAM_ID placeholder). Same contract as src/lib/app-store.ts:
 * when the environment does not supply the ID, nothing is emitted and the build still
 * succeeds. Shipping a file with a wrong or placeholder Team ID is worse than shipping
 * none, because Apple caches what it fetches.
 *
 * To enable: set APPLE_TEAM_ID (the 10-character Team ID from developer.apple.com,
 * e.g. A1B2C3D4E5) in the Cloudflare Pages build environment.
 *
 * Verify after deploy:
 *   curl -sI https://tryeatpal.com/.well-known/apple-app-site-association
 *     -> 200, Content-Type: application/json (set in public/_headers)
 *   The path must return the file directly. A redirect breaks it; Apple does not follow.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'dist', '.well-known');
const OUT_FILE = path.join(OUT_DIR, 'apple-app-site-association');

/** Matches PRODUCT_BUNDLE_IDENTIFIER in ios/EatPal/project.yml and app.config.js. */
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID?.trim() || 'com.eatpal.app';

/**
 * Only app-shaped surfaces open the app. Marketing and editorial routes deliberately
 * stay in the browser: a parent arriving from a search result or a shared article
 * should land on the page they clicked, not get bounced into an install prompt. That
 * also keeps Universal Links away from every URL the SEO work depends on.
 *
 * Every pattern here must have a matching case in
 * ios/EatPal/EatPal/Utilities/DeepLinkHandler.swift -> handleUniversalLink. A pattern
 * with no case behind it is worse than no pattern at all: Apple hands the URL to the
 * app instead of Safari, the handler falls through its `default:`, and the tap does
 * nothing at all. scripts/generate-aasa.test.ts reads the Swift file and fails the
 * build when the two drift.
 *
 * `/dashboard` children are listed one by one rather than as `/dashboard/*` because
 * several of them must NOT open the app. `/dashboard/billing` is Stripe checkout;
 * swallowing it would strand someone mid-payment in a web view the app does not have.
 *
 * `/join` and `/share` are the two links most worth opening in the app and are
 * deliberately absent -- the Swift side has no route for either yet (US-851).
 */
export const COMPONENTS = [
  { '/': '/app/*', comment: 'the app-only link vocabulary used by widgets, push, and Siri' },
  { '/': '/dashboard', comment: 'signed-in home' },
  { '/': '/dashboard/pantry', comment: 'pantry' },
  { '/': '/dashboard/planner', comment: 'meal planner (app calls it meal-plan)' },
  { '/': '/dashboard/recipes', comment: 'recipes' },
  { '/': '/dashboard/grocery', comment: 'grocery list' },
  { '/': '/dashboard/food-tracker', comment: 'food tracker' },
  { '/': '/dashboard/food-chaining', comment: 'food chaining' },
  { '/': '/dashboard/insights', comment: 'insights' },
  { '/': '/dashboard/progress', comment: 'progress and achievements' },
  { '/': '/dashboard/ai-coach', comment: 'AI coach' },
  { '/': '/dashboard/settings', comment: 'settings' },
];

function main() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();

  if (!teamId) {
    console.warn(
      '[aasa] APPLE_TEAM_ID is not set; skipping .well-known/apple-app-site-association.\n' +
        '[aasa] Universal Links stay disabled until it is set in the build environment.',
    );
    return;
  }

  if (!/^[A-Z0-9]{10}$/.test(teamId)) {
    console.error(
      `[aasa] APPLE_TEAM_ID must be 10 uppercase alphanumeric characters, got "${teamId}". ` +
        'Refusing to write a file Apple will cache and reject.',
    );
    process.exitCode = 1;
    return;
  }

  const appId = `${teamId}.${BUNDLE_ID}`;

  const aasa = {
    applinks: {
      details: [{ appIDs: [appId], components: COMPONENTS }],
    },
    // Lets iOS offer the saved tryeatpal.com password in the app's sign-in form, and
    // the app's password back on the web. Cheap to include and it shares the appID.
    webcredentials: { apps: [appId] },
  };

  return mkdir(OUT_DIR, { recursive: true })
    .then(() => writeFile(OUT_FILE, `${JSON.stringify(aasa, null, 2)}\n`, 'utf8'))
    .then(() => {
      console.log(`[aasa] wrote .well-known/apple-app-site-association for ${appId}`);
    });
}

// Only write when run as a script. Importing the module (the test does, to read
// COMPONENTS) must not touch dist/.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
