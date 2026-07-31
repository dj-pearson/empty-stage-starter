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
 * ⚠️ DO NOT USE THIS ON A PAGE ABOUT EATPAL ITSELF.
 *
 * Google's structured data policy prohibits "self-serving reviews": review or
 * aggregateRating markup about an entity, published on a site controlled by that
 * entity. Such markup is ineligible for review rich results, and inventing the
 * ratings behind it (a hardcoded ratingValue/reviewCount that no review store backs)
 * is a spam violation that can trigger a manual action suppressing rich results for
 * the entire domain — not just the offending page.
 * https://developers.google.com/search/docs/appearance/structured-data/review-snippet
 *
 * This component was removed from the homepage for exactly that reason. It is kept
 * only for pages that review a THIRD-PARTY item (e.g. a comparison page rating another
 * product), where the ratings come from a real, auditable review store.
 *
 * Before using it, both must be true:
 *   1. The item reviewed is not EatPal or an EatPal offering.
 *   2. ratingValue/reviewCount are read from real stored reviews, not literals.
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
