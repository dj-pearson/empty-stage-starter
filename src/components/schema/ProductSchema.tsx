/**
 * ProductSchema - JSON-LD structured data for Product pages
 *
 * Implements schema.org/Product for rich results including:
 * - Google Shopping rich snippets
 * - AI Overview product recommendations
 * - Price and availability display in search
 * - Aggregate rating stars in search results
 *
 * Usage:
 * ```tsx
 * <ProductSchema
 *   name="EatPal Pro Plan"
 *   description="AI-powered meal planning for unlimited children"
 *   image="https://tryeatpal.com/Cover.webp"
 *   brand="EatPal"
 *   offers={[
 *     { price: "9.99", priceCurrency: "USD", availability: "InStock" }
 *   ]}
 *   aggregateRating={{ ratingValue: "4.8", reviewCount: "2847" }}
 * />
 * ```
 */

import { Helmet } from "react-helmet-async";

export interface ProductOffer {
  price: string;
  priceCurrency: string;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
  name?: string;
  priceValidUntil?: string;
  url?: string;
}

export interface ProductRating {
  ratingValue: string;
  reviewCount: string;
  bestRating?: string;
  worstRating?: string;
}

export interface ProductSchemaProps {
  name: string;
  description: string;
  image?: string | string[];
  brand?: string;
  sku?: string;
  offers?: ProductOffer[];
  aggregateRating?: ProductRating;
  category?: string;
  url?: string;
}

export function ProductSchema({
  name,
  description,
  image,
  brand = "EatPal",
  sku,
  offers = [],
  aggregateRating,
  category,
  url = "https://tryeatpal.com",
}: ProductSchemaProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}/#product`,
    name,
    description,
    brand: {
      "@type": "Brand",
      name: brand,
    },
    ...(image && {
      image: Array.isArray(image) ? image : [image],
    }),
    ...(sku && { sku }),
    ...(category && { category }),
  };

  if (offers.length > 0) {
    schema.offers = offers.map((offer) => ({
      "@type": "Offer",
      price: offer.price,
      priceCurrency: offer.priceCurrency,
      availability: `https://schema.org/${offer.availability || "InStock"}`,
      ...(offer.name && { name: offer.name }),
      ...(offer.priceValidUntil && {
        priceValidUntil: offer.priceValidUntil,
      }),
      ...(offer.url && { url: offer.url }),
    }));
  }

  if (aggregateRating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: aggregateRating.ratingValue,
      reviewCount: aggregateRating.reviewCount,
      bestRating: aggregateRating.bestRating || "5",
      worstRating: aggregateRating.worstRating || "1",
    };
  }

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
}
