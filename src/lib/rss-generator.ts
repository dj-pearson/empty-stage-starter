/**
 * RSS Feed Generator for EatPal Blog
 *
 * Generates RSS 2.0 and Atom feeds for blog content to improve:
 * - Content discoverability
 * - Search engine crawling
 * - Content syndication
 * - Reader subscriptions
 *
 * Usage:
 * ```tsx
 * const rssFeed = generateRSSFeed(blogPosts);
 * const atomFeed = generateAtomFeed(blogPosts);
 * ```
 */

export interface BlogPost {
  title: string;
  description: string;
  url: string;
  author?: string;
  publishedDate: string; // ISO 8601 format
  modifiedDate?: string; // ISO 8601 format
  category?: string[];
  image?: string;
  content?: string; // Full HTML content
}

interface FeedConfig {
  title: string;
  description: string;
  siteUrl: string;
  feedUrl: string;
  language?: string;
  copyright?: string;
  managingEditor?: string;
  webMaster?: string;
  generator?: string;
  image?: {
    url: string;
    title: string;
    link: string;
  };
}

const defaultConfig: FeedConfig = {
  title: 'EatPal Blog - Tips for Picky Eaters & ARFID',
  description: 'Expert advice on managing picky eating, ARFID strategies, food chaining techniques, and family meal planning. Evidence-based guidance from feeding specialists.',
  siteUrl: 'https://tryeatpal.com',
  feedUrl: 'https://tryeatpal.com/rss.xml',
  language: 'en-US',
  copyright: `Copyright ${new Date().getFullYear()} EatPal. All rights reserved.`,
  managingEditor: 'support@tryeatpal.com (EatPal Team)',
  webMaster: 'support@tryeatpal.com (EatPal Support)',
  generator: 'EatPal RSS Generator',
  image: {
    url: 'https://tryeatpal.com/Logo-Green.png',
    title: 'EatPal - Kids Meal Planning for Picky Eaters',
    link: 'https://tryeatpal.com',
  },
};

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
 * Format date to RFC 822 (RSS 2.0)
 * Example: "Mon, 02 Jan 2006 15:04:05 GMT"
 */
function toRFC822(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toUTCString();
}

/**
 * Format date to RFC 3339 (Atom)
 * Example: "2006-01-02T15:04:05Z"
 */
function toRFC3339(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Generate RSS 2.0 Feed
 *
 * RSS 2.0 is widely supported by feed readers and provides excellent
 * compatibility with search engines.
 */
export function generateRSSFeed(
  posts: BlogPost[],
  config: Partial<FeedConfig> = {}
): string {
  const cfg = { ...defaultConfig, ...config };

  // Sort posts by date (newest first)
  const sortedPosts = [...posts].sort(
    (a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime()
  );

  const items = sortedPosts
    .map((post) => {
      const categories = post.category?.map(cat =>
        `    <category><![CDATA[${cat}]]></category>`
      ).join('\n') || '';

      const enclosure = post.image
        ? `    <enclosure url="${escapeXml(post.image)}" type="image/jpeg" />`
        : '';

      const content = post.content
        ? `    <content:encoded><![CDATA[${post.content}]]></content:encoded>`
        : '';

      return `  <item>
    <title><![CDATA[${post.title}]]></title>
    <description><![CDATA[${post.description}]]></description>
    <link>${escapeXml(post.url)}</link>
    <guid isPermaLink="true">${escapeXml(post.url)}</guid>
    <pubDate>${toRFC822(post.publishedDate)}</pubDate>
${categories}
${post.author ? `    <author>${escapeXml(post.author)}</author>` : ''}
${enclosure}
${content}
  </item>`;
    })
    .join('\n');

  const lastBuildDate = sortedPosts.length > 0
    ? toRFC822(sortedPosts[0].publishedDate)
    : toRFC822(new Date());

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title><![CDATA[${cfg.title}]]></title>
    <description><![CDATA[${cfg.description}]]></description>
    <link>${escapeXml(cfg.siteUrl)}</link>
    <atom:link href="${escapeXml(cfg.feedUrl)}" rel="self" type="application/rss+xml" />
    <language>${cfg.language}</language>
    <copyright><![CDATA[${cfg.copyright}]]></copyright>
    <managingEditor>${cfg.managingEditor}</managingEditor>
    <webMaster>${cfg.webMaster}</webMaster>
    <generator>${cfg.generator}</generator>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${cfg.image ? `    <image>
      <url>${escapeXml(cfg.image.url)}</url>
      <title><![CDATA[${cfg.image.title}]]></title>
      <link>${escapeXml(cfg.image.link)}</link>
    </image>` : ''}
${items}
  </channel>
</rss>`;
}

/**
 * Generate Atom 1.0 Feed
 *
 * Atom is a modern feed format with better internationalization
 * and more semantic structure.
 */
export function generateAtomFeed(
  posts: BlogPost[],
  config: Partial<FeedConfig> = {}
): string {
  const cfg = { ...defaultConfig, ...config };

  // Sort posts by date (newest first)
  const sortedPosts = [...posts].sort(
    (a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime()
  );

  const entries = sortedPosts
    .map((post) => {
      const categories = post.category?.map(cat =>
        `    <category term="${escapeXml(cat)}" />`
      ).join('\n') || '';

      const updated = post.modifiedDate || post.publishedDate;

      return `  <entry>
    <title><![CDATA[${post.title}]]></title>
    <link href="${escapeXml(post.url)}" />
    <id>${escapeXml(post.url)}</id>
    <published>${toRFC3339(post.publishedDate)}</published>
    <updated>${toRFC3339(updated)}</updated>
    <summary><![CDATA[${post.description}]]></summary>
${post.content ? `    <content type="html"><![CDATA[${post.content}]]></content>` : ''}
${post.author ? `    <author><name>${escapeXml(post.author)}</name></author>` : ''}
${categories}
${post.image ? `    <link rel="enclosure" type="image/jpeg" href="${escapeXml(post.image)}" />` : ''}
  </entry>`;
    })
    .join('\n');

  const updated = sortedPosts.length > 0
    ? toRFC3339(sortedPosts[0].publishedDate)
    : toRFC3339(new Date());

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title><![CDATA[${cfg.title}]]></title>
  <subtitle><![CDATA[${cfg.description}]]></subtitle>
  <link href="${escapeXml(cfg.siteUrl)}" />
  <link href="${escapeXml(cfg.feedUrl)}" rel="self" />
  <id>${escapeXml(cfg.siteUrl)}/</id>
  <updated>${updated}</updated>
  <rights><![CDATA[${cfg.copyright}]]></rights>
  <generator uri="https://tryeatpal.com">${cfg.generator}</generator>
${cfg.image ? `  <logo>${escapeXml(cfg.image.url)}</logo>
  <icon>${escapeXml(cfg.image.url)}</icon>` : ''}
${entries}
</feed>`;
}

/**
 * Generate JSON Feed (modern alternative)
 *
 * JSON Feed is an easier-to-parse alternative to RSS/Atom
 * https://jsonfeed.org/
 */
export function generateJSONFeed(
  posts: BlogPost[],
  config: Partial<FeedConfig> = {}
): string {
  const cfg = { ...defaultConfig, ...config };

  // Sort posts by date (newest first)
  const sortedPosts = [...posts].sort(
    (a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime()
  );

  const items = sortedPosts.map((post) => ({
    id: post.url,
    url: post.url,
    title: post.title,
    summary: post.description,
    content_html: post.content,
    image: post.image,
    date_published: toRFC3339(post.publishedDate),
    date_modified: post.modifiedDate ? toRFC3339(post.modifiedDate) : undefined,
    author: post.author ? { name: post.author } : undefined,
    tags: post.category,
  }));

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: cfg.title,
    description: cfg.description,
    home_page_url: cfg.siteUrl,
    feed_url: cfg.feedUrl.replace('.xml', '.json'),
    language: cfg.language,
    icon: cfg.image?.url,
    favicon: cfg.image?.url,
    items,
  };

  return JSON.stringify(feed, null, 2);
}

/**
 * Example blog posts data
 * Replace with actual blog post data from your CMS or database
 */
export const exampleBlogPosts: BlogPost[] = [
  {
    title: 'Understanding Food Chaining Therapy for Picky Eaters',
    description: 'Learn how food chaining therapy helps children systematically expand their diet from 5 foods to 50+ by building chains from safe foods.',
    url: 'https://tryeatpal.com/blog/understanding-food-chaining-therapy',
    author: 'EatPal Team',
    publishedDate: '2025-01-15T10:00:00Z',
    category: ['Feeding Therapy', 'Food Chaining', 'Picky Eating'],
    image: 'https://tryeatpal.com/blog/images/food-chaining-guide.jpg',
  },
  {
    title: '10 Evidence-Based Strategies for ARFID Management',
    description: 'Expert tips on managing Avoidant/Restrictive Food Intake Disorder (ARFID) with proven feeding therapy techniques.',
    url: 'https://tryeatpal.com/blog/arfid-management-strategies',
    author: 'EatPal Team',
    publishedDate: '2025-01-10T10:00:00Z',
    category: ['ARFID', 'Feeding Disorders', 'Treatment'],
    image: 'https://tryeatpal.com/blog/images/arfid-strategies.jpg',
  },
  {
    title: 'The Science Behind Try Bites: Why 15-20 Exposures Matter',
    description: 'Research shows children need 15-20 exposures to a new food before acceptance. Learn the science behind try bites and how to implement them.',
    url: 'https://tryeatpal.com/blog/science-of-try-bites',
    author: 'EatPal Team',
    publishedDate: '2025-01-05T10:00:00Z',
    category: ['Try Bites', 'Research', 'Food Introduction'],
    image: 'https://tryeatpal.com/blog/images/try-bites-science.jpg',
  },
];
