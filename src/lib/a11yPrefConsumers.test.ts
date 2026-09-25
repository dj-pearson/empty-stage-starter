/**
 * Every accessibility control the settings page shows must change something.
 *
 * The page used to offer Disable Autoplay and Verbose Descriptions, which no
 * code read, and Extended Timeouts before App.tsx consumed it. A switch that
 * does nothing is worse than no switch: the person who needed it believes the
 * problem is handled. So each preference key the settings UI renders must be
 * read somewhere other than the context that stores it and the page that sets
 * it, either in code (`preferences.<key>`) or through a class the context puts
 * on <html> and index.css styles.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const SETTINGS = 'src/components/AccessibilitySettings.tsx';
const QUICK_ROW = 'src/components/settings/QuickComfortRow.tsx';
const SIZE_TOGGLE = 'src/components/settings/A11yTextSizeToggle.tsx';
const CONTEXT = 'src/contexts/AccessibilityContext.tsx';

/** Files that set preferences rather than consume them. */
const NOT_CONSUMERS = new Set([
  SETTINGS,
  QUICK_ROW,
  SIZE_TOGGLE,
  CONTEXT,
  'src/contexts/accessibilityContextCore.ts',
  'src/components/AccessibilityWidget.tsx',
]);

function sourceFiles(): string[] {
  return (readdirSync(join(ROOT, 'src'), { recursive: true }) as string[])
    .map((f) => `src/${f.split('\\').join('/')}`)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f) && !NOT_CONSUMERS.has(f));
}

/** Keys the settings UI renders: the switch rows, the comfort tiles and the size control. */
function renderedKeys(): string[] {
  const settings = read(SETTINGS);
  const quick = read(QUICK_ROW);
  const rowKeys = [...settings.matchAll(/^\s+key: '(\w+)',$/gm)].map((m) => m[1]);
  const tileKeys = [...quick.matchAll(/\{ key: '(\w+)'/g)].map((m) => m[1]);
  const size = quick.includes('<A11yTextSizeToggle') ? ['fontSize'] : [];
  return [...new Set([...rowKeys, ...tileKeys, ...size])];
}

const context = read(CONTEXT);
const css = read('src/index.css');
const files = sourceFiles();
const sources = new Map(files.map((f) => [f, read(f)]));

function codeConsumers(key: string): string[] {
  const pattern = new RegExp(`preferences\\??\\.${key}\\b`);
  return files.filter((f) => pattern.test(sources.get(f) ?? ''));
}

function cssConsumer(key: string): string | undefined {
  const m = context.match(new RegExp(`\\['${key}', '([\\w-]+)'\\]`));
  if (!m) return undefined;
  const cls = m[1];
  return new RegExp(`\\.${cls}(?![\\w-])[^{]*\\{`).test(css) ? `.${cls} in index.css` : undefined;
}

describe('accessibility settings: every control has a consumer', () => {
  const keys = renderedKeys();

  it('finds the rendered controls, so the check below is not vacuous', () => {
    expect(keys).toEqual(
      expect.arrayContaining([
        'fontSize',
        'highContrast',
        'reducedMotion',
        'dyslexiaFont',
        'extendedTimeouts',
        'screenReaderMode',
        'keyboardShortcuts',
      ])
    );
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(renderedKeys())('%s is read outside the context and the settings page', (key) => {
    const consumers = [...codeConsumers(key), cssConsumer(key)].filter(Boolean);
    expect(consumers, `${key} is rendered as a control but nothing reads it`).not.toEqual([]);
  });

  it('extendedTimeouts is what sets the toast duration in App.tsx', () => {
    expect(read('src/App.tsx')).toMatch(/preferences\.extendedTimeouts\s*\?/);
  });

  it('screenReaderMode is what RouteAnnouncer uses to move focus', () => {
    expect(read('src/components/RouteAnnouncer.tsx')).toMatch(/preferences\.screenReaderMode/);
  });

  it('the controls with no consumer are gone from the page', () => {
    for (const key of ['disableAutoplay', 'verboseDescriptions', 'largeText']) {
      expect(keys).not.toContain(key);
    }
  });

  it('the instrument: a key with no consumer is caught', () => {
    expect(codeConsumers('disableAutoplay')).toEqual([]);
    expect(cssConsumer('disableAutoplay')).toBeUndefined();
  });
});
