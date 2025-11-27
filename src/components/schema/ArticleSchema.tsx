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
 * - BreadcrumbList (navigation)
 * - WebPage (context)
 */
export function ArticleSchema({
  title,
  description,
  url,
  imageUrl,
  datePublished,
  dateModified,
  authorName = "EatPal Team",
  authorUrl = "https://tryeatpal.com",
  publisherName = "EatPal",
  publisherLogo = "https://tryeatpal.com/Logo-Green.png",
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

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: baseUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${baseUrl}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: title,
        item: url,
      },
    ],
  };

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
    breadcrumb: {
      "@id": `${url}#breadcrumb`,
    },
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
      breadcrumbSchema,
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
