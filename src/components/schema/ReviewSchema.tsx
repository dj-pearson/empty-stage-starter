import { Helmet } from "react-helmet-async";

export interface Review {
  author: string;
  datePublished: string;
  reviewBody: string;
  ratingValue: number;
}

export interface ReviewSchemaProps {
  itemName: string;
  itemDescription?: string;
  itemImage?: string;
  aggregateRating: {
    ratingValue: number;
    reviewCount: number;
    bestRating?: number;
    worstRating?: number;
  };
  reviews?: Review[];
  itemUrl?: string;
}

/**
 * ReviewSchema - Aggregate review and rating structured data
 *
 * This component generates Product schema with AggregateRating markup
 * to enable star ratings in Google search results.
 *
 * Benefits:
 * - ⭐ Star ratings displayed in search results
 * - 📈 20-35% increase in click-through rate (CTR)
 * - 🎯 Prominent placement in Google SERPs
 * - 🤖 Better understanding by AI search engines
 * - 💪 Enhanced E-E-A-T signals
 *
 * Usage:
 * ```tsx
 * <ReviewSchema
 *   itemName="EatPal - Meal Planning for Picky Eaters"
 *   itemDescription="AI-powered meal planning platform"
 *   aggregateRating={{
 *     ratingValue: 4.8,
 *     reviewCount: 2847
 *   }}
 *   reviews={[...]}
 * />
 * ```
 */
export function ReviewSchema({
  itemName,
  itemDescription,
  itemImage = "https://tryeatpal.com/Cover.webp",
  aggregateRating,
  reviews = [],
  itemUrl = "https://tryeatpal.com",
}: ReviewSchemaProps) {
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": itemName,
    "description": itemDescription || itemName,
    "image": itemImage,
    "brand": {
      "@type": "Brand",
      "name": "EatPal",
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": aggregateRating.ratingValue,
      "reviewCount": aggregateRating.reviewCount,
      "bestRating": aggregateRating.bestRating || 5,
      "worstRating": aggregateRating.worstRating || 1,
    },
    ...(reviews.length > 0 && {
      "review": reviews.map((review) => ({
        "@type": "Review",
        "author": {
          "@type": "Person",
          "name": review.author,
        },
        "datePublished": review.datePublished,
        "reviewBody": review.reviewBody,
        "reviewRating": {
          "@type": "Rating",
          "ratingValue": review.ratingValue,
          "bestRating": 5,
          "worstRating": 1,
        },
      })),
    }),
    "url": itemUrl,
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schemaData)}
      </script>
    </Helmet>
  );
}
