import { describe, it, expect } from 'vitest';
import {
  generateCanonicalUrl,
  generateOGImageUrl,
  extractMetaDescription,
  generateKeywords,
  validateMetaTitle,
  validateMetaDescription,
  generateTwitterCardTags,
  generateOpenGraphTags,
  generateSlug,
  calculateReadingTime,
  isIndexable,
  generateHreflangTags,
} from './seo-helpers';

describe('generateCanonicalUrl', () => {
  it('combines base URL and path', () => {
    expect(generateCanonicalUrl('https://tryeatpal.com', '/blog')).toBe('https://tryeatpal.com/blog');
  });

  it('removes trailing slash from base URL', () => {
    expect(generateCanonicalUrl('https://tryeatpal.com/', '/blog')).toBe('https://tryeatpal.com/blog');
  });

  it('adds leading slash to path if missing', () => {
    expect(generateCanonicalUrl('https://tryeatpal.com', 'blog')).toBe('https://tryeatpal.com/blog');
  });

  it('removes trailing slash from path', () => {
    expect(generateCanonicalUrl('https://tryeatpal.com', '/blog/')).toBe('https://tryeatpal.com/blog');
  });

  it('handles root path', () => {
    expect(generateCanonicalUrl('https://tryeatpal.com', '/')).toBe('https://tryeatpal.com/');
  });
});

describe('generateOGImageUrl', () => {
  it('returns full URL unchanged', () => {
    expect(generateOGImageUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg');
  });

  it('appends query parameters for relative paths', () => {
    const url = generateOGImageUrl('/images/hero.jpg');
    expect(url).toContain('w=1200');
    expect(url).toContain('h=630');
    expect(url).toContain('fm=jpg');
    expect(url).toContain('q=85');
  });

  it('uses custom options', () => {
    const url = generateOGImageUrl('/images/hero.jpg', {
      width: 800,
      height: 400,
      format: 'webp',
      quality: 90,
    });
    expect(url).toContain('w=800');
    expect(url).toContain('h=400');
    expect(url).toContain('fm=webp');
    expect(url).toContain('q=90');
  });
});

describe('extractMetaDescription', () => {
  it('returns short content as-is', () => {
    expect(extractMetaDescription('Short text')).toBe('Short text');
  });

  it('strips HTML tags', () => {
    expect(extractMetaDescription('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('truncates long content at word boundary', () => {
    const longText = 'word '.repeat(50); // 250 chars
    const result = extractMetaDescription(longText);
    expect(result.length).toBeLessThanOrEqual(163); // 160 + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('respects custom maxLength', () => {
    const text = 'This is a somewhat long text that exceeds fifty characters in total length';
    const result = extractMetaDescription(text, 50);
    expect(result.length).toBeLessThanOrEqual(53); // 50 + '...'
  });

  it('collapses whitespace', () => {
    expect(extractMetaDescription('  hello   world  ')).toBe('hello world');
  });
});

describe('generateKeywords', () => {
  it('extracts top keywords from content', () => {
    const content = 'meal planning meal prep cooking recipes meal ideas healthy cooking tips';
    const keywords = generateKeywords(content);
    expect(keywords).toContain('meal');
    expect(keywords).toContain('cooking');
  });

  it('excludes stop words', () => {
    const content = 'the best meal is a great meal for the family';
    const keywords = generateKeywords(content);
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('for');
  });

  it('respects count option', () => {
    const content = 'one two three four five six seven eight nine ten eleven twelve';
    const keywords = generateKeywords(content, { count: 3 });
    const wordCount = keywords.split(', ').length;
    expect(wordCount).toBeLessThanOrEqual(3);
  });

  it('respects minLength option', () => {
    const content = 'I am ok but hello world testing';
    const keywords = generateKeywords(content, { minLength: 5 });
    // Should exclude words shorter than 5 chars
    expect(keywords).not.toContain('ok');
  });

  it('strips HTML before processing', () => {
    const content = '<h1>Meal Planning</h1><p>Great recipes for kids</p>';
    const keywords = generateKeywords(content);
    expect(keywords).toContain('meal');
    expect(keywords).toContain('planning');
  });
});

describe('validateMetaTitle', () => {
  it('returns invalid for titles under 30 chars', () => {
    const result = validateMetaTitle('Short');
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('too short');
  });

  it('returns invalid for titles over 70 chars', () => {
    const longTitle = 'a'.repeat(71);
    const result = validateMetaTitle(longTitle);
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('too long');
  });

  it('returns valid with warning for 30-49 char titles', () => {
    const title = 'a'.repeat(40);
    const result = validateMetaTitle(title);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeDefined();
  });

  it('returns valid without warning for optimal 50-60 char titles', () => {
    const title = 'a'.repeat(55);
    const result = validateMetaTitle(title);
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('returns correct length', () => {
    const result = validateMetaTitle('Hello World');
    expect(result.length).toBe(11);
  });
});

describe('validateMetaDescription', () => {
  it('returns invalid for descriptions under 70 chars', () => {
    const result = validateMetaDescription('Short description');
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('too short');
  });

  it('returns invalid for descriptions over 160 chars', () => {
    const result = validateMetaDescription('a'.repeat(161));
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('too long');
  });

  it('returns valid with warning for 70-119 char descriptions', () => {
    const result = validateMetaDescription('a'.repeat(100));
    expect(result.valid).toBe(true);
    expect(result.warning).toContain('could be longer');
  });

  it('returns valid without warning for optimal 120-160 char descriptions', () => {
    const result = validateMetaDescription('a'.repeat(140));
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});

describe('generateTwitterCardTags', () => {
  it('generates required Twitter Card tags', () => {
    const tags = generateTwitterCardTags({
      title: 'Test Title',
      description: 'Test description',
      image: 'https://example.com/image.jpg',
    });

    expect(tags['twitter:card']).toBe('summary_large_image');
    expect(tags['twitter:title']).toBe('Test Title');
    expect(tags['twitter:description']).toBe('Test description');
    expect(tags['twitter:image']).toBe('https://example.com/image.jpg');
  });

  it('uses default values for optional fields', () => {
    const tags = generateTwitterCardTags({
      title: 'Test',
      description: 'Test',
      image: 'https://example.com/image.jpg',
    });

    expect(tags['twitter:site']).toBe('@eatpal');
    expect(tags['twitter:creator']).toBe('@eatpal');
  });

  it('uses custom values when provided', () => {
    const tags = generateTwitterCardTags({
      title: 'Test',
      description: 'Test',
      image: 'https://example.com/image.jpg',
      card: 'summary',
      site: '@custom',
      creator: '@author',
      imageAlt: 'Custom alt',
    });

    expect(tags['twitter:card']).toBe('summary');
    expect(tags['twitter:site']).toBe('@custom');
    expect(tags['twitter:creator']).toBe('@author');
    expect(tags['twitter:image:alt']).toBe('Custom alt');
  });
});

describe('generateOpenGraphTags', () => {
  it('generates required OG tags', () => {
    const tags = generateOpenGraphTags({
      title: 'Test Title',
      description: 'Test description',
      url: 'https://example.com',
      image: 'https://example.com/image.jpg',
    });

    expect(tags['og:title']).toBe('Test Title');
    expect(tags['og:description']).toBe('Test description');
    expect(tags['og:url']).toBe('https://example.com');
    expect(tags['og:image']).toBe('https://example.com/image.jpg');
    expect(tags['og:type']).toBe('website');
  });

  it('includes article metadata for article type', () => {
    const tags = generateOpenGraphTags({
      title: 'Article',
      description: 'Test',
      url: 'https://example.com',
      image: 'https://example.com/image.jpg',
      type: 'article',
      publishedTime: '2026-01-01',
      modifiedTime: '2026-01-02',
      author: 'John Doe',
    });

    expect(tags['article:published_time']).toBe('2026-01-01');
    expect(tags['article:modified_time']).toBe('2026-01-02');
    expect(tags['article:author']).toBe('John Doe');
  });

  it('does not include article metadata for non-article types', () => {
    const tags = generateOpenGraphTags({
      title: 'Test',
      description: 'Test',
      url: 'https://example.com',
      image: 'https://example.com/image.jpg',
      type: 'website',
      publishedTime: '2026-01-01',
    });

    expect(tags['article:published_time']).toBeUndefined();
  });

  it('includes image dimensions', () => {
    const tags = generateOpenGraphTags({
      title: 'Test',
      description: 'Test',
      url: 'https://example.com',
      image: 'https://example.com/image.jpg',
    });

    expect(tags['og:image:width']).toBe('1200');
    expect(tags['og:image:height']).toBe('630');
  });
});

describe('generateSlug', () => {
  it('converts to lowercase', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(generateSlug('meal planning tips')).toBe('meal-planning-tips');
  });

  it('removes special characters', () => {
    expect(generateSlug("What's for Dinner?")).toBe('whats-for-dinner');
  });

  it('removes multiple consecutive hyphens', () => {
    expect(generateSlug('foo---bar')).toBe('foo-bar');
  });

  it('removes leading and trailing hyphens', () => {
    expect(generateSlug('-hello-')).toBe('hello');
  });
});

describe('calculateReadingTime', () => {
  it('returns "1 min read" for short content', () => {
    expect(calculateReadingTime('short text')).toBe('1 min read');
  });

  it('calculates based on word count at 200 WPM', () => {
    const words = 'word '.repeat(400); // 400 words
    expect(calculateReadingTime(words)).toBe('2 min read');
  });

  it('strips HTML before counting', () => {
    const html = '<p>' + 'word '.repeat(600) + '</p>';
    expect(calculateReadingTime(html)).toBe('3 min read');
  });

  it('respects custom WPM', () => {
    const words = 'word '.repeat(300); // 300 words at 100 WPM = 3 min
    expect(calculateReadingTime(words, 100)).toBe('3 min read');
  });
});

describe('isIndexable', () => {
  it('returns true for public pages', () => {
    expect(isIndexable('https://tryeatpal.com/')).toBe(true);
    expect(isIndexable('https://tryeatpal.com/blog/article')).toBe(true);
    expect(isIndexable('https://tryeatpal.com/pricing')).toBe(true);
  });

  it('returns false for protected paths', () => {
    expect(isIndexable('https://tryeatpal.com/dashboard/')).toBe(false);
    expect(isIndexable('https://tryeatpal.com/admin/users')).toBe(false);
    expect(isIndexable('https://tryeatpal.com/auth/login')).toBe(false);
    expect(isIndexable('https://tryeatpal.com/api/health')).toBe(false);
  });

  it('returns false for auth pages', () => {
    expect(isIndexable('https://tryeatpal.com/login')).toBe(false);
    expect(isIndexable('https://tryeatpal.com/signup')).toBe(false);
    expect(isIndexable('https://tryeatpal.com/reset-password')).toBe(false);
  });
});

describe('generateHreflangTags', () => {
  it('generates tags with language and region', () => {
    const tags = generateHreflangTags('https://tryeatpal.com', '/blog', [
      { lang: 'en', region: 'US' },
      { lang: 'es', region: 'MX' },
    ]);

    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual({
      rel: 'alternate',
      hreflang: 'en-US',
      href: 'https://tryeatpal.com/blog',
    });
    expect(tags[1]).toEqual({
      rel: 'alternate',
      hreflang: 'es-MX',
      href: 'https://tryeatpal.com/blog',
    });
  });

  it('generates tags with language only', () => {
    const tags = generateHreflangTags('https://tryeatpal.com', '/blog', [
      { lang: 'en' },
    ]);

    expect(tags[0].hreflang).toBe('en');
  });

  it('uses custom URLs when provided', () => {
    const tags = generateHreflangTags('https://tryeatpal.com', '/blog', [
      { lang: 'fr', url: 'https://fr.tryeatpal.com/blog' },
    ]);

    expect(tags[0].href).toBe('https://fr.tryeatpal.com/blog');
  });
});
