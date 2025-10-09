// CloudFlare Pages Edge Function for Dynamic Meta Tags
// This intercepts blog post URLs and injects proper Open Graph meta tags

export async function onRequest(context: any) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Only handle blog post URLs
  if (!url.pathname.startsWith('/blog/')) {
    return next();
  }

  // Extract blog slug from URL
  const slug = url.pathname.split('/blog/')[1];
  if (!slug) {
    return next();
  }

  try {
    // Fetch blog post from Supabase
    // Note: You'll need to add SUPABASE_URL and SUPABASE_ANON_KEY to your CloudFlare environment variables
    const supabaseUrl = env.SUPABASE_URL || 'https://your-project.supabase.co';
    const supabaseKey = env.SUPABASE_ANON_KEY || '';

    const response = await fetch(
      `${supabaseUrl}/rest/v1/blog_posts?slug=eq.${slug}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    const posts = await response.json();
    const post = posts[0];

    if (!post) {
      return next();
    }

    // Get the original HTML
    const originalResponse = await next();
    const html = await originalResponse.text();

    // Determine the image URL - use featured_image if available, otherwise Cover.png
    const imageUrl = post.featured_image
      ? `https://tryeatpal.com${post.featured_image}`
      : 'https://tryeatpal.com/Cover.png';

    // Inject dynamic meta tags for this blog post
    const dynamicMetaTags = `
    <!-- Dynamic Blog Post Meta Tags -->
    <title>${post.meta_title || post.title} | EatPal Blog</title>
    <meta name="title" content="${post.meta_title || post.title} | EatPal Blog" />
    <meta name="description" content="${post.meta_description || post.excerpt}" />

    <!-- Open Graph -->
    <meta property="og:type" content="article" />
    <meta property="og:url" content="https://tryeatpal.com/blog/${post.slug}" />
    <meta property="og:title" content="${post.meta_title || post.title}" />
    <meta property="og:description" content="${post.meta_description || post.excerpt}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:secure_url" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${post.title} - EatPal Blog" />
    <meta property="article:published_time" content="${post.published_at || post.created_at}" />
    <meta property="article:author" content="EatPal" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="https://tryeatpal.com/blog/${post.slug}" />
    <meta name="twitter:title" content="${post.meta_title || post.title}" />
    <meta name="twitter:description" content="${post.meta_description || post.excerpt}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="${post.title} - EatPal Blog" />

    <!-- Canonical URL -->
    <link rel="canonical" href="https://tryeatpal.com/blog/${post.slug}" />

    <!-- Structured Data for Blog Post -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "${post.title}",
      "description": "${post.excerpt}",
      "image": "${imageUrl}",
      "datePublished": "${post.published_at || post.created_at}",
      "dateModified": "${post.updated_at || post.created_at}",
      "author": {
        "@type": "Organization",
        "name": "EatPal",
        "url": "https://tryeatpal.com"
      },
      "publisher": {
        "@type": "Organization",
        "name": "EatPal",
        "logo": {
          "@type": "ImageObject",
          "url": "https://tryeatpal.com/Logo-Green.png"
        }
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "https://tryeatpal.com/blog/${post.slug}"
      }
    }
    </script>
    `;

    // Replace the default meta tags with blog-specific ones
    const modifiedHtml = html.replace('</head>', `${dynamicMetaTags}</head>`);

    return new Response(modifiedHtml, {
      headers: {
        'Content-Type': 'text/html',
      },
    });

  } catch (error) {
    console.error('Error in blog meta tag injection:', error);
    return next();
  }
}

