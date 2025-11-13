/**
 * Dynamic Sitemap Generator
 *
 * Generates sitemaps for dynamic content (blog posts, recipes, etc.)
 * Run this script to update sitemap-dynamic.xml
 *
 * Usage: node scripts/generate-sitemap.js
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

interface SitemapUrl {
  loc: string;
  lastmod: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

function generateSitemapXML(urls: SitemapUrl[]): string {
  const urlElements = urls.map((url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority.toFixed(1)}</priority>
  </url>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements.join('\n')}
</urlset>`;
}

async function generateDynamicSitemap() {
  const baseUrl = 'https://tryeatpal.com';
  const urls: SitemapUrl[] = [];

  try {
    // Fetch published blog posts
    const { data: blogPosts, error: blogError } = await supabase
      .from('blog_posts')
      .select('slug, updated_at, created_at')
      .eq('status', 'published')
      .order('created_at', { ascending: false });

    if (blogError) {
      console.warn('Could not fetch blog posts:', blogError.message);
    } else if (blogPosts) {
      blogPosts.forEach((post) => {
        urls.push({
          loc: `${baseUrl}/blog/${post.slug}`,
          lastmod: new Date(post.updated_at || post.created_at).toISOString().split('T')[0],
          changefreq: 'monthly',
          priority: 0.6,
        });
      });
      console.log(`✓ Added ${blogPosts.length} blog posts`);
    }

    // Fetch public recipes (if applicable)
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('id, updated_at, created_at')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (recipesError) {
      console.warn('Could not fetch recipes:', recipesError.message);
    } else if (recipes) {
      recipes.forEach((recipe) => {
        urls.push({
          loc: `${baseUrl}/recipes/${recipe.id}`,
          lastmod: new Date(recipe.updated_at || recipe.created_at).toISOString().split('T')[0],
          changefreq: 'monthly',
          priority: 0.5,
        });
      });
      console.log(`✓ Added ${recipes.length} recipes`);
    }

    // Generate sitemap XML
    const xml = generateSitemapXML(urls);

    // Write to public directory
    const outputPath = join(process.cwd(), 'public', 'sitemap-dynamic.xml');
    writeFileSync(outputPath, xml, 'utf-8');

    console.log(`\n✓ Dynamic sitemap generated successfully!`);
    console.log(`  File: ${outputPath}`);
    console.log(`  Total URLs: ${urls.length}`);

    // Generate sitemap index
    const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${baseUrl}/sitemap.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${baseUrl}/sitemap-dynamic.xml</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </sitemap>
</sitemapindex>`;

    const indexPath = join(process.cwd(), 'public', 'sitemap-index.xml');
    writeFileSync(indexPath, sitemapIndex, 'utf-8');
    console.log(`✓ Sitemap index generated: ${indexPath}`);

  } catch (error) {
    console.error('Error generating sitemap:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateDynamicSitemap();
}

export { generateDynamicSitemap };
