/**
 * SEO Helper Utilities
 *
 * Additional utilities for SEO optimization including meta tag generation,
 * canonical URL management, and social sharing optimization.
 */

/**
 * Generate canonical URL ensuring proper format
 *
 * Usage:
 * ```tsx
 * const canonical = generateCanonicalUrl('https://tryeatpal.com', '/blog/article-name');
 * // Returns: "https://tryeatpal.com/blog/article-name"
 * ```
 */
export function generateCanonicalUrl(baseUrl: string, path: string): string {
  // Remove trailing slash from base URL
  const cleanBase = baseUrl.replace(/\/$/, '');

  // Ensure path starts with /
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // Remove trailing slash from path (except for root)
  const finalPath = cleanPath === '/' ? '/' : cleanPath.replace(/\/$/, '');

  return `${cleanBase}${finalPath}`;
}

/**
 * Generate Open Graph image URL with optimal dimensions
 *
 * Usage:
 * ```tsx
 * const ogImage = generateOGImageUrl('/images/article.jpg', {
 *   width: 1200,
 *   height: 630,
 *   format: 'jpg',
 * });
 * ```
 */
export interface OGImageOptions {
  width?: number;
  height?: number;
  format?: 'jpg' | 'png' | 'webp';
  quality?: number;
}

export function generateOGImageUrl(
  imagePath: string,
  options: OGImageOptions = {}
): string {
  const { width = 1200, height = 630, format = 'jpg', quality = 85 } = options;

  // If it's already a full URL, return it
  if (imagePath.startsWith('http')) {
    return imagePath;
  }

  // Build query parameters for image optimization
  const params = new URLSearchParams({
    w: width.toString(),
    h: height.toString(),
    fm: format,
    q: quality.toString(),
    fit: 'cover',
  });

  return `${imagePath}?${params.toString()}`;
}

/**
 * Extract meta description from content
 *
 * Truncates content to optimal meta description length (155-160 characters)
 *
 * Usage:
 * ```tsx
 * const description = extractMetaDescription(blogContent);
 * ```
 */
export function extractMetaDescription(
  content: string,
  maxLength: number = 160
): string {
  // Strip HTML tags
  const text = content.replace(/<[^>]*>/g, '');

  // Remove extra whitespace
  const cleaned = text.replace(/\s+/g, ' ').trim();

  // Truncate to maxLength, ensuring we don't cut mid-word
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const truncated = cleaned.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  return `${truncated.substring(0, lastSpace)}...`;
}

/**
 * Generate keywords from content
 *
 * Extracts most common words from content (excluding stop words)
 *
 * Usage:
 * ```tsx
 * const keywords = generateKeywords(content, { count: 10 });
 * // Returns: "keyword1, keyword2, keyword3, ..."
 * ```
 */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'will',
  'with',
]);

export interface KeywordOptions {
  count?: number;
  minLength?: number;
}

export function generateKeywords(
  content: string,
  options: KeywordOptions = {}
): string {
  const { count = 10, minLength = 3 } = options;

  // Strip HTML and convert to lowercase
  const text = content.replace(/<[^>]*>/g, '').toLowerCase();

  // Extract words
  const words = text.match(/\b[a-z]+\b/g) || [];

  // Count word frequency (excluding stop words)
  const wordFreq = new Map<string, number>();

  words.forEach((word) => {
    if (word.length >= minLength && !STOP_WORDS.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  });

  // Sort by frequency and get top N
  const topWords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);

  return topWords.join(', ');
}

/**
 * Validate meta title length
 *
 * Optimal: 50-60 characters
 * Maximum: 70 characters (Google truncates beyond this)
 */
export function validateMetaTitle(title: string): {
  valid: boolean;
  length: number;
  warning?: string;
} {
  const length = title.length;

  if (length < 30) {
    return {
      valid: false,
      length,
      warning: 'Title is too short. Aim for 50-60 characters.',
    };
  }

  if (length > 70) {
    return {
      valid: false,
      length,
      warning: 'Title is too long. It will be truncated in search results.',
    };
  }

  if (length < 50 || length > 60) {
    return {
      valid: true,
      length,
      warning: 'Title length is acceptable but not optimal. Aim for 50-60 characters.',
    };
  }

  return { valid: true, length };
}

/**
 * Validate meta description length
 *
 * Optimal: 120-160 characters
 * Maximum: 160 characters (Google truncates beyond this)
 */
export function validateMetaDescription(description: string): {
  valid: boolean;
  length: number;
  warning?: string;
} {
  const length = description.length;

  if (length < 70) {
    return {
      valid: false,
      length,
      warning: 'Description is too short. Aim for 120-160 characters.',
    };
  }

  if (length > 160) {
    return {
      valid: false,
      length,
      warning: 'Description is too long. It will be truncated in search results.',
    };
  }

  if (length < 120) {
    return {
      valid: true,
      length,
      warning: 'Description could be longer for better SEO. Aim for 120-160 characters.',
    };
  }

  return { valid: true, length };
}

/**
 * Generate Twitter Card meta tags
 *
 * Usage:
 * ```tsx
 * const twitterTags = generateTwitterCardTags({
 *   title: 'Article Title',
 *   description: 'Article description',
 *   image: 'https://example.com/image.jpg',
 *   creator: '@username',
 * });
 * ```
 */
export interface TwitterCardData {
  title: string;
  description: string;
  image: string;
  imageAlt?: string;
  card?: 'summary' | 'summary_large_image' | 'app' | 'player';
  site?: string;
  creator?: string;
}

export function generateTwitterCardTags(data: TwitterCardData): Record<string, string> {
  const {
    title,
    description,
    image,
    imageAlt = title,
    card = 'summary_large_image',
    site = '@eatpal',
    creator = '@eatpal',
  } = data;

  return {
    'twitter:card': card,
    'twitter:title': title,
    'twitter:description': description,
    'twitter:image': image,
    'twitter:image:alt': imageAlt,
    'twitter:site': site,
    'twitter:creator': creator,
  };
}

/**
 * Generate Open Graph meta tags
 *
 * Usage:
 * ```tsx
 * const ogTags = generateOpenGraphTags({
 *   title: 'Article Title',
 *   description: 'Article description',
 *   url: 'https://example.com/article',
 *   image: 'https://example.com/image.jpg',
 *   type: 'article',
 * });
 * ```
 */
export interface OpenGraphData {
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt?: string;
  type?: 'website' | 'article' | 'profile' | 'book' | 'video.movie' | 'music.song';
  locale?: string;
  siteName?: string;
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
}

export function generateOpenGraphTags(data: OpenGraphData): Record<string, string> {
  const {
    title,
    description,
    url,
    image,
    imageAlt = title,
    type = 'website',
    locale = 'en_US',
    siteName = 'EatPal - Kids Meal Planning for Picky Eaters',
    publishedTime,
    modifiedTime,
    author,
  } = data;

  const tags: Record<string, string> = {
    'og:title': title,
    'og:description': description,
    'og:url': url,
    'og:image': image,
    'og:image:alt': imageAlt,
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:type': type,
    'og:locale': locale,
    'og:site_name': siteName,
  };

  if (type === 'article') {
    if (publishedTime) tags['article:published_time'] = publishedTime;
    if (modifiedTime) tags['article:modified_time'] = modifiedTime;
    if (author) tags['article:author'] = author;
  }

  return tags;
}

/**
 * Generate slug from title
 *
 * Creates URL-friendly slug from title
 *
 * Usage:
 * ```tsx
 * const slug = generateSlug('How to Help Picky Eaters Try New Foods');
 * // Returns: "how-to-help-picky-eaters-try-new-foods"
 * ```
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Calculate reading time for content
 *
 * Usage:
 * ```tsx
 * const readingTime = calculateReadingTime(blogContent);
 * // Returns: "5 min read"
 * ```
 */
export function calculateReadingTime(
  content: string,
  wordsPerMinute: number = 200
): string {
  // Strip HTML tags
  const text = content.replace(/<[^>]*>/g, '');

  // Count words
  const words = text.trim().split(/\s+/).length;

  // Calculate minutes
  const minutes = Math.ceil(words / wordsPerMinute);

  return minutes === 1 ? '1 min read' : `${minutes} min read`;
}

/**
 * The private surface, as prefixes of a pathname.
 *
 * These mirror the Disallow list every group in public/robots.txt repeats, and they
 * carry no trailing slash for the reason that file spells out: a prefix match means
 * "/admin/" does NOT cover "/admin", which is the actual route in src/App.tsx. The
 * list this replaced had exactly that bug on all four of its real entries, plus
 * "/_next/", which is Next.js and has never existed here.
 */
const PRIVATE_PATH_PREFIXES = [
  '/admin',
  '/dashboard',
  '/api',
  '/oauth',
  '/seo-dashboard',
  '/search-traffic',
  '/checkout/success',
  '/share',
  '/join',
  '/pseo-admin',
] as const;

/**
 * Top-level aliases that public/_redirects 302s into /auth, plus the bare
 * /reset-password that does not resolve to anything. None is a page, so none is a URL
 * to report as indexable.
 */
const AUTH_ALIASES = ['/login', '/signin', '/signup', '/register', '/reset-password'] as const;

/**
 * Whether a URL on this site should be indexed.
 *
 * Two things this gets right that the previous version did not.
 *
 * It matches on the pathname rather than searching the whole URL for a substring. A
 * post at /blog/how-to-login is a public article, and `url.includes('/login')` called
 * it private; a query string like ?next=/admin would flip it the other way.
 *
 * And it treats /auth as robots.txt does, an exact match plus a prefix, rather than as
 * a bare prefix. "/auth" as a prefix also matches /authors -- a public, prerendered,
 * sitemapped page -- which is the specific mistake that file records having made and
 * fixed. Getting it wrong here in the opposite direction is worse: this function
 * answers "may we index this", so a wrong true invites crawlers into /admin and
 * /dashboard.
 *
 * robots.txt remains the enforcement point. This is for code that needs the same
 * answer in JavaScript, and it must not drift from it.
 */
export function isIndexable(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url, 'https://tryeatpal.com').pathname;
  } catch {
    return false;
  }

  if (pathname === '/auth' || pathname.startsWith('/auth/')) return false;
  if ((AUTH_ALIASES as readonly string[]).includes(pathname)) return false;

  return !PRIVATE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Generate hreflang tags for internationalization
 *
 * Usage:
 * ```tsx
 * const hreflangTags = generateHreflangTags('https://tryeatpal.com', '/blog/article', [
 *   { lang: 'en', region: 'US' },
 *   { lang: 'es', region: 'MX' },
 * ]);
 * ```
 */
export interface HreflangOption {
  lang: string;
  region?: string;
  url?: string;
}

export function generateHreflangTags(
  baseUrl: string,
  path: string,
  options: HreflangOption[]
): Array<{ rel: string; hreflang: string; href: string }> {
  return options.map((option) => {
    const hreflang = option.region ? `${option.lang}-${option.region}` : option.lang;
    const href = option.url || `${baseUrl}${path}`;

    return {
      rel: 'alternate',
      hreflang,
      href,
    };
  });
}
