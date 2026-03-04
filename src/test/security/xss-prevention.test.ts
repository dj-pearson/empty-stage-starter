import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeText } from '@/lib/sanitize';

describe('XSS Prevention - Advanced Vectors', () => {
  describe('Event handler attacks', () => {
    const handlers = [
      '<div onerror="alert(1)">',
      '<img onload="alert(1)">',
      '<body onfocus="alert(1)">',
      '<input onblur="alert(1)">',
      '<form onsubmit="alert(1)">',
      '<video onplay="alert(1)">',
      '<details ontoggle="alert(1)">',
      '<marquee onstart="alert(1)">',
    ];

    it.each(handlers)('strips event handler: %s', (payload) => {
      const result = sanitizeHtml(payload);
      expect(result).not.toMatch(/\bon\w+\s*=/i);
    });
  });

  describe('Protocol-based attacks', () => {
    it('blocks javascript: in href', () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
      expect(result).not.toMatch(/javascript:/i);
    });

    it('blocks direct onload attribute on img tags', () => {
      const result = sanitizeHtml('<img src="test.jpg" onload="alert(1)">');
      // DOMPurify strips event handler attributes from HTML elements
      expect(result).not.toContain('onload');
      expect(result).not.toContain('alert');
    });
  });

  describe('Encoding bypass attempts', () => {
    it('handles HTML entity encoded payloads', () => {
      const result = sanitizeText('&#60;script&#62;alert(1)&#60;/script&#62;');
      expect(result).not.toContain('<script');
    });

    it('handles mixed case bypass', () => {
      const result = sanitizeHtml('<ScRiPt>alert(1)</ScRiPt>');
      expect(result).not.toContain('<script');
      expect(result).not.toContain('ScRiPt');
    });

    it('handles null byte injection', () => {
      const result = sanitizeHtml('<scri\x00pt>alert(1)</scri\x00pt>');
      // DOMPurify strips the broken script tags
      expect(result).not.toContain('<script');
      expect(result).not.toContain('</script');
    });
  });

  describe('DOM-based XSS vectors', () => {
    it('strips innerHTML assignment', () => {
      const result = sanitizeText('document.getElementById("x").innerHTML = "<img src=x onerror=alert(1)>"');
      // sanitizeText strips all HTML
      expect(result).not.toContain('<img');
    });

    it('strips document.write', () => {
      const result = sanitizeHtml('<script>document.write("<img onerror=alert(1)>")</script>');
      expect(result).not.toContain('document.write');
      expect(result).not.toContain('<script');
    });
  });

  describe('SVG-based attacks', () => {
    it('strips SVG with embedded script', () => {
      const result = sanitizeHtml('<svg><script>alert(1)</script></svg>');
      expect(result).not.toContain('<script');
    });

    it('strips SVG onload', () => {
      const result = sanitizeHtml('<svg onload=alert(1)>');
      expect(result).not.toContain('onload');
    });
  });
});
