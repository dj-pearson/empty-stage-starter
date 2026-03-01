import { Helmet } from "react-helmet-async";

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
 */
export function SoftwareAppSchema({
  name = "EatPal",
  description = "The only AI-powered platform using food chaining therapy to help parents systematically expand their child's diet—from 5 foods to 50+.",
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
  aggregateRating = {
    ratingValue: "4.8",
    ratingCount: "2847",
  },
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
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": aggregateRating.ratingValue,
      "ratingCount": aggregateRating.ratingCount,
      "bestRating": "5",
      "worstRating": "1",
    },
    "featureList": featureList,
    "url": "https://tryeatpal.com",
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
