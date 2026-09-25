import { describe, it, expect } from 'vitest';
import { sanitizeHTML, sanitizeInput } from './validations';

describe('sanitizeHTML', () => {
  it('escapes every HTML-significant character', () => {
    expect(sanitizeHTML(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('leaves nothing that can open a tag, however the input nests it', () => {
    for (const input of ['<scr<script>ipt>alert(1)</script>', '<!--<script>-->', '<img src=x onerror=alert(1)>']) {
      expect(sanitizeHTML(input)).not.toMatch(/[<>"']/);
    }
  });

  it('returns an empty string for a non-string', () => {
    expect(sanitizeHTML(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeInput', () => {
  it('strips tags and keeps the text between them', () => {
    expect(sanitizeInput('  <b>Mac</b> and <i>cheese</i> ')).toBe('Mac and cheese');
  });

  it('never returns an angle bracket, even from nested or unclosed tags', () => {
    for (const input of ['<scr<script>ipt>alert(1)</script>', '<<img src=x onerror=alert(1)>>', 'a > b', '<!-- x']) {
      expect(sanitizeInput(input)).not.toMatch(/[<>]/);
    }
  });

  it('keeps the text after a "<" that never closes', () => {
    expect(sanitizeInput('x < 5')).toBe('x  5');
    expect(sanitizeInput('5 > x')).toBe('5  x');
  });

  it('removes SQL comment and statement separators and null bytes', () => {
    expect(sanitizeInput("1; DROP TABLE foods -- x\0")).toBe('1 DROP TABLE foods  x');
  });
});
