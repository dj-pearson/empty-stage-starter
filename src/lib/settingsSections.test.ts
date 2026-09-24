import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import hub from '@/i18n/locales/app/en.settings-hub.json';
import {
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_KEYS,
  isSettingsControlOf,
  isSettingsSectionKey,
  searchSettings,
  settingsHref,
} from './settingsSections';

type Tree = { [key: string]: string | Tree };

function lookup(key: string): string | undefined {
  let node: string | Tree | undefined = hub as Tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

const translate = (key: string) => lookup(key) ?? key;

describe('SETTINGS_SECTIONS', () => {
  it('lists the eight hub sections in order, once each', () => {
    const keys = SETTINGS_SECTIONS.map((s) => s.key);
    expect(keys).toEqual([...SETTINGS_SECTION_KEYS]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['profile', 'signin', 'privacy', 'notifications', 'planner', 'accessibility', 'plan', 'data']);
  });

  it('is frozen, so no consumer can reorder it under the others', () => {
    expect(Object.isFrozen(SETTINGS_SECTIONS)).toBe(true);
    for (const s of SETTINGS_SECTIONS) expect(Object.isFrozen(s)).toBe(true);
  });

  it('gives every section the element id the shell and the deep links use', () => {
    for (const s of SETTINGS_SECTIONS) expect(s.elementId).toBe(`settings-${s.key}`);
  });

  it('has copy for every title, summary, keyword and scope in the hub fragment', () => {
    const missing: string[] = [];
    for (const s of SETTINGS_SECTIONS) {
      const keys = [s.titleKey, s.summaryKey, ...s.keywords, `settings.scope.${s.scope}`];
      for (const c of s.controls ?? []) keys.push(c.labelKey, ...c.keywords);
      for (const key of keys) if (lookup(key) === undefined) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('never registers the same control id twice', () => {
    const ids = SETTINGS_SECTIONS.flatMap((s) => (s.controls ?? []).map((c) => c.id));
    expect(ids).toEqual([...new Set(ids)]);
  });
});

describe('settingsHref', () => {
  it('builds the section URL', () => {
    expect(settingsHref('accessibility')).toBe('/dashboard/settings?section=accessibility');
    expect(settingsHref('signin')).toBe('/dashboard/settings?section=signin');
  });

  it('adds a focus target when given one', () => {
    expect(settingsHref('planner', 'week-starts-monday')).toBe(
      '/dashboard/settings?section=planner&focus=week-starts-monday'
    );
  });
});

describe('key and control guards', () => {
  it('accepts only the registered keys', () => {
    expect(isSettingsSectionKey('data')).toBe(true);
    expect(isSettingsSectionKey('subscription')).toBe(false);
    expect(isSettingsSectionKey('constructor')).toBe(false);
    expect(isSettingsSectionKey(null)).toBe(false);
  });

  it('accepts a focus id only under the section that registers it', () => {
    expect(isSettingsControlOf('data', 'export-data')).toBe(true);
    expect(isSettingsControlOf('profile', 'export-data')).toBe(false);
    expect(isSettingsControlOf('plan', 'anything')).toBe(false);
  });
});

describe('searchSettings', () => {
  it('finds a section by a keyword that is not in its title', () => {
    const hits = searchSettings('dyslexia', translate);
    expect(hits.some((h) => h.key === 'accessibility' && !h.controlId)).toBe(true);
    expect(hits.some((h) => h.controlId === 'dyslexia-font')).toBe(true);
  });

  it('links a control hit to its section and focus target', () => {
    const hit = searchSettings('week start', translate).find((h) => h.controlId === 'week-starts-monday');
    expect(hit?.href).toBe('/dashboard/settings?section=planner&focus=week-starts-monday');
  });

  it('ignores case and accents, and returns nothing for blank input', () => {
    expect(searchSettings('EXPORT', translate).length).toBeGreaterThan(0);
    expect(searchSettings('   ', translate)).toEqual([]);
    expect(searchSettings('zzzz-no-such-setting', translate)).toEqual([]);
  });
});

describe('the retired accessibility page', () => {
  it('is linked from nowhere in src', () => {
    // The redirect is for bookmarks. Our own links go through settingsHref().
    const files = execSync("find src -name '*.tsx' -o -name '*.ts'", { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter((f) => f && !/\.test\.|routeAliases\.ts$/.test(f));
    const offenders = files.filter((f) =>
      readFileSync(path.join(process.cwd(), f), 'utf8').includes('/dashboard/accessibility-settings')
    );
    expect(files.length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
