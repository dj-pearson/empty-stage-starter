// Cloudflare Pages Function to serve dynamic sitemap
export async function onRequest() {
  try {
    const supabaseUrl = 'https://tbuszxkevkpjcjapbrir.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRidXN6eGtldmtwamNqYXBicmlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4ODU5NDAsImV4cCI6MjA3NTQ2MTk0MH0.DlzY_3Fv2sXjNQNQPzCW4hh_WhC8o-_pqq6rQXGlfow';

    // Call the edge function to generate sitemap
    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-sitemap`,
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
    
    // Fallback to basic sitemap
    const fallbackSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://tryeatpal.com/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
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
