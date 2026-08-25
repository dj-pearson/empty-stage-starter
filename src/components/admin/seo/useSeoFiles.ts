import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { MetaTags } from '@/components/admin/seo/SeoMetaTab';

const EMPTY_META_TAGS: MetaTags = {
  title: 'EatPal - Picky Eater Meal Planning Made Easy',
  description:
    'Plan weekly meals for picky eaters with safe foods and daily try bites. Auto-generate grocery lists and track meal results.',
  keywords: 'meal planning, picky eaters, kid meals, grocery list, meal tracker',
  og_title: 'EatPal - Picky Eater Solutions',
  og_description:
    'Simple meal planning app for parents of picky eaters with weekly rotation and grocery list generation',
  og_image: 'https://lovable.dev/opengraph-image-p98pqg.png',
  twitter_card: 'summary_large_image',
  twitter_site: '@lovable_dev',
};

/**
 * US-553: the robots.txt / sitemap / llms.txt / meta / structured-data
 * editors, lifted out of SEOManager.
 *
 * loadSEOSettings is local -- it generates the default file contents from the
 * current origin and queries nothing -- which is why the mount-query
 * characterisation test sees three tables rather than four. regenerateSitemap
 * is the only part that touches Postgres, reading published blog posts.
 */
export function useSeoFiles() {
  const [robotsTxt, setRobotsTxt] = useState('');
  const [sitemapXml, setSitemapXml] = useState('');
  const [llmsTxt, setLlmsTxt] = useState('');
  const [isRegeneratingSitemap, setIsRegeneratingSitemap] = useState(false);
  const [metaTags, setMetaTags] = useState<MetaTags>(EMPTY_META_TAGS);
  const [structuredData, setStructuredData] = useState<Record<string, unknown>>({});

  const regenerateSitemap = async () => {
    setIsRegeneratingSitemap(true);

    try {
      // Fetch all published blog posts
      const { data: posts, error } = await supabase
        .from('blog_posts')
        .select('slug, updated_at, published_at, featured_image_url')
        .eq('status', 'published')
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false });

      if (error) throw error;

      const baseUrl = window.location.origin;
      const today = new Date().toISOString().split('T')[0];

      // Static pages
      const staticPages = [
        { url: '/', priority: '1.0', changefreq: 'daily', lastmod: today },
        { url: '/auth', priority: '0.8', changefreq: 'monthly', lastmod: today },
        { url: '/pricing', priority: '0.9', changefreq: 'weekly', lastmod: today },
        { url: '/dashboard', priority: '0.8', changefreq: 'weekly', lastmod: today },
        { url: '/planner', priority: '0.9', changefreq: 'weekly', lastmod: today },
        { url: '/kids', priority: '0.8', changefreq: 'weekly', lastmod: today },
        { url: '/tracker', priority: '0.8', changefreq: 'weekly', lastmod: today },
        { url: '/pantry', priority: '0.7', changefreq: 'weekly', lastmod: today },
        { url: '/recipes', priority: '0.8', changefreq: 'weekly', lastmod: today },
        { url: '/grocery', priority: '0.7', changefreq: 'weekly', lastmod: today },
        { url: '/blog', priority: '0.8', changefreq: 'daily', lastmod: today },
        { url: '/faq', priority: '0.7', changefreq: 'monthly', lastmod: today },
        { url: '/contact', priority: '0.6', changefreq: 'monthly', lastmod: today },
        { url: '/privacy', priority: '0.3', changefreq: 'yearly', lastmod: today },
        { url: '/terms', priority: '0.3', changefreq: 'yearly', lastmod: today },
      ];

      // Build sitemap
      let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${baseUrl}/Cover.webp</image:loc>
      <image:title>EatPal - Kids Meal Planning for Picky Eaters</image:title>
      <image:caption>Meal planning for picky eaters and selective eating</image:caption>
    </image:image>
  </url>

`;

      // Add static pages
      staticPages.slice(1).forEach((page) => {
        sitemap += `  <!-- ${page.url.replace('/', '').replace('-', ' ').toUpperCase() || 'Page'} -->
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>

`;
      });

      // Add blog posts
      if (posts && posts.length > 0) {
        sitemap += `  <!-- Blog Posts (${posts.length} posts) -->\n`;
        posts.forEach((post) => {
          const lastmod = post.updated_at
            ? new Date(post.updated_at).toISOString().split('T')[0]
            : new Date(post.published_at).toISOString().split('T')[0];

          sitemap += `  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>`;

          // Add featured image if available
          if (post.featured_image_url) {
            sitemap += `
    <image:image>
      <image:loc>${post.featured_image_url.startsWith('http') ? post.featured_image_url : baseUrl + post.featured_image_url}</image:loc>
    </image:image>`;
          }

          sitemap += `
  </url>

`;
        });
      }

      sitemap += `</urlset>`;

      setSitemapXml(sitemap);
      toast.success(`Sitemap regenerated with ${posts?.length || 0} blog posts!`);
    } catch (error) {
      logger.error('Error regenerating sitemap:', error);
      toast.error('Failed to regenerate sitemap');
    } finally {
      setIsRegeneratingSitemap(false);
    }
  };

  const loadSEOSettings = () => {
    /**
     * A starting template, NOT the shipped file. public/robots.txt is the
     * source of truth and is far more complete; this text exists so the editor
     * has something to show and something to download.
     *
     * It repeats the Disallow block inside every named group on purpose. Under
     * RFC 9309 a crawler obeys only the most specific group matching its
     * user-agent and ignores "User-agent: *" entirely, so a named group that
     * says nothing but "Allow: /" hands that crawler the whole site. The
     * previous version of this template did exactly that for Googlebot, Bingbot
     * and Slurp, and it is downloadable as robots.txt (see handleDownloadFile),
     * so shipping it would have reintroduced the bug US-645 fixed.
     */
    const privateBlock = [
      'Disallow: /admin',
      'Disallow: /dashboard',
      'Disallow: /api',
      'Disallow: /auth',
      'Disallow: /oauth',
      'Disallow: /join',
    ].join('\n');

    const defaultRobots = `# Robots.txt for EatPal
# Template only -- public/robots.txt is what the site serves.
# Every named group repeats the Disallow block because a crawler reads its own
# group and ignores "User-agent: *". Do not factor the duplication out.

User-agent: Googlebot
Allow: /
${privateBlock}

User-agent: Bingbot
Allow: /
${privateBlock}

User-agent: Slurp
Allow: /
Crawl-delay: 1
${privateBlock}

User-agent: *
Allow: /
Crawl-delay: 1
${privateBlock}

# Sitemap location
Sitemap: ${window.location.origin}/sitemap.xml`;

    setRobotsTxt(defaultRobots);

    // Generate sitemap.xml
    const pages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
      { url: '/dashboard', priority: '0.8', changefreq: 'weekly' },
      { url: '/planner', priority: '0.9', changefreq: 'weekly' },
      { url: '/pantry', priority: '0.7', changefreq: 'weekly' },
      { url: '/recipes', priority: '0.8', changefreq: 'weekly' },
      { url: '/grocery', priority: '0.7', changefreq: 'weekly' },
    ];

    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${window.location.origin}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>`;

    setSitemapXml(sitemapContent);

    // Generate llms.txt
    const defaultLlms = `# EatPal - Meal Planning for Picky Eaters

## About
EatPal is a meal planning application designed specifically for parents of picky eaters.
It helps families plan weekly meals using safe foods and introduces new foods gradually
through daily "try bites."

## Features
- Child profile management with dietary restrictions and allergens
- Pantry management with safe foods and try bites
- Weekly meal planner with drag-and-drop interface
- Recipe library with kid-friendly meals
- Automatic grocery list generation
- Meal result tracking and notes

## Target Audience
Parents of picky eaters aged 2-12 years old looking for structured meal planning solutions

## Technology
React, TypeScript, Supabase, Vite, shadcn/ui, Tailwind CSS

## Contact
For inquiries: support@eatpal.com

## Documentation
Full documentation available at: ${window.location.origin}/docs

## API
RESTful API available for integrations. Contact for API access.
`;

    setLlmsTxt(defaultLlms);

    // Generate structured data (JSON-LD)
    const structuredDataSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'EatPal',
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Web Browser',
      description:
        'Meal planning application for parents of picky eaters with weekly meal rotation and grocery list generation',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
      // No aggregateRating. This generator used to emit 4.8 from 127 ratings, which
      // nothing backs; a site publishing ratings about its own product is self-serving
      // markup, ineligible for rich results and a manual-action risk when invented.
      // Wire it to a real rating store before re-adding.
      creator: {
        '@type': 'Organization',
        name: 'EatPal',
        url: window.location.origin,
      },
    };

    setStructuredData(structuredDataSchema);
  };

  const handleCopyToClipboard = (content: string, label: string) => {
    navigator.clipboard.writeText(content);
    toast.success(`${label} copied to clipboard`);
  };

  const handleDownloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    toast.success(`${filename} downloaded`);
  };

  const handleUpdateMetaTags = () => {
    // In a real implementation, this would update the database and index.html
    toast.success('Meta tags configuration saved. Update index.html manually with these values.');
  };

  useEffect(() => {
    loadSEOSettings();
    // Mount-only, matching the effect this came from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    robotsTxt,
    setRobotsTxt,
    sitemapXml,
    setSitemapXml,
    llmsTxt,
    setLlmsTxt,
    isRegeneratingSitemap,
    metaTags,
    setMetaTags,
    structuredData,
    setStructuredData,
    regenerateSitemap,
    loadSEOSettings,
    handleCopyToClipboard,
    handleDownloadFile,
    handleUpdateMetaTags,
  };
}
