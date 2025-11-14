import { Helmet } from "react-helmet-async";

export interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  canonicalUrl: string;
  ogType?: string;
  ogImage?: string;
  ogImageAlt?: string;
  twitterCard?: "summary" | "summary_large_image";
  aiPurpose?: string;
  aiAudience?: string;
  aiKeyFeatures?: string;
  aiUseCases?: string;
  structuredData?: object | object[];
  noindex?: boolean;
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
 * - Open Graph tags for social sharing
 * - Twitter Card optimization
 * - AI Search optimization (GEO - Generative Engine Optimization)
 * - JSON-LD structured data support
 * - Canonical URLs
 * - E-E-A-T signals
 */
export function SEOHead({
  title,
  description,
  keywords,
  canonicalUrl,
  ogType = "website",
  ogImage = "https://tryeatpal.com/Cover.png",
  ogImageAlt = "EatPal - AI-Powered Kids Meal Planning for Picky Eaters",
  twitterCard = "summary_large_image",
  aiPurpose,
  aiAudience,
  aiKeyFeatures,
  aiUseCases,
  structuredData,
  noindex = false,
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

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:secure_url" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={ogImageAlt} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:site_name" content="EatPal - Kids Meal Planning for Picky Eaters" />

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
      {aiKeyFeatures && <meta name="ai:key_features" content={aiKeyFeatures} />}
      {aiUseCases && <meta name="ai:use_cases" content={aiUseCases} />}
      <meta name="citation_name" content={`${fullTitle}`} />
      <meta name="citation_description" content={description} />

      {/* Additional GEO Meta Tags for AI Crawlers */}
      <meta name="subject" content={keywords || "picky eating, meal planning, food chaining therapy"} />
      <meta name="abstract" content={description} />
      <meta name="topic" content="Picky eating, feeding therapy, food chaining, selective eating, ARFID" />
      <meta name="summary" content={description} />
      <meta name="Classification" content="Health & Wellness, Parenting, Meal Planning" />
      <meta name="author" content="EatPal Team - Feeding Therapy Specialists" />
      <meta name="reply-to" content="Support@TryEatPal.com" />
      <meta name="url" content={canonicalUrl} />
      <meta name="identifier-URL" content={canonicalUrl} />

      {/* Enhanced Robots directives for AI crawlers */}
      <meta name="googlebot" content={robots} />
      <meta name="bingbot" content={robots} />
      <meta name="slurp" content={robots} />
      <meta name="DuckDuckBot" content={robots} />

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
