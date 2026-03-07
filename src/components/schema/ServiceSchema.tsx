/**
 * ServiceSchema - JSON-LD structured data for services
 *
 * Implements schema.org/Service for:
 * - Rich results for service offerings
 * - AI Overview service recommendations
 * - Service-specific Knowledge Panels
 *
 * Usage:
 * ```tsx
 * <ServiceSchema
 *   name="AI Meal Planning for Picky Eaters"
 *   description="Personalized meal plans using food chaining methodology"
 *   provider="EatPal"
 *   serviceType="Meal Planning"
 *   areaServed="US"
 *   offers={[{ price: "9.99", priceCurrency: "USD" }]}
 * />
 * ```
 */

import { Helmet } from "react-helmet-async";

export interface ServiceOffer {
  price: string;
  priceCurrency: string;
  name?: string;
  description?: string;
}

export interface ServiceSchemaProps {
  name: string;
  description: string;
  provider?: string;
  providerUrl?: string;
  serviceType?: string;
  areaServed?: string | string[];
  audience?: string;
  offers?: ServiceOffer[];
  url?: string;
  category?: string;
  hasOfferCatalog?: boolean;
}

export function ServiceSchema({
  name,
  description,
  provider = "EatPal",
  providerUrl = "https://tryeatpal.com",
  serviceType = "Meal Planning",
  areaServed = "US",
  audience,
  offers = [],
  url = "https://tryeatpal.com",
  category,
  hasOfferCatalog = false,
}: ServiceSchemaProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${url}/#service`,
    name,
    description,
    provider: {
      "@type": "Organization",
      "@id": `${providerUrl}/#organization`,
      name: provider,
      url: providerUrl,
    },
    ...(serviceType && { serviceType }),
    ...(category && { category }),
    ...(areaServed && {
      areaServed: Array.isArray(areaServed)
        ? areaServed.map((area) => ({
            "@type": "Country",
            name: area,
          }))
        : { "@type": "Country", name: areaServed },
    }),
    ...(audience && {
      audience: {
        "@type": "Audience",
        audienceType: audience,
      },
    }),
  };

  if (offers.length > 0 && hasOfferCatalog) {
    schema.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: `${name} Plans`,
      itemListElement: offers.map((offer) => ({
        "@type": "Offer",
        price: offer.price,
        priceCurrency: offer.priceCurrency,
        ...(offer.name && { name: offer.name }),
        ...(offer.description && {
          description: offer.description,
        }),
        availability: "https://schema.org/InStock",
      })),
    };
  } else if (offers.length > 0) {
    schema.offers = offers.map((offer) => ({
      "@type": "Offer",
      price: offer.price,
      priceCurrency: offer.priceCurrency,
      ...(offer.name && { name: offer.name }),
      ...(offer.description && { description: offer.description }),
      availability: "https://schema.org/InStock",
    }));
  }

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
}
