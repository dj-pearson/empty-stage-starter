import { Helmet } from "react-helmet-async";

/**
 * The site-wide default social share image, with its REAL dimensions.
 *
 * These were previously hardcoded as 1200x630 for every page and every image — the
 * conventional Open Graph size, but not this file's actual size, and certainly not the
 * size of the per-post images blog articles pass in. Scrapers lay the card out from the
 * declared numbers before fetching, so the mismatch produced cropped or letterboxed
 * previews.
 *
 * NOTE: 1536x1024 is 3:2. Open Graph wants ~1.91:1 and Twitter's summary_large_image
 * wants 2:1, so this image still gets centre-cropped in most cards. A purpose-made
 * 1200x630 export would render better; declaring the truth is the correctness fix.
 */
const DEFAULT_OG_IMAGE = {
  url: "https://tryeatpal.com/Cover.webp",
  width: 1536,
  height: 1024,
} as const;

export interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  canonicalUrl: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  /**
   * Real pixel dimensions of `ogImage`. Only pass these when you actually know them —
   * og:image:width/height are layout hints scrapers trust before they fetch the file, so
   * a wrong value crops or letterboxes the card. When omitted (the usual case for a
   * per-post image) the tags are not emitted and the scraper measures the image itself.
   */
  ogImageWidth?: number;
  ogImageHeight?: number;
  twitterCard?: "summary" | "summary_large_image";
  aiPurpose?: string;
  aiAudience?: string;
  aiKeyFeatures?: string;
  aiUseCases?: string;
  structuredData?: object | object[];
  noindex?: boolean;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  section?: string;
}

/**
 * SEOHead - Dynamic SEO component for per-page optimization
 *
 * This component provides comprehensive SEO optimization for both traditional
 * search engines (Google, Bing) and AI-powered search platforms (ChatGPT,
 * Perplexity, Gemini, Claude).
 *
 * Features:
 * - Dynamic meta tags (title, description, keywords)
 * - Open Graph tags for social sharing (with article support)
 * - Twitter Card optimization
 * - AI Search optimization (GEO - Generative Engine Optimization)
 * - JSON-LD structured data support
 * - Canonical URLs
 * - Content freshness signals (datePublished/dateModified)
 * - E-E-A-T signals
 */
export function SEOHead({
  title,
  description,
  keywords,
  canonicalUrl,
  ogType = "website",
  ogImage = DEFAULT_OG_IMAGE.url,
  ogImageAlt = "EatPal - AI-Powered Kids Meal Planning for Picky Eaters",
  // Default to the real size of the default image; a caller passing its own ogImage
  // without dimensions gets no width/height tags rather than the wrong ones.
  ogImageWidth = ogImage === DEFAULT_OG_IMAGE.url ? DEFAULT_OG_IMAGE.width : undefined,
  ogImageHeight = ogImage === DEFAULT_OG_IMAGE.url ? DEFAULT_OG_IMAGE.height : undefined,
  twitterCard = "summary_large_image",
  aiPurpose,
  aiAudience,
  aiKeyFeatures,
  aiUseCases,
  structuredData,
  noindex = false,
  datePublished,
  dateModified,
  author = "EatPal Team",
  section,
}: SEOProps) {
  const fullTitle = title.includes("EatPal") ? title : `${title} | EatPal`;
  const robots = noindex
    ? "noindex, nofollow"
    : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Content Freshness Signals */}
      {datePublished && (
        <meta name="article:published_time" content={datePublished} />
      )}
      {dateModified && (
        <meta name="article:modified_time" content={dateModified} />
      )}
      {datePublished && <meta name="date" content={datePublished} />}
      {dateModified && <meta name="last-modified" content={dateModified} />}

      {/* RSS and Atom Feeds - Important for SEO and content syndication */}
      <link
        rel="alternate"
        type="application/rss+xml"
        title="EatPal Blog RSS Feed"
        href="https://tryeatpal.com/rss.xml"
      />
      <link
        rel="alternate"
        type="application/atom+xml"
        title="EatPal Blog Atom Feed"
        href="https://tryeatpal.com/feed.xml"
      />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:secure_url" content={ogImage} />
      {ogImageWidth !== undefined && (
        <meta property="og:image:width" content={String(ogImageWidth)} />
      )}
      {ogImageHeight !== undefined && (
        <meta property="og:image:height" content={String(ogImageHeight)} />
      )}
      <meta property="og:image:alt" content={ogImageAlt} />
      <meta property="og:locale" content="en_US" />
      <meta
        property="og:site_name"
        content="EatPal - Kids Meal Planning for Picky Eaters"
      />

      {/* Article-specific OG tags for blog/content pages */}
      {ogType === "article" && datePublished && (
        <meta property="article:published_time" content={datePublished} />
      )}
      {ogType === "article" && dateModified && (
        <meta property="article:modified_time" content={dateModified} />
      )}
      {ogType === "article" && author && (
        <meta property="article:author" content={author} />
      )}
      {ogType === "article" && section && (
        <meta property="article:section" content={section} />
      )}

      {/* Twitter */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={ogImageAlt} />
      <meta name="twitter:site" content="@eatpal" />
      <meta name="twitter:creator" content="@eatpal" />

      {/* AI Search Optimization (GEO - Generative Engine Optimization) */}
      {aiPurpose && <meta name="ai:purpose" content={aiPurpose} />}
      {aiAudience && <meta name="ai:primary_audience" content={aiAudience} />}
      {aiKeyFeatures && (
        <meta name="ai:key_features" content={aiKeyFeatures} />
      )}
      {aiUseCases && <meta name="ai:use_cases" content={aiUseCases} />}

      <meta name="author" content={author} />

      {/*
        Removed here, deliberately — every one of these was emitted on every page and
        baked into every prerendered file, and no search or AI engine consumes any of them:

          citation_name / citation_description  Highwire Press tags for scholarly
                                                articles; meaningless on product pages.
          subject                               was set to the raw keywords string, so it
                                                repeated the keyword list a second time.
          abstract / summary                    verbatim duplicates of the description.
          topic / Classification                non-standard, no consumer.
          reply-to / url / identifier-URL       non-standard; canonical already states the URL.
          googlebot / bingbot / slurp /         byte-identical copies of the robots tag
          DuckDuckBot                           above, which already applies to all of them.

        The ai:* tags are kept: they are this site's deliberate GEO strategy and are
        populated per page from src/lib/seo-config.ts.
      */}

      {/* Structured Data (JSON-LD) */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(
            Array.isArray(structuredData)
              ? { "@context": "https://schema.org", "@graph": structuredData }
              : structuredData
          )}
        </script>
      )}
    </Helmet>
  );
}
