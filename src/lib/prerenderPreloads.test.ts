import { describe, it, expect } from 'vitest';
import { shellPreloadHrefs, stripRuntimePreloads } from '../../scripts/prerender.mjs';

/**
 * US-816: the prerendered HTML preloads only what the shell declared.
 *
 * Vite emits a handful of <link rel="modulepreload"> tags into app-shell.html
 * for the entry graph. __vitePreload then adds MORE to the live DOM as chunks
 * load, and the prerenderer serialises document.documentElement.outerHTML, so
 * every chunk that happened to be fetched while a route rendered is frozen
 * into the static HTML as an eager download for every future visitor.
 *
 * Measured on this build: app-shell.html had 7 links and dist/index.html had
 * 34. vendor-tiptap was the case that made it visible -- 137 kB gzipped of
 * blog-CMS rich-text editor preloaded on the marketing home page -- and
 * iteration 5 fixed that one at its cause. This is the mechanism, so the next
 * one does not need finding by hand.
 */

const link = (rel: string, href: string) => `<link rel="${rel}" href="${href}">`;

describe('reading the shell allowance', () => {
  it('takes only the modulepreload hrefs', () => {
    const shell = [
      link('modulepreload', '/assets/js/index-abc.js'),
      link('stylesheet', '/assets/css/index-abc.css'),
      link('preload', '/fonts/inter.woff2'),
      link('icon', '/favicon.ico'),
    ].join('');

    expect([...shellPreloadHrefs(shell)]).toEqual(['/assets/js/index-abc.js']);
  });

  it('reads an unquoted rel and single quotes, because Vite has emitted both', () => {
    const shell = `<link rel=modulepreload href='/a.js'><link rel="modulepreload" href="/b.js">`;
    expect([...shellPreloadHrefs(shell)].sort()).toEqual(['/a.js', '/b.js']);
  });

  it('finds nothing in a shell with no preloads', () => {
    expect(shellPreloadHrefs('<html><head></head></html>').size).toBe(0);
  });
});

describe('stripping what the runtime injected', () => {
  const allowed = new Set(['/assets/js/index-abc.js', '/assets/js/vendor-react-def.js']);

  it('keeps every link the shell declared', () => {
    const html = link('modulepreload', '/assets/js/index-abc.js');
    expect(stripRuntimePreloads(html, allowed)).toBe(html);
  });

  it('drops one the shell did not, tiptap being the case that started this', () => {
    const html =
      link('modulepreload', '/assets/js/index-abc.js') +
      link('modulepreload', '/assets/js/vendor-tiptap-xyz.js');

    const out = stripRuntimePreloads(html, allowed);
    expect(out).toContain('index-abc.js');
    expect(out).not.toContain('vendor-tiptap');
  });

  it('drops a modulepreload with no href, which preloads nothing', () => {
    expect(stripRuntimePreloads('<link rel="modulepreload">', allowed)).toBe('');
  });

  it('leaves every other kind of link alone', () => {
    // AC5: the prerender output is unchanged apart from the modulepreload
    // tags. A stylesheet or a canonical going missing would be a far worse bug
    // than the one being fixed.
    const html = [
      link('stylesheet', '/assets/css/index-abc.css'),
      link('canonical', 'https://tryeatpal.com/'),
      link('preload', '/fonts/inter.woff2'),
      link('apple-touch-icon', '/icon.png'),
      link('modulepreload', '/assets/js/vendor-swagger-xyz.js'),
    ].join('');

    const out = stripRuntimePreloads(html, allowed);
    expect(out).toContain('index-abc.css');
    expect(out).toContain('canonical');
    expect(out).toContain('inter.woff2');
    expect(out).toContain('apple-touch-icon');
    expect(out).not.toContain('vendor-swagger');
  });

  it('touches nothing else in the document', () => {
    const html =
      '<!doctype html><html><head><title>EatPal</title>' +
      '<script type="application/ld+json">{"@type":"Organization"}</script>' +
      link('modulepreload', '/assets/js/runtime-only.js') +
      '</head><body><div id="root"><h1>Picky eating help</h1></div></body></html>';

    const out = stripRuntimePreloads(html, allowed);
    expect(out).toContain('<title>EatPal</title>');
    expect(out).toContain('application/ld+json');
    expect(out).toContain('<h1>Picky eating help</h1>');
    expect(out).not.toContain('runtime-only.js');
  });

  it('is a no-op when everything was declared', () => {
    const html =
      link('modulepreload', '/assets/js/index-abc.js') +
      link('modulepreload', '/assets/js/vendor-react-def.js');
    expect(stripRuntimePreloads(html, allowed)).toBe(html);
  });
});

describe('the budget check knows about prerendered pages', () => {
  it('budgets app-shell and the prerendered home page separately', async () => {
    // AC4: they drift. app-shell is what Cloudflare serves for a route we do
    // not prerender; index.html is the marketing page a new visitor lands on,
    // and it is built a different way.
    const { readFileSync } = await import('fs');
    const budget = JSON.parse(readFileSync('.ci/bundle-budget.json', 'utf8'));

    expect(Object.keys(budget.preloadedHtml ?? {}).sort()).toEqual([
      'app-shell.html',
      'index.html',
    ]);
    for (const limit of Object.values(budget.preloadedHtml)) {
      expect(typeof limit).toBe('number');
    }
  });
});
