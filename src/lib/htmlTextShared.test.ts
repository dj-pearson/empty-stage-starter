// Vitest mirror for supabase/functions/_shared/htmlText.ts, the page-to-text
// step both admin SEO tools run before prompting a model.
import { describe, expect, it } from 'vitest';
import {
  decodeBasicEntities,
  dropRawTextElements,
  extractTextContent,
} from '../../supabase/functions/_shared/htmlText';

describe('dropRawTextElements', () => {
  it('drops script and style bodies, whatever the close tag looks like', () => {
    const html = '<p>a</p><script>x()</script ><STYLE>p{}</STYLE\n><p>b</p><script type="m">y()</script>';
    const out = dropRawTextElements(html);
    expect(out).not.toMatch(/x\(\)|y\(\)|p\{\}/);
    expect(out).toContain('<p>a</p>');
    expect(out).toContain('<p>b</p>');
  });

  it('drops an unclosed script to the end, as a browser does', () => {
    expect(dropRawTextElements('<p>keep</p><script>steal()')).toBe('<p>keep</p>');
  });
});

describe('decodeBasicEntities', () => {
  it('decodes each entity once, so &amp;lt; stays a literal "&lt;"', () => {
    expect(decodeBasicEntities('&amp;lt;b&amp;gt; &lt;i&gt; &quot;x&quot; &#39;y&#39;&nbsp;z')).toBe(
      `&lt;b&gt; <i> "x" 'y' z`
    );
  });
});

describe('extractTextContent', () => {
  it('prefers <main>, strips tags and collapses whitespace', () => {
    const html =
      '<html><head><style>.a{}</style></head><body><nav>Menu</nav>' +
      '<main><h1>Picky   eaters</h1>\n<p>Try &amp; repeat.</p><script>track()</script ></main></body></html>';
    expect(extractTextContent(html)).toBe('Picky eaters Try & repeat.');
  });

  it('falls back to <article>, then to the whole page', () => {
    expect(extractTextContent('<div>x</div><article><p>Body</p></article>')).toBe('Body');
    expect(extractTextContent('<div>One</div><div>Two</div>')).toBe('One Two');
  });
});
