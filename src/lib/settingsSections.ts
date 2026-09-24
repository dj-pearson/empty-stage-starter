/**
 * The Settings hub's sections, in display order. One list for the page, the
 * side rail, the phone index, the settings filter and the command palette, so
 * a section added in one place cannot go missing from the others.
 *
 * URL shape: /dashboard/settings?section=<key>[&focus=<controlId>]. A deep link
 * only selects a section and moves focus; it never opens a dialog or starts an
 * action. Build links with settingsHref() rather than by hand.
 *
 * Control ids are DOM ids the section bodies render. The hub focuses the
 * element with that id after landing, and does nothing if it is not there, so a
 * renamed id degrades to "lands on the section" rather than breaking.
 *
 * Every string here is an i18n key; copy lives in
 * src/i18n/locales/app/en.settings-hub.json.
 */
import {
  Accessibility,
  Bell,
  CalendarDays,
  Crown,
  Database,
  KeyRound,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export const SETTINGS_PATH = '/dashboard/settings';

export const SETTINGS_SECTION_KEYS = [
  'profile',
  'signin',
  'privacy',
  'notifications',
  'planner',
  'accessibility',
  'plan',
  'data',
] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTION_KEYS)[number];

/**
 * Who a section's settings apply to. `mixed` is a section holding both
 * per-person and household-wide settings (privacy, data).
 */
export type SettingsScope = 'you' | 'household' | 'device' | 'mixed';

export interface SettingsControl {
  /** DOM id of the control inside the section body. */
  id: string;
  labelKey: string;
  keywords: string[];
}

export interface SettingsSection {
  key: SettingsSectionKey;
  elementId: `settings-${SettingsSectionKey}`;
  titleKey: string;
  summaryKey: string;
  icon: LucideIcon;
  scope: SettingsScope;
  keywords: string[];
  controls?: SettingsControl[];
}

const control = (id: string, slug: string): SettingsControl =>
  Object.freeze({
    id,
    labelKey: `settings.controls.${slug}.label`,
    keywords: Object.freeze([`settings.controls.${slug}.keywords`]) as string[],
  });

const section = (
  key: SettingsSectionKey,
  icon: LucideIcon,
  scope: SettingsScope,
  controls?: SettingsControl[]
): SettingsSection =>
  Object.freeze({
    key,
    elementId: `settings-${key}` as const,
    titleKey: `settings.sections.${key}.title`,
    summaryKey: `settings.sections.${key}.summary`,
    icon,
    scope,
    keywords: Object.freeze([`settings.sections.${key}.keywords`]) as string[],
    ...(controls ? { controls: Object.freeze(controls) as SettingsControl[] } : {}),
  });

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = Object.freeze([
  section('profile', UserRound, 'you', [control('displayName', 'displayName')]),
  section('signin', KeyRound, 'you', [
    control('currentPassword', 'password'),
    control('sign-out-others', 'signOutOthers'),
  ]),
  section('privacy', ShieldCheck, 'mixed', [
    control('share-chain-outcomes', 'winNetwork'),
    control('share-links', 'shareLinks'),
  ]),
  section('notifications', Bell, 'you', [
    control('email-preferences', 'email'),
    control('variety-nudges', 'varietyNudges'),
  ]),
  section('planner', CalendarDays, 'you', [
    control('week-starts-monday', 'weekStart'),
    control('auto-restock', 'autoRestock'),
  ]),
  section('accessibility', Accessibility, 'you', [
    control('font-size', 'textSize'),
    control('reduced-motion', 'reduceMotion'),
    control('high-contrast', 'contrast'),
    control('dyslexia-font', 'dyslexiaFont'),
    control('screen-reader-mode', 'screenReader'),
    control('extended-timeouts', 'extendedTimeouts'),
  ]),
  section('plan', Crown, 'you'),
  section('data', Database, 'mixed', [
    control('export-data', 'exportData'),
    control('data-import', 'importData'),
    control('delete-account', 'deleteAccount'),
  ]),
]);

const KEY_SET: ReadonlySet<string> = new Set(SETTINGS_SECTION_KEYS);

export function isSettingsSectionKey(value: unknown): value is SettingsSectionKey {
  return typeof value === 'string' && KEY_SET.has(value);
}

export function getSettingsSection(key: SettingsSectionKey): SettingsSection {
  // The list is built from SETTINGS_SECTION_KEYS, so every key has an entry.
  return SETTINGS_SECTIONS.find((s) => s.key === key) as SettingsSection;
}

/** True when `controlId` is registered under `key`; the hub focuses nothing else. */
export function isSettingsControlOf(key: SettingsSectionKey, controlId: unknown): controlId is string {
  if (typeof controlId !== 'string') return false;
  return getSettingsSection(key).controls?.some((c) => c.id === controlId) ?? false;
}

/** `/dashboard/settings?section=<key>[&focus=<controlId>]`. */
export function settingsHref(key: SettingsSectionKey, focus?: string): string {
  const base = `${SETTINGS_PATH}?section=${key}`;
  return focus ? `${base}&focus=${encodeURIComponent(focus)}` : base;
}

export interface SettingsSearchHit {
  key: SettingsSectionKey;
  controlId?: string;
  /** Control label, or the section title for a section hit. */
  label: string;
  sectionTitle: string;
  href: string;
}

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/**
 * Match typed text against the translated titles, keywords and control labels.
 * Every word typed must appear somewhere in the candidate's text. A section
 * hit comes before its controls; order otherwise follows SETTINGS_SECTIONS.
 */
export function searchSettings(query: string, translate: (key: string) => string): SettingsSearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matches = (text: string) => {
    const hay = fold(text);
    return words.every((w) => hay.includes(w));
  };

  const hits: SettingsSearchHit[] = [];
  for (const s of SETTINGS_SECTIONS) {
    const sectionTitle = translate(s.titleKey);
    const sectionText = [sectionTitle, translate(s.summaryKey), ...s.keywords.map(translate)].join(' ');
    if (matches(sectionText)) {
      hits.push({ key: s.key, label: sectionTitle, sectionTitle, href: settingsHref(s.key) });
    }
    for (const c of s.controls ?? []) {
      const label = translate(c.labelKey);
      if (matches([label, ...c.keywords.map(translate)].join(' '))) {
        hits.push({ key: s.key, controlId: c.id, label, sectionTitle, href: settingsHref(s.key, c.id) });
      }
    }
  }
  return hits;
}
