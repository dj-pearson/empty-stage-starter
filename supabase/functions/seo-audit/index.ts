import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Running SEO audit for: ${url}`);

    // Fetch the page
    const pageResponse = await fetch(url);
    const html = await pageResponse.text();
    const headers = Object.fromEntries(pageResponse.headers.entries());

    const audit = {
      technical: analyzeTechnical(html, headers, url),
      content: analyzeContent(html),
      performance: analyzePerformance(headers),
      timestamp: new Date().toISOString()
    };

    console.log(`SEO audit completed for ${url}`);

    return new Response(
      JSON.stringify({ audit }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in SEO audit:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function analyzeTechnical(html: string, headers: Record<string, string>, url: string) {
  const issues: any[] = [];

  // HTTPS check
  const https = url.startsWith('https://');
  if (!https) {
    issues.push({ type: 'error', message: 'Site not using HTTPS', impact: 'Critical' });
  }

  // Viewport check
  const hasViewport = html.includes('<meta name="viewport"');
  if (!hasViewport) {
    issues.push({ type: 'error', message: 'Missing viewport meta tag', impact: 'Critical' });
  }

  // Robots meta check
  if (html.toLowerCase().includes('noindex') || html.toLowerCase().includes('nofollow')) {
    issues.push({ type: 'warning', message: 'Page may be blocked from indexing', impact: 'High' });
  }

  // Structured data check
  const structuredDataMatches = html.match(/<script type="application\/ld\+json">/g);
  const structuredDataCount = structuredDataMatches?.length || 0;
  
  if (structuredDataCount === 0) {
    issues.push({ type: 'warning', message: 'No structured data found', impact: 'Medium' });
  }

  // Compression check
  const compression = headers['content-encoding'];
  const hasCompression = compression && (compression.includes('gzip') || compression.includes('br'));
  
  if (!hasCompression) {
    issues.push({ type: 'warning', message: 'Content compression not enabled', impact: 'Medium' });
  }

  return {
    https,
    hasViewport,
    structuredDataCount,
    hasCompression,
    issues
  };
}

function analyzeContent(html: string) {
  const issues: any[] = [];

  // Extract body text (simple approximation)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;
  
  // Remove scripts and styles
  const cleanText = bodyHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const wordCount = cleanText.split(/\s+/).length;

  if (wordCount < 300) {
    issues.push({ type: 'warning', message: `Low word count (${wordCount})`, impact: 'Medium' });
  }

  // Count links
  const linkMatches = html.match(/<a\s+[^>]*href=/gi);
  const linksCount = linkMatches?.length || 0;

  if (linksCount < 3) {
    issues.push({ type: 'warning', message: 'Few internal links detected', impact: 'Medium' });
  }

  // Image alt check
  const imgMatches = html.match(/<img[^>]+>/gi) || [];
  const imagesWithoutAlt = imgMatches.filter(img => !img.includes('alt=')).length;
  
  if (imagesWithoutAlt > 0) {
    issues.push({ 
      type: 'warning', 
      message: `${imagesWithoutAlt} images missing alt attributes`,
      impact: 'Medium'
    });
  }

  // Text to HTML ratio
  const htmlLength = html.length;
  const textToHtmlRatio = (cleanText.length / htmlLength) * 100;

  return {
    wordCount,
    linksCount,
    imagesTotal: imgMatches.length,
    imagesMissingAlt: imagesWithoutAlt,
    textToHtmlRatio: textToHtmlRatio.toFixed(1),
    issues
  };
}

function analyzePerformance(headers: Record<string, string>) {
  const issues: any[] = [];

  // Cache control
  const cacheControl = headers['cache-control'];
  if (!cacheControl) {
    issues.push({ type: 'warning', message: 'No Cache-Control header', impact: 'Medium' });
  }

  // Compression
  const contentEncoding = headers['content-encoding'];
  if (!contentEncoding) {
    issues.push({ type: 'warning', message: 'No content compression', impact: 'Medium' });
  }

  return {
    hasCaching: !!cacheControl,
    hasCompression: !!contentEncoding,
    issues
  };
}
