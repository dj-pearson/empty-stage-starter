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
import { fileURLToPath } from 'node:url';

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
 * "/" entries are path patterns; `exclude: true` wins over any later match.
 */
const COMPONENTS = [
  { '/': '/join/*', comment: 'household invite links' },
  { '/': '/share/*', comment: 'shared plans and lists' },
  { '/': '/dashboard/*', comment: 'signed-in app surface' },
  { '/': '/kids/*', comment: 'child profiles' },
  { '/': '/planner/*', comment: 'meal planner' },
  { '/': '/grocery/*', comment: 'grocery lists' },
  { '/': '/pantry/*', comment: 'pantry' },
  { '/': '/recipes/*', comment: 'recipes' },
  { '/': '/tracker/*', comment: 'food tracker' },
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

await main();
