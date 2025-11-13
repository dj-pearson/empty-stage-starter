/**
 * Sitemap Generation Utilities
 *
 * Utilities for generating XML sitemaps for better SEO and crawlability.
 * Supports static pages, dynamic content, and prioritization.
 */

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export interface SitemapOptions {
  baseUrl: string;
  defaultChangefreq?: SitemapUrl['changefreq'];
  defaultPriority?: number;
}

/**
 * Generate XML sitemap from URLs
 *
 * Usage:
 * ```tsx
 * const urls = [
 *   { loc: '/', priority: 1.0, changefreq: 'daily' },
 *   { loc: '/pricing', priority: 0.9, changefreq: 'weekly' },
 * ];
 * const xml = generateSitemap({ baseUrl: 'https://tryeatpal.com' }, urls);
 * ```
 */
export function generateSitemap(options: SitemapOptions, urls: SitemapUrl[]): string {
  const { baseUrl, defaultChangefreq = 'weekly', defaultPriority = 0.7 } = options;

  const urlElements = urls.map((url) => {
    const fullUrl = url.loc.startsWith('http') ? url.loc : `${baseUrl}${url.loc}`;
    const changefreq = url.changefreq || defaultChangefreq;
    const priority = url.priority !== undefined ? url.priority : defaultPriority;
    const lastmod = url.lastmod || new Date().toISOString().split('T')[0];

    return `  <url>
    <loc>${escapeXml(fullUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements.join('\n')}
</urlset>`;
}

/**
 * Generate sitemap index for multiple sitemaps
 *
 * Usage:
 * ```tsx
 * const sitemaps = [
 *   { loc: '/sitemap-pages.xml', lastmod: '2025-01-01' },
 *   { loc: '/sitemap-blog.xml', lastmod: '2025-01-10' },
 * ];
 * const xml = generateSitemapIndex('https://tryeatpal.com', sitemaps);
 * ```
 */
export function generateSitemapIndex(
  baseUrl: string,
  sitemaps: Array<{ loc: string; lastmod?: string }>
): string {
  const sitemapElements = sitemaps.map((sitemap) => {
    const fullUrl = sitemap.loc.startsWith('http') ? sitemap.loc : `${baseUrl}${sitemap.loc}`;
    const lastmod = sitemap.lastmod || new Date().toISOString().split('T')[0];

    return `  <sitemap>
    <loc>${escapeXml(fullUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapElements.join('\n')}
</sitemapindex>`;
}

/**
 * Default EatPal static pages for sitemap
 */
export const staticPages: SitemapUrl[] = [
  { loc: '/', priority: 1.0, changefreq: 'daily' },
  { loc: '/pricing', priority: 0.9, changefreq: 'weekly' },
  { loc: '/faq', priority: 0.8, changefreq: 'weekly' },
  { loc: '/contact', priority: 0.7, changefreq: 'monthly' },
  { loc: '/blog', priority: 0.8, changefreq: 'daily' },
  { loc: '/dashboard', priority: 0.6, changefreq: 'never' },
  { loc: '/auth', priority: 0.5, changefreq: 'never' },
  { loc: '/privacy', priority: 0.5, changefreq: 'yearly' },
  { loc: '/terms', priority: 0.5, changefreq: 'yearly' },
];

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate robots.txt content
 *
 * Usage:
 * ```tsx
 * const robotsTxt = generateRobotsTxt({
 *   baseUrl: 'https://tryeatpal.com',
 *   sitemapPath: '/sitemap.xml',
 *   disallow: ['/admin', '/api'],
 * });
 * ```
 */
export interface RobotsTxtOptions {
  baseUrl: string;
  sitemapPath?: string;
  disallow?: string[];
  allow?: string[];
  crawlDelay?: number;
  userAgent?: string;
}

export function generateRobotsTxt(options: RobotsTxtOptions): string {
  const {
    baseUrl,
    sitemapPath = '/sitemap.xml',
    disallow = [],
    allow = [],
    crawlDelay,
    userAgent = '*',
  } = options;

  const lines: string[] = [];

  // User-agent
  lines.push(`User-agent: ${userAgent}`);

  // Allow directives
  allow.forEach((path) => {
    lines.push(`Allow: ${path}`);
  });

  // Disallow directives
  disallow.forEach((path) => {
    lines.push(`Disallow: ${path}`);
  });

  // Crawl delay (if specified)
  if (crawlDelay) {
    lines.push(`Crawl-delay: ${crawlDelay}`);
  }

  // Empty line before sitemap
  lines.push('');

  // Sitemap location
  lines.push(`Sitemap: ${baseUrl}${sitemapPath}`);

  return lines.join('\n');
}

/**
 * Default EatPal robots.txt configuration
 */
export const defaultRobotsTxt = generateRobotsTxt({
  baseUrl: 'https://tryeatpal.com',
  sitemapPath: '/sitemap.xml',
  disallow: [
    '/api/*',
    '/admin/*',
    '/dashboard/*',
    '/*.json',
    '/*?*', // Prevent crawling URLs with query parameters
  ],
  allow: [
    '/', // Allow home page
    '/blog/*', // Allow blog posts
    '/pricing',
    '/faq',
    '/contact',
  ],
});

/**
 * Validate sitemap URL
 */
export function isValidSitemapUrl(url: SitemapUrl): boolean {
  // Check required fields
  if (!url.loc) return false;

  // Check priority range
  if (url.priority !== undefined && (url.priority < 0 || url.priority > 1)) {
    return false;
  }

  // Check changefreq values
  const validChangefreq = [
    'always',
    'hourly',
    'daily',
    'weekly',
    'monthly',
    'yearly',
    'never',
  ];
  if (url.changefreq && !validChangefreq.includes(url.changefreq)) {
    return false;
  }

  // Check lastmod format (ISO 8601)
  if (url.lastmod && !/^\d{4}-\d{2}-\d{2}/.test(url.lastmod)) {
    return false;
  }

  return true;
}

/**
 * Sort sitemap URLs by priority (descending)
 */
export function sortByPriority(urls: SitemapUrl[]): SitemapUrl[] {
  return [...urls].sort((a, b) => {
    const priorityA = a.priority ?? 0.5;
    const priorityB = b.priority ?? 0.5;
    return priorityB - priorityA;
  });
}

/**
 * Generate breadcrumb structured data
 *
 * Usage:
 * ```tsx
 * const breadcrumbs = generateBreadcrumbStructuredData('https://tryeatpal.com', [
 *   { name: 'Home', url: '/' },
 *   { name: 'Blog', url: '/blog' },
 *   { name: 'Article Title', url: '/blog/article-slug' },
 * ]);
 * ```
 */
export function generateBreadcrumbStructuredData(
  baseUrl: string,
  items: Array<{ name: string; url: string }>
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${baseUrl}${item.url}`,
    })),
  };
}

/**
 * Generate FAQ structured data
 *
 * Usage:
 * ```tsx
 * const faqData = generateFAQStructuredData([
 *   { question: 'What is EatPal?', answer: 'EatPal is a meal planning app...' },
 *   { question: 'How much does it cost?', answer: 'Plans start at $9.99/month...' },
 * ]);
 * ```
 */
export function generateFAQStructuredData(
  faqs: Array<{ question: string; answer: string }>
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
