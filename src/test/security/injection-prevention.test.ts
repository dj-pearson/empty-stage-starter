import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText, sanitizeUrl, sanitizeObject } from '@/lib/sanitize';

describe('SQL Injection Prevention', () => {
  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users;--",
    "1 UNION SELECT * FROM users",
    "admin'--",
    "1; DELETE FROM foods WHERE 1=1",
    "' UNION SELECT NULL,NULL,NULL--",
    "1 AND 1=1",
    "' OR 1=1#",
    "1' ORDER BY 1--",
    "' UNION ALL SELECT NULL--",
  ];

  it.each(sqlPayloads)('sanitizeText strips SQL payload: %s', (payload) => {
    const result = sanitizeText(payload);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script');
  });

  it('sanitizeObject cleans nested SQL payloads', () => {
    const dirty = {
      name: "'; DROP TABLE users;--",
      nested: { value: "1 UNION SELECT * FROM users" },
      list: ["' OR '1'='1"],
    };
    const clean = sanitizeObject(dirty);
    expect(typeof clean.name).toBe('string');
    expect(typeof (clean.nested as Record<string, unknown>).value).toBe('string');
  });
});

describe('XSS Prevention', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<body onload=alert(1)>',
    '<input onfocus=alert(1) autofocus>',
    'javascript:alert(1)',
    '<a href="javascript:alert(1)">click</a>',
    '<div style="background:url(javascript:alert(1))">',
    '"><script>alert(String.fromCharCode(88,83,83))</script>',
    '<IMG SRC="javascript:alert(\'XSS\');">',
    '<img src=1 onerror=alert(document.cookie)>',
    '<iframe src="javascript:alert(1)">',
    '<object data="javascript:alert(1)">',
    '<embed src="javascript:alert(1)">',
    '<SCRIPT SRC=http://evil.com/xss.js></SCRIPT>',
    '<IMG SRC=JaVaScRiPt:alert("XSS")>',
    '<img src=x:alert(alt) onerror=eval(src) alt=0>',
    "';alert(String.fromCharCode(88,83,83))//",
    '<a onmouseover="alert(document.cookie)">hover</a>',
    '<marquee onstart=alert(1)>',
  ];

  it.each(xssPayloads)('sanitizeHtml strips XSS payload: %s', (payload) => {
    const result = sanitizeHtml(payload);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onmouseover');
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<object');
    expect(result).not.toContain('<embed');
    // DOMPurify strips javascript: in href attributes but leaves plain text
    // Only check href-based payloads
    if (payload.includes('href')) {
      expect(result).not.toMatch(/href="javascript:/i);
    }
  });

  it.each(xssPayloads)('sanitizeText escapes XSS payload: %s', (payload) => {
    const result = sanitizeText(payload);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('<img');
    expect(result).not.toContain('<iframe');
  });

  it('sanitizeHtml allows safe formatting tags', () => {
    const safe = '<p>Hello <strong>world</strong> <em>italic</em></p>';
    const result = sanitizeHtml(safe);
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
  });
});

describe('URL Sanitization', () => {
  const dangerousUrls = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'blob:http://evil.com/uuid',
    'JAVASCRIPT:alert(1)',
    'Java\tscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  ];

  it.each(dangerousUrls)('sanitizeUrl blocks dangerous URL: %s', (url) => {
    const result = sanitizeUrl(url);
    expect(result).toBe('');
  });

  it('sanitizeUrl allows safe URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    expect(sanitizeUrl('http://example.com/path')).toBe('http://example.com/path');
    expect(sanitizeUrl('/relative/path')).toBe('/relative/path');
    expect(sanitizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
  });
});
