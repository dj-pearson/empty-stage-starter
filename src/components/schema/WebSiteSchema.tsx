/**
 * WebSiteSchema - JSON-LD structured data for site-wide WebSite + SearchAction
 *
 * Implements the WebSite schema type with SearchAction, enabling:
 * - Google Sitelinks Searchbox in search results
 * - AI search engine site understanding
 * - Enhanced site identity signals
 *
 * Should be placed on the homepage or in the root layout component.
 *
 * Usage:
 * ```tsx
 * <WebSiteSchema
 *   name="EatPal"
 *   alternateName="EatPal - Kids Meal Planning for Picky Eaters"
 *   url="https://tryeatpal.com"
 *   searchUrlTemplate="https://tryeatpal.com/search?q={search_term_string}"
 *   description="AI-powered food chaining meal planner for picky eaters"
 * />
 * ```
 */

export interface WebSiteSchemaProps {
  name: string;
  alternateName?: string;
  url: string;
  searchUrlTemplate?: string;
  description?: string;
  inLanguage?: string;
  publisher?: {
    name: string;
    logo?: string;
    url?: string;
  };
}

export function WebSiteSchema({
  name,
  alternateName,
  url,
  searchUrlTemplate,
  description,
  inLanguage = "en-US",
  publisher,
}: WebSiteSchemaProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}/#website`,
    name,
    url,
    inLanguage,
    ...(alternateName && { alternateName }),
    ...(description && { description }),
  };

  if (searchUrlTemplate) {
    schema.potentialAction = {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: searchUrlTemplate,
      },
      "query-input": "required name=search_term_string",
    };
  }

  if (publisher) {
    schema.publisher = {
      "@type": "Organization",
      "@id": `${url}/#organization`,
      name: publisher.name,
      ...(publisher.logo && {
        logo: {
          "@type": "ImageObject",
          url: publisher.logo,
        },
      }),
      ...(publisher.url && { url: publisher.url }),
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
