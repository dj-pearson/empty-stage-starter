// Cloudflare Pages Function to serve dynamic sitemap
export async function onRequest(context: { env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string; VITE_FUNCTIONS_URL?: string } }) {
  try {
    // Get URLs from environment variables (set in wrangler.toml or Cloudflare dashboard)
    const supabaseUrl = context.env.VITE_SUPABASE_URL || 'https://api.tryeatpal.com';
    const supabaseAnonKey = context.env.VITE_SUPABASE_ANON_KEY || '';
    // Edge functions are at a separate subdomain for self-hosted Supabase
    const functionsUrl = context.env.VITE_FUNCTIONS_URL || supabaseUrl.replace('api.', 'functions.');

    if (!supabaseAnonKey) {
      console.error('Missing VITE_SUPABASE_ANON_KEY environment variable');
      throw new Error('Supabase configuration missing');
    }

    // Call the edge function to generate sitemap
    const response = await fetch(
      `${functionsUrl}/generate-sitemap`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Edge function error:', await response.text());
      throw new Error('Failed to generate sitemap');
    }

    const sitemapXml = await response.text();

    return new Response(sitemapXml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Sitemap generation error:', error);
    
    // Fallback to static sitemap with all public routes
    const today = new Date().toISOString().split('T')[0];
    const fallbackSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://tryeatpal.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/pricing</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/picky-eater-quiz</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/budget-calculator</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/meal-plan</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/faq</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/contact</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/auth</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/terms</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/accessibility</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/accessibility/vpat</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/api/docs</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/picky-eater-quiz/results</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/budget-calculator/results</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://tryeatpal.com/meal-plan/results</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`;

    return new Response(fallbackSitemap, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }
}
