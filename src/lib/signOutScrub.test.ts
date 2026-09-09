/**
 * US-835: sign-out must not leave one household's data in the browser for the
 * next person who signs in on the same device.
 *
 * Two halves:
 *   1. A sweep of src/ for storage keys, so a key added later is forced into a
 *      classification (scrubbed, or kept with a written reason) instead of
 *      silently surviving.
 *   2. The pure behaviour of keysToScrub, including the prefix families.
 *
 * The scan asserts on itself first. Every regex here has been wrong at least
 * once in this repo's history; a sweep that finds nothing must fail loudly
 * rather than report a clean tree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  SCRUBBED_KEYS,
  SCRUBBED_SESSION_KEYS,
  SCRUBBED_PREFIXES,
  KEPT_KEYS,
  KEPT_PREFIXES,
  keysToScrub,
  sessionKeysToScrub,
  scrubOnSignOut,
  type ScrubStorage,
} from './signOutScrub';

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Files whose storage key is built at runtime, so no literal is readable from
 * the call site. Each needs a reason, and the set must match exactly: a new
 * file computing a key fails this gate rather than slipping past the literal
 * scan.
 */
const DYNAMIC_KEY_FILES: Readonly<Record<string, string>> = {
  'src/components/KidBirthdayCard.tsx':
    'dismissKey(kidId, year) under eatpal.kid_birthday_dismissed -- scrubbed by prefix',
  'src/components/SeasonalRecallCard.tsx':
    'dismissKey(year, week, recipeId) under eatpal.seasonal_recall_dismissed -- scrubbed by prefix',
  'src/components/ExitIntentPopup.tsx': 'storageKey is a prop; its default is in KEPT_KEYS',
  'src/hooks/useAutoSave.tsx': 'autosave-${key} -- scrubbed by the autosave- prefix',
  'src/hooks/useSmartDefaults.ts':
    'frequency-/recent-/prefs-${key} -- all three scrubbed by prefix',
  'src/hooks/useLocalStorage.ts': 'generic hook; its callers supply the literal key',
  'src/lib/platform.ts': 'the storage abstraction itself; callers supply the key',
  'src/lib/webSyncQueue.ts': 'webQueueKey(userId) -- kept, and already user-scoped',
  'src/lib/offlineQueue.ts': 'generic queue; webSyncQueue supplies the key',
  'src/lib/signOutScrub.ts': 'this module removes keys it is given; it writes none',
  'src/hooks/useOAuthToken.ts': 'keys itself by provider name; nothing survives the exchange',
};

const STORAGE_CALL =
  /(localStorage|sessionStorage|storage|Storage\(\))\s*\.\s*(?:setItem|getItem|removeItem)\s*\(\s*([^,)]+)/g;
const HOOK_CALL = /\buse(?:LocalStorage|AutoSave|SmartDefaults)\s*\(\s*(["'`])([^"'`]+)\1/g;

/**
 * Comments are stripped before anything is matched. A JSDoc example in
 * useLocalStorage.ts (`useLocalStorage('userName', 'Guest')`) was reported as
 * an unclassified production key on the first run of this file, which is the
 * same mistake iteration 12 made when its detector read a comment quoting the
 * bug it was looking for.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

interface Scan {
  literals: Set<string>;
  sessionLiterals: Set<string>;
  dynamicFiles: Set<string>;
}

function scan(): Scan {
  const literals = new Set<string>();
  const sessionLiterals = new Set<string>();
  const dynamicFiles = new Set<string>();

  for (const file of walk(SRC)) {
    const source = stripComments(readFileSync(file, 'utf8'));
    if (!/setItem|getItem|removeItem/.test(source)) continue;
    const rel = file.slice(process.cwd().length + 1).split('\\').join('/');

    // const NAME = "literal" declarations, so an identifier argument resolves.
    const consts = new Map<string, string>();
    for (const m of source.matchAll(/\b(?:const|let)\s+(\w+)\s*(?::\s*[^=]+)?=\s*(["'])([^"']+)\2/g)) {
      consts.set(m[1], m[3]);
    }

    for (const m of source.matchAll(STORAGE_CALL)) {
      const bucket = m[1] === 'sessionStorage' ? sessionLiterals : literals;
      const arg = m[2].trim();
      const quoted = arg.match(/^(["'])([^"']+)\1$/);
      if (quoted) {
        bucket.add(quoted[2]);
      } else if (consts.has(arg)) {
        bucket.add(consts.get(arg)!);
      } else {
        dynamicFiles.add(rel);
      }
    }
    for (const m of source.matchAll(HOOK_CALL)) literals.add(m[2]);
  }
  return { literals, sessionLiterals, dynamicFiles };
}

const found = scan();

describe('US-835: the scan itself', () => {
  it('finds a realistic number of storage keys', () => {
    // A format change or a broken regex turns every assertion below into a
    // tautology. This is the floor that makes the rest mean something.
    expect(found.literals.size).toBeGreaterThanOrEqual(15);
  });

  it('finds keys on both sides of the classification', () => {
    expect(found.literals.has('eatpal_recent_searches')).toBe(true); // scrubbed
    expect(found.literals.has('eatpal_cookie_consent')).toBe(true); // kept
    expect(found.literals.has('kid-meal-planner')).toBe(true); // the US-537 key
  });

  it('separates sessionStorage from localStorage', () => {
    expect(found.sessionLiterals.size).toBeGreaterThanOrEqual(10);
    expect(found.sessionLiterals.has('login_session_id')).toBe(true);
    expect(found.literals.has('login_session_id')).toBe(false);
  });

  it('reads code, not comments', () => {
    // useLocalStorage.ts documents itself with useLocalStorage('userName', ...).
    expect(found.literals.has('userName')).toBe(false);
  });

  it('finds the files that compute their key at runtime', () => {
    expect(found.dynamicFiles.size).toBeGreaterThanOrEqual(8);
  });
});

describe('US-835: every storage key is classified', () => {
  it.each([...found.literals].sort())('localStorage %s is scrubbed or kept for a written reason', (key) => {
    const classified =
      SCRUBBED_KEYS.includes(key) ||
      SCRUBBED_PREFIXES.some((p) => key.startsWith(p)) ||
      key in KEPT_KEYS ||
      Object.keys(KEPT_PREFIXES).some((p) => key.startsWith(p));
    expect(classified, `${key} is written to storage but signOutScrub.ts never decides its fate`).toBe(true);
  });

  it.each([...found.sessionLiterals].sort())(
    'sessionStorage %s is scrubbed or kept for a written reason',
    (key) => {
      const classified =
        SCRUBBED_SESSION_KEYS.includes(key) ||
        key in KEPT_KEYS ||
        Object.keys(KEPT_PREFIXES).some((p) => key.startsWith(p));
      expect(classified, `${key} is written to sessionStorage but nothing decides its fate`).toBe(
        true
      );
    }
  );

  it('no key is both scrubbed and kept', () => {
    const both = [...SCRUBBED_KEYS, ...SCRUBBED_SESSION_KEYS].filter((k) => k in KEPT_KEYS);
    expect(both).toEqual([]);
  });

  it('every kept key gives a reason', () => {
    for (const [key, reason] of Object.entries({ ...KEPT_KEYS, ...KEPT_PREFIXES })) {
      expect(reason.length, `${key} is kept without saying why`).toBeGreaterThan(20);
    }
  });

  it('the kept list stays honest: each entry is still referenced somewhere in src', () => {
    // Referenced rather than "in the scan": eatpal_exit_popup_shown reaches
    // storage as a default prop value, which no call-site regex will see.
    const tree = walk(SRC)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const key of Object.keys(KEPT_KEYS)) {
      expect(tree.includes(key), `${key} is on the keep list but nothing references it any more`).toBe(true);
    }
  });

  it('the runtime-key allowlist matches the tree exactly', () => {
    expect([...found.dynamicFiles].sort()).toEqual(Object.keys(DYNAMIC_KEY_FILES).sort());
    for (const file of Object.keys(DYNAMIC_KEY_FILES)) {
      expect(existsSync(join(process.cwd(), file)), `${file} is allowlisted but gone`).toBe(true);
    }
  });
});

describe('US-835: keysToScrub', () => {
  it('removes the household data a shared device would otherwise hand over', () => {
    const present = [
      'kid-meal-planner',
      'eatpal_recent_searches',
      'eatpal.auto_restock_blocklist',
      'eatpal.kid_birthday_dismissed.kid-7.2026',
      'eatpal.seasonal_recall_dismissed.2026.14.r-3',
      'eatpal-budget-calc-draft',
      'autosave-recipe-draft',
    ];
    expect(keysToScrub(present).sort()).toEqual(present.sort());
  });

  it('leaves device-level and user-scoped keys alone', () => {
    const kept = [
      'eatpal_cookie_consent',
      'accessibility-preferences',
      'app_install_dismissed',
      'eatpal_rate_limits',
      'eatpal.web.syncQueue.user-1',
      'unrelated-third-party-key',
    ];
    expect(keysToScrub(kept)).toEqual([]);
  });

  it('clears the session ids that would otherwise attribute the next person to this one', () => {
    const present = ['login_session_id', 'audit_session_id', 'gsc_user_id', 'share-target-pending'];
    expect(sessionKeysToScrub([...present, 'route-error-chunk-reload-at']).sort()).toEqual(
      present.sort()
    );
  });

  it('scrubOnSignOut removes exactly those keys from the storage it is given', () => {
    const backing: Record<string, string> = {
      'eatpal_recent_searches': '["chicken nuggets"]',
      'eatpal_rate_limits': '{}',
      'eatpal.kid_birthday_dismissed.kid-7.2026': 'true',
    };
    const storage: ScrubStorage = {
      keys: () => Object.keys(backing),
      removeItem: (k) => { delete backing[k]; },
    };
    const sessionBacking: Record<string, string> = {
      login_session_id: 'sess-a',
      'route-error-chunk-reload-at': '0',
    };
    const sessionAdapter: ScrubStorage = {
      keys: () => Object.keys(sessionBacking),
      removeItem: (k) => { delete sessionBacking[k]; },
    };
    const removed = scrubOnSignOut(storage, sessionAdapter);
    expect(removed.sort()).toEqual([
      'eatpal.kid_birthday_dismissed.kid-7.2026',
      'eatpal_recent_searches',
      'login_session_id',
    ]);
    expect(Object.keys(backing)).toEqual(['eatpal_rate_limits']);
    expect(Object.keys(sessionBacking)).toEqual(['route-error-chunk-reload-at']);
  });

  it('a storage that throws does not break sign-out', () => {
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('blocked'); },
    });
    try {
      expect(scrubOnSignOut()).toEqual([]);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });
});
