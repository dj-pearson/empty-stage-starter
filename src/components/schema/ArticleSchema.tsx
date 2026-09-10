import { Helmet } from "react-helmet-async";

export interface ArticleSchemaProps {
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  datePublished: string;
  dateModified?: string;
  authorName?: string;
  authorUrl?: string;
  publisherName?: string;
  publisherLogo?: string;
  category?: string;
  keywords?: string[];
  wordCount?: number;
  readingTimeMinutes?: number;
}

/**
 * ArticleSchema - Structured data component for blog posts and articles
 *
 * Optimized for:
 * - Google Search rich results (Article cards)
 * - Google Discover feed
 * - AI Search citations (ChatGPT, Perplexity, Claude)
 * - Social sharing previews
 * - News aggregators
 *
 * Schema types included:
 * - Article (primary)
 * - WebPage (context)
 */
export function ArticleSchema({
  title,
  description,
  url,
  imageUrl,
  datePublished,
  dateModified,
  // A named human, not "EatPal Team". Google treats an organisation-as-author byline on
  // health content as an absence of authorship, and the previous default resolved to a
  // page that claimed licensed clinicians EatPal does not employ.
  authorName = "Dj Pearson",
  // Points at the editorial standards page, not the homepage. Every pSEO guide renders
  // this schema with the defaults, so this one URL is what links the whole guide cluster
  // to a statement of who wrote it and how its claims are sourced. A homepage URL
  // asserted authorship and then resolved to a page with no author information on it.
  authorUrl = "https://tryeatpal.com/authors",
  publisherName = "EatPal",
  publisherLogo = "https://tryeatpal.com/Logo-Green.webp",
  category,
  keywords,
  wordCount,
  readingTimeMinutes,
}: ArticleSchemaProps) {
  const baseUrl = "https://tryeatpal.com";

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: title,
    description: description,
    url: url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    image: imageUrl
      ? {
          "@type": "ImageObject",
          url: imageUrl,
          width: 1200,
          height: 630,
        }
      : undefined,
    datePublished: datePublished,
    dateModified: dateModified || datePublished,
    author: {
      "@type": "Person",
      name: authorName,
      url: authorUrl,
    },
    publisher: {
      "@type": "Organization",
      name: publisherName,
      logo: {
        "@type": "ImageObject",
        url: publisherLogo,
        width: 200,
        height: 60,
      },
    },
    articleSection: category || "Health & Nutrition",
    keywords: keywords?.join(", ") || "picky eating, meal planning, ARFID",
    wordCount: wordCount,
    timeRequired: readingTimeMinutes ? `PT${readingTimeMinutes}M` : undefined,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "Blog",
      "@id": `${baseUrl}/blog#blog`,
      name: "EatPal Blog",
      url: `${baseUrl}/blog`,
    },
    about: {
      "@type": "Thing",
      name: category || "Picky Eating & Nutrition",
    },
    copyrightHolder: {
      "@type": "Organization",
      name: "EatPal",
    },
    copyrightYear: new Date(datePublished).getFullYear(),
  };

  /**
   * No BreadcrumbList here, deliberately.
   *
   * This component used to emit one, hardcoded as Home -> Blog -> title. Every page
   * that renders it also renders a real breadcrumb -- BlogPost through
   * BreadcrumbNavigation, PseoPage through BreadcrumbSchema -- so each article shipped
   * two BreadcrumbList entities that disagreed with each other, and on a programmatic
   * guide the hardcoded one was simply false: /guides/foods/chicken-nuggets was
   * claiming /blog as its parent.
   *
   * Seen in production on 2026-09-10: a live blog post carried two BreadcrumbList
   * blocks with different item values. The trail belongs to whichever component knows
   * the actual path, which is never this one.
   */

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url: url,
    name: title,
    description: description,
    isPartOf: {
      "@id": `${baseUrl}/#website`,
    },
    primaryImageOfPage: imageUrl
      ? {
          "@type": "ImageObject",
          url: imageUrl,
        }
      : undefined,
    datePublished: datePublished,
    dateModified: dateModified || datePublished,
    mainEntity: {
      "@id": `${url}#article`,
    },
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["article h1", "article .excerpt", "article p"],
    },
  };

  // Combine all schemas into a graph
  const combinedSchema = {
    "@context": "https://schema.org",
    "@graph": [
      articleSchema,
      webPageSchema,
    ],
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(combinedSchema)}
      </script>
    </Helmet>
  );
}
