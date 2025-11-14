import { Helmet } from "react-helmet-async";

/**
 * OrganizationSchema - Site-wide organization structured data
 *
 * Place this on the homepage to establish:
 * - Brand identity for AI search
 * - Contact information
 * - Social profiles
 * - Logo for knowledge panels
 */
export function OrganizationSchema() {
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://tryeatpal.com/#organization",
    "name": "EatPal",
    "alternateName": ["EatPal App", "EatPal Meal Planner"],
    "url": "https://tryeatpal.com",
    "logo": "https://tryeatpal.com/Logo-Green.png",
    "description":
      "EatPal is the only AI-powered meal planning platform using food chaining therapy to help parents systematically expand their child's diet. Evidence-based approach for picky eaters, ARFID, and selective eating.",
    "foundingDate": "2024",
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "Customer Support",
      "email": "Support@TryEatPal.com",
      "availableLanguage": "English",
      "areaServed": "US",
    },
    "sameAs": [
      // Add your social profiles here when available
      // "https://twitter.com/eatpal",
      // "https://facebook.com/eatpal",
      // "https://instagram.com/eatpal",
      // "https://linkedin.com/company/eatpal",
    ],
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://tryeatpal.com/search?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schemaData)}
      </script>
    </Helmet>
  );
}
