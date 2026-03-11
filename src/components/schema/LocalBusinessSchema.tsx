/**
 * LocalBusinessSchema - JSON-LD structured data for local/online business
 *
 * Implements schema.org/LocalBusiness (or OnlineBusiness) for:
 * - Google Knowledge Panel eligibility
 * - AI Overview business citations
 * - Google Maps / local search
 * - Business contact information in search results
 *
 * For EatPal, this is primarily used as OnlineBusiness since the service
 * is SaaS-based, but the schema supports both local and online businesses.
 *
 * Usage:
 * ```tsx
 * <LocalBusinessSchema
 *   name="EatPal"
 *   description="AI-powered meal planning for picky eaters"
 *   url="https://tryeatpal.com"
 *   email="Support@TryEatPal.com"
 *   priceRange="Free - $19.99/month"
 * />
 * ```
 */

import { Helmet } from "react-helmet-async";

export interface BusinessHours {
  dayOfWeek: string | string[];
  opens: string;
  closes: string;
}

export interface LocalBusinessSchemaProps {
  name: string;
  description: string;
  url: string;
  logo?: string;
  email?: string;
  telephone?: string;
  priceRange?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  geo?: {
    latitude: number;
    longitude: number;
  };
  openingHours?: BusinessHours[];
  sameAs?: string[];
  areaServed?: string | string[];
  serviceType?: string;
  isOnlineBusiness?: boolean;
}

export function LocalBusinessSchema({
  name = "EatPal",
  description = "AI-powered meal planning platform using food chaining therapy for picky eaters, ARFID, and selective eating challenges.",
  url = "https://tryeatpal.com",
  logo = "https://tryeatpal.com/Logo-Green.webp",
  email = "Support@TryEatPal.com",
  telephone,
  priceRange = "Free - $19.99/month",
  address,
  geo,
  openingHours,
  sameAs = [],
  areaServed = "US",
  serviceType = "Meal Planning Software",
  isOnlineBusiness = true,
}: LocalBusinessSchemaProps) {
  const businessType = isOnlineBusiness
    ? "OnlineBusiness"
    : "LocalBusiness";

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": businessType,
    "@id": `${url}/#business`,
    name,
    description,
    url,
    logo: {
      "@type": "ImageObject",
      url: logo,
    },
    priceRange,
    ...(email && { email }),
    ...(telephone && { telephone }),
    ...(serviceType && { additionalType: serviceType }),
    ...(areaServed && {
      areaServed: Array.isArray(areaServed)
        ? areaServed.map((area) => ({
            "@type": "Country",
            name: area,
          }))
        : { "@type": "Country", name: areaServed },
    }),
  };

  if (address) {
    schema.address = {
      "@type": "PostalAddress",
      ...address,
    };
  }

  if (geo) {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: geo.latitude,
      longitude: geo.longitude,
    };
  }

  if (openingHours && openingHours.length > 0) {
    schema.openingHoursSpecification = openingHours.map((hours) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: hours.dayOfWeek,
      opens: hours.opens,
      closes: hours.closes,
    }));
  }

  if (sameAs.length > 0) {
    schema.sameAs = sameAs;
  }

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
}
