import { Helmet } from "react-helmet-async";
import { APP_STORE_URL, storeSameAs } from "@/lib/app-store";

export interface SoftwareAppSchemaProps {
  name?: string;
  description?: string;
  applicationCategory?: string;
  operatingSystem?: string;
  offers?: {
    price: string;
    priceCurrency: string;
    name?: string;
  }[];
  aggregateRating?: {
    ratingValue: string;
    ratingCount: string;
  };
  featureList?: string[];
}

/**
 * SoftwareAppSchema - Structured data for web applications
 *
 * Optimized for:
 * - App store-like rich results
 * - AI recommendations
 * - Comparison queries
 * - Feature highlighting
 *
 * `aggregateRating` is OPT-IN and must come from a real, auditable rating store.
 * It used to default to a hardcoded 4.8 from 2847 ratings, which meant every page
 * rendering this component asserted a review count that nothing backed. Google treats
 * ratings a site publishes about its own product as self-serving — ineligible for rich
 * results, and a manual-action risk when the numbers are invented. Leave it unset
 * unless you are passing through counts you can point at.
 */
export function SoftwareAppSchema({
  name = "EatPal",
  description = "An AI meal planning platform that applies food chaining therapy to help parents systematically expand their child's diet.",
  applicationCategory = "HealthApplication",
  operatingSystem = "Web, iOS, Android",
  offers = [
    {
      price: "0",
      priceCurrency: "USD",
      name: "Free Plan",
    },
    {
      price: "9.99",
      priceCurrency: "USD",
      name: "Pro Plan",
    },
  ],
  aggregateRating,
  featureList = [
    "Food chaining therapy implementation",
    "AI meal plan generation",
    "Progress tracking",
    "Safe food library",
    "Grocery list automation",
    "Multi-child support",
    "Nutrition tracking",
    "Try bite methodology",
  ],
}: SoftwareAppSchemaProps) {
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": "https://tryeatpal.com/#softwareapplication",
    "name": name,
    "description": description,
    "applicationCategory": applicationCategory,
    "operatingSystem": operatingSystem,
    "offers": offers.map((offer) => ({
      "@type": "Offer",
      "price": offer.price,
      "priceCurrency": offer.priceCurrency,
      ...(offer.name && { "name": offer.name }),
      "availability": "https://schema.org/InStock",
    })),
    ...(aggregateRating && {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": aggregateRating.ratingValue,
        "ratingCount": aggregateRating.ratingCount,
        "bestRating": "5",
        "worstRating": "1",
      },
    }),
    "featureList": featureList,
    "url": "https://tryeatpal.com",
    // installUrl/sameAs tie this website to the App Store listing so search engines
    // treat them as one entity instead of two unrelated things named EatPal.
    ...(APP_STORE_URL && { "installUrl": APP_STORE_URL }),
    ...(storeSameAs().length > 0 && { "sameAs": storeSameAs() }),
    "screenshot": "https://tryeatpal.com/Cover.webp",
    "softwareVersion": "2.0",
    "datePublished": "2024-01-01",
    "author": {
      "@type": "Organization",
      "@id": "https://tryeatpal.com/#organization",
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
