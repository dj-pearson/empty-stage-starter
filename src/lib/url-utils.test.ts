import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseQueryString,
  buildQueryString,
  addQueryParam,
  addQueryParams,
  removeQueryParam,
  removeQueryParams,
  parseUrl,
  buildUrl,
  isAbsoluteUrl,
  isRelativeUrl,
  isExternalUrl,
  joinPaths,
  normalizeUrl,
  getDomain,
  getRootDomain,
  getSubdomain,
  isValidUrl,
  sanitizeUrl,
  createDeepLink,
  parseDeepLink,
  createSocialShareUrl,
  addUTMParams,
  getUTMParams,
  removeUTMParams,
} from './url-utils';

describe('URL Utilities', () => {
  describe('parseQueryString', () => {
    it('should parse simple query strings', () => {
      const result = parseQueryString('?foo=bar&baz=qux');
      expect(result).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('should parse without leading question mark', () => {
      const result = parseQueryString('foo=bar&baz=qux');
      expect(result).toEqual({ foo: 'bar', baz: 'qux' });
    });

    it('should handle array parameters', () => {
      const result = parseQueryString('?tags=js&tags=react&tags=vue');
      expect(result).toEqual({ tags: ['js', 'react', 'vue'] });
    });

    it('should handle empty values', () => {
      const result = parseQueryString('?foo=&bar=baz');
      expect(result).toEqual({ foo: '', bar: 'baz' });
    });

    it('should decode URL encoded values', () => {
      const result = parseQueryString('?message=Hello%20World&emoji=%F0%9F%98%80');
      expect(result.message).toBe('Hello World');
    });

    it('should return empty object for empty string', () => {
      expect(parseQueryString('')).toEqual({});
      expect(parseQueryString('?')).toEqual({});
    });
  });

  describe('buildQueryString', () => {
    it('should build simple query strings', () => {
      const result = buildQueryString({ foo: 'bar', baz: 'qux' });
      expect(result).toBe('foo=bar&baz=qux');
    });

    it('should handle array values', () => {
      const result = buildQueryString({ tags: ['js', 'react', 'vue'] });
      expect(result).toBe('tags=js&tags=react&tags=vue');
    });

    it('should skip null and undefined values', () => {
      const result = buildQueryString({ foo: 'bar', baz: null, qux: undefined });
      expect(result).toBe('foo=bar');
    });

    it('should encode special characters', () => {
      const result = buildQueryString({ message: 'Hello World', path: '/foo/bar' });
      expect(result).toContain('Hello%20World');
      expect(result).toContain('%2Ffoo%2Fbar');
    });

    it('should handle number and boolean values', () => {
      const result = buildQueryString({ count: 42, active: true });
      expect(result).toBe('count=42&active=true');
    });
  });

  describe('addQueryParam', () => {
    it('should add param to URL without query string', () => {
      const result = addQueryParam('/path', 'foo', 'bar');
      expect(result).toBe('/path?foo=bar');
    });

    it('should add param to URL with existing query string', () => {
      const result = addQueryParam('/path?existing=true', 'foo', 'bar');
      expect(result).toBe('/path?existing=true&foo=bar');
    });

    it('should update existing param', () => {
      const result = addQueryParam('/path?foo=old', 'foo', 'new');
      expect(result).toBe('/path?foo=new');
    });
  });

  describe('addQueryParams', () => {
    it('should add multiple params', () => {
      const result = addQueryParams('/path', { foo: 'bar', baz: 'qux' });
      expect(result).toContain('foo=bar');
      expect(result).toContain('baz=qux');
    });

    it('should merge with existing params', () => {
      const result = addQueryParams('/path?existing=true', { foo: 'bar' });
      expect(result).toContain('existing=true');
      expect(result).toContain('foo=bar');
    });
  });

  describe('removeQueryParam', () => {
    it('should remove specified param', () => {
      const result = removeQueryParam('/path?foo=bar&baz=qux', 'foo');
      expect(result).toBe('/path?baz=qux');
    });

    it('should return path without query string if last param removed', () => {
      const result = removeQueryParam('/path?foo=bar', 'foo');
      expect(result).toBe('/path');
    });

    it('should handle non-existent param', () => {
      const result = removeQueryParam('/path?foo=bar', 'nonexistent');
      expect(result).toBe('/path?foo=bar');
    });
  });

  describe('removeQueryParams', () => {
    it('should remove multiple params', () => {
      const result = removeQueryParams('/path?foo=bar&baz=qux&hello=world', ['foo', 'baz']);
      expect(result).toBe('/path?hello=world');
    });
  });

  describe('parseUrl', () => {
    it('should parse complete URL', () => {
      const result = parseUrl('https://example.com:8080/path?foo=bar#section');

      expect(result).toBeDefined();
      expect(result?.protocol).toBe('https:');
      expect(result?.hostname).toBe('example.com');
      expect(result?.port).toBe('8080');
      expect(result?.pathname).toBe('/path');
      expect(result?.search).toBe('?foo=bar');
      expect(result?.hash).toBe('#section');
      expect(result?.params).toEqual({ foo: 'bar' });
    });

    it('should return null for invalid URL', () => {
      const result = parseUrl('not-a-url');
      expect(result).toBeNull();
    });
  });

  describe('buildUrl', () => {
    it('should build URL from components', () => {
      const result = buildUrl({
        protocol: 'https:',
        hostname: 'example.com',
        pathname: '/path',
        params: { foo: 'bar' },
      });

      expect(result).toBe('https://example.com/path?foo=bar');
    });

    it('should handle port', () => {
      const result = buildUrl({
        protocol: 'https:',
        hostname: 'example.com',
        port: '8080',
        pathname: '/path',
      });

      expect(result).toBe('https://example.com:8080/path');
    });

    it('should handle hash', () => {
      const result = buildUrl({
        hostname: 'example.com',
        pathname: '/path',
        hash: '#section',
      });

      expect(result).toContain('#section');
    });
  });

  describe('isAbsoluteUrl', () => {
    it('should identify absolute URLs', () => {
      expect(isAbsoluteUrl('https://example.com')).toBe(true);
      expect(isAbsoluteUrl('http://example.com')).toBe(true);
      expect(isAbsoluteUrl('ftp://example.com')).toBe(true);
    });

    it('should identify relative URLs', () => {
      expect(isAbsoluteUrl('/path')).toBe(false);
      expect(isAbsoluteUrl('path')).toBe(false);
      expect(isAbsoluteUrl('./path')).toBe(false);
    });
  });

  describe('isRelativeUrl', () => {
    it('should identify relative URLs', () => {
      expect(isRelativeUrl('/path')).toBe(true);
      expect(isRelativeUrl('path')).toBe(true);
      expect(isRelativeUrl('./path')).toBe(true);
    });

    it('should identify absolute URLs', () => {
      expect(isRelativeUrl('https://example.com')).toBe(false);
    });
  });

  describe('joinPaths', () => {
    it('should join paths correctly', () => {
      expect(joinPaths('/api', 'users', '123')).toBe('/api/users/123');
    });

    it('should handle leading and trailing slashes', () => {
      expect(joinPaths('/api/', '/users/', '/123')).toBe('/api/users/123');
    });

    it('should handle empty strings', () => {
      expect(joinPaths('/api', '', 'users')).toBe('/api/users');
    });
  });

  describe('normalizeUrl', () => {
    it('should remove trailing slash', () => {
      const result = normalizeUrl('https://example.com/path/');
      expect(result).toBe('https://example.com/path');
    });

    it('should preserve root trailing slash', () => {
      const result = normalizeUrl('https://example.com/');
      expect(result).toBe('https://example.com/');
    });

    it('should sort query parameters', () => {
      const result = normalizeUrl('https://example.com?z=1&a=2&m=3');
      expect(result).toBe('https://example.com?a=2&m=3&z=1');
    });
  });

  describe('getDomain', () => {
    it('should extract domain', () => {
      expect(getDomain('https://example.com/path')).toBe('example.com');
      expect(getDomain('https://www.example.com')).toBe('example.com');
    });

    it('should return empty string for invalid URL', () => {
      expect(getDomain('not-a-url')).toBe('');
    });
  });

  describe('getRootDomain', () => {
    it('should extract root domain from subdomain', () => {
      expect(getRootDomain('https://blog.example.com')).toBe('example.com');
      expect(getRootDomain('https://api.blog.example.com')).toBe('example.com');
    });

    it('should handle country-specific TLDs', () => {
      expect(getRootDomain('https://blog.example.co.uk')).toBe('example.co.uk');
    });

    it('should return hostname for simple domains', () => {
      expect(getRootDomain('https://example.com')).toBe('example.com');
    });
  });

  describe('getSubdomain', () => {
    it('should extract subdomain', () => {
      expect(getSubdomain('https://blog.example.com')).toBe('blog');
      expect(getSubdomain('https://api.blog.example.com')).toBe('api.blog');
    });

    it('should return null for no subdomain', () => {
      expect(getSubdomain('https://example.com')).toBeNull();
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com/path?query=value')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('htp://wrong-protocol')).toBe(false);
    });
  });

  describe('sanitizeUrl', () => {
    it('should allow http and https', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
    });

    it('should reject javascript protocol', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('should reject data URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });
  });

  describe('createDeepLink', () => {
    it('should create deep link', () => {
      const result = createDeepLink('myapp', '/profile', { id: '123' });
      expect(result).toBe('myapp://profile?id=123');
    });

    it('should handle path without leading slash', () => {
      const result = createDeepLink('myapp', 'profile');
      expect(result).toBe('myapp://profile');
    });

    it('should handle no params', () => {
      const result = createDeepLink('myapp', '/profile');
      expect(result).toBe('myapp://profile');
    });
  });

  describe('parseDeepLink', () => {
    it('should parse deep link', () => {
      const result = parseDeepLink('myapp://profile?id=123');

      expect(result).toBeDefined();
      expect(result?.scheme).toBe('myapp');
      expect(result?.path).toBe('/profile');
      expect(result?.params).toEqual({ id: '123' });
    });

    it('should return null for invalid deep link', () => {
      const result = parseDeepLink('not-a-deep-link');
      expect(result).toBeNull();
    });
  });

  describe('createSocialShareUrl', () => {
    const url = 'https://example.com';
    const text = 'Check this out!';

    it('should create Facebook share URL', () => {
      const result = createSocialShareUrl('facebook', url, text);
      expect(result).toContain('facebook.com');
      expect(result).toContain(encodeURIComponent(url));
    });

    it('should create Twitter share URL', () => {
      const result = createSocialShareUrl('twitter', url, text);
      expect(result).toContain('twitter.com');
      expect(result).toContain(encodeURIComponent(url));
      expect(result).toContain(encodeURIComponent(text));
    });

    it('should create LinkedIn share URL', () => {
      const result = createSocialShareUrl('linkedin', url, text);
      expect(result).toContain('linkedin.com');
      expect(result).toContain(encodeURIComponent(url));
    });

    it('should create WhatsApp share URL', () => {
      const result = createSocialShareUrl('whatsapp', url, text);
      expect(result).toContain('wa.me');
      expect(result).toContain(encodeURIComponent(url));
    });

    it('should create email share URL', () => {
      const result = createSocialShareUrl('email', url, text);
      expect(result).toContain('mailto:');
      expect(result).toContain(encodeURIComponent(url));
    });
  });

  describe('UTM parameters', () => {
    const utmParams = {
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'summer-sale',
    };

    describe('addUTMParams', () => {
      it('should add UTM parameters', () => {
        const result = addUTMParams('https://example.com/path', utmParams);
        expect(result).toContain('utm_source=newsletter');
        expect(result).toContain('utm_medium=email');
        expect(result).toContain('utm_campaign=summer-sale');
      });

      it('should merge with existing params', () => {
        const result = addUTMParams('https://example.com/path?foo=bar', utmParams);
        expect(result).toContain('foo=bar');
        expect(result).toContain('utm_source=newsletter');
      });
    });

    describe('removeUTMParams', () => {
      it('should remove all UTM parameters', () => {
        const url =
          'https://example.com?foo=bar&utm_source=google&utm_medium=cpc&utm_campaign=test';
        const result = removeUTMParams(url);

        expect(result).toContain('foo=bar');
        expect(result).not.toContain('utm_source');
        expect(result).not.toContain('utm_medium');
        expect(result).not.toContain('utm_campaign');
      });
    });
  });
});
