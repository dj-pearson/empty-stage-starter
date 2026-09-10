/**
 * US-837: the skip link has to actually skip.
 *
 * Two halves, because the VPAT claims WCAG 2.4.1 "Supports" and both halves
 * were false:
 *
 *   1. `<a href="#main-content">` scrolls but does not move focus when the
 *      target is a plain <main>/<div>. Chrome, Safari and Edge all leave focus
 *      in the navigation; only Firefox moves it. So the next Tab went straight
 *      back into the nav the user asked to skip.
 *   2. Only 32 of the page files declared id="main-content" at all. On the
 *      rest -- including every programmatic guide, which is the highest-traffic
 *      public surface -- the link was a dead anchor.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SkipToContent, findSkipTarget, focusSkipTarget } from './SkipToContent';

const ROOT = process.cwd();

describe('US-837: the link moves focus, not just the scroll position', () => {
  beforeEach(() => {
    // jsdom has no layout, so scrollIntoView is not implemented on elements.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('focuses #main-content and makes it programmatically focusable', async () => {
    render(
      <>
        <SkipToContent />
        <nav>
          <a href="/somewhere">A nav link</a>
        </nav>
        <main id="main-content">Body copy</main>
      </>
    );

    const main = document.getElementById('main-content')!;
    expect(main.hasAttribute('tabindex')).toBe(false);

    await userEvent.click(screen.getByText('Skip to main content'));

    expect(document.activeElement).toBe(main);
    // -1 keeps it out of the tab order: reachable by script, not by tabbing.
    expect(main.getAttribute('tabindex')).toBe('-1');
  });

  it('falls back to the first <main> when nothing carries the id', async () => {
    render(
      <>
        <SkipToContent />
        <main>Body copy</main>
      </>
    );
    await userEvent.click(screen.getByText('Skip to main content'));
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('falls back to [role="main"]', () => {
    document.body.innerHTML = '<div role="main">Body</div>';
    const target = findSkipTarget(document, 'main-content');
    expect(target).toBe(document.querySelector('[role="main"]'));
  });

  it('does nothing, and does not throw, when there is no landmark at all', async () => {
    document.body.innerHTML = '';
    render(<SkipToContent />);
    await userEvent.click(screen.getByText('Skip to main content'));
    expect(focusSkipTarget(null)).toBe(false);
  });

  it('leaves an existing tabindex alone', () => {
    document.body.innerHTML = '<main id="main-content" tabindex="0">Body</main>';
    focusSkipTarget(findSkipTarget(document, 'main-content'));
    expect(document.getElementById('main-content')!.getAttribute('tabindex')).toBe('0');
  });
});

/**
 * Every page a visitor can land on directly needs a landmark for the link to
 * reach. Routes nested under /dashboard and /admin render inside a parent that
 * declares one, so the parents are checked instead of each child.
 */
const NO_LANDMARK_REASONS: Readonly<Record<string, string>> = {
  'pages/AuthCallback':
    'transient "completing sign-in" screen that redirects within a second; it renders no navigation to skip past',
  'pages/OAuthCallback': 'same transient redirect screen, for the OAuth provider round-trip',
};

const LAYOUTS_WITH_LANDMARK = ['pages/Dashboard', 'pages/Admin'];

function appSource(): string {
  return readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');
}

/** name -> module path, from the lazy() imports at the top of App.tsx. */
function lazyImports(source: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of source.matchAll(/const (\w+) = lazy\(\(\) =>\s*import\('\.\/([\w/\-.]+)'\)/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

/** Absolute-path routes and the page component each renders. */
function topLevelRoutes(source: string, imports: Map<string, string>) {
  const routes: Array<{ path: string; component: string; module: string }> = [];
  for (const m of source.matchAll(/<Route\b[\s\S]{0,900}?(?:\/>|<\/Route>)/g)) {
    const block = m[0];
    const path = block.match(/path=\{?["']([^"']+)/)?.[1];
    if (!path || !(path.startsWith('/') || path === '*')) continue;
    for (const name of block.matchAll(/<(\w+)\s*\/>/g)) {
      const module = imports.get(name[1]);
      if (module) routes.push({ path, component: name[1], module });
    }
  }
  return routes;
}

function hasLandmark(modulePath: string): boolean {
  const file = join(ROOT, 'src', `${modulePath}.tsx`);
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').includes('id="main-content"');
}

const source = appSource();
const imports = lazyImports(source);
const routes = topLevelRoutes(source, imports);

describe('US-837: the instrument', () => {
  it('resolves a realistic number of lazy page imports and top-level routes', () => {
    expect(imports.size).toBeGreaterThanOrEqual(50);
    expect(routes.length).toBeGreaterThanOrEqual(25);
  });

  it('recognises a landmark where one exists and its absence where it does not', () => {
    expect(hasLandmark('pages/Landing')).toBe(true);
    expect(hasLandmark('pages/does-not-exist')).toBe(false);
  });
});

describe('US-837: every directly-reachable page has a landmark to skip to', () => {
  it.each([...new Set(routes.map((r) => r.module))].sort())('%s', (module) => {
    if (module in NO_LANDMARK_REASONS) {
      expect(NO_LANDMARK_REASONS[module].length).toBeGreaterThan(20);
      return;
    }
    const paths = routes.filter((r) => r.module === module).map((r) => r.path);
    expect(
      hasLandmark(module),
      `${module} is routed at ${paths.join(', ')} with no id="main-content", so the skip link is a dead anchor there`
    ).toBe(true);
  });

  it('the layouts that nested routes rely on declare one', () => {
    for (const layout of LAYOUTS_WITH_LANDMARK) {
      expect(hasLandmark(layout), `${layout} is a layout for nested routes`).toBe(true);
    }
  });

  it('the exemption list stays honest: each exempted module still exists', () => {
    for (const module of Object.keys(NO_LANDMARK_REASONS)) {
      expect(existsSync(join(ROOT, 'src', `${module}.tsx`)), `${module} is exempted but gone`).toBe(
        true
      );
    }
  });

  it('the programmatic guides, which App.tsx routes through PseoPage, all have one', () => {
    const dir = join(ROOT, 'src', 'pages', 'pseo');
    const templates = readdirSync(dir).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'));
    expect(templates.length).toBeGreaterThanOrEqual(5);
    for (const file of templates) {
      expect(
        readFileSync(join(dir, file), 'utf8').includes('id="main-content"'),
        `src/pages/pseo/${file} renders a full guide with no landmark`
      ).toBe(true);
    }
  });
});
