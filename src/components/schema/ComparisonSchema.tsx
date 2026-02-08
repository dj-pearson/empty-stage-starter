/**
 * ComparisonSchema - JSON-LD structured data for comparison/vs pages
 *
 * Generates ItemList schema with product comparisons, optimized for:
 * - Google search comparison rich results
 * - AI search engines that favor structured comparison data
 * - Featured snippets for "[Product A] vs [Product B]" queries
 *
 * Usage:
 * ```tsx
 * <ComparisonSchema
 *   listName="EatPal vs Mealime: Picky Eater Meal Planning Comparison"
 *   description="Compare EatPal and Mealime for picky eater meal planning features..."
 *   items={[
 *     {
 *       name: "EatPal",
 *       description: "AI-powered food chaining meal planner for picky eaters",
 *       url: "https://tryeatpal.com",
 *       image: "https://tryeatpal.com/Logo-Green.png",
 *       rating: 4.8,
 *       ratingCount: 2847,
 *       priceRange: "Free - $19.99/month",
 *       features: ["Food chaining", "Multi-child", "AI predictions"],
 *     },
 *     {
 *       name: "Mealime",
 *       description: "General meal planning app",
 *       url: "https://mealime.com",
 *       priceRange: "Free - $5.99/month",
 *       features: ["Recipe browser", "Grocery lists"],
 *     },
 *   ]}
 * />
 * ```
 */

export interface ComparisonItem {
  name: string;
  description: string;
  url?: string;
  image?: string;
  rating?: number;
  ratingCount?: number;
  priceRange?: string;
  features?: string[];
}

export interface ComparisonSchemaProps {
  listName: string;
  description: string;
  items: ComparisonItem[];
}

export function ComparisonSchema({
  listName,
  description,
  items,
}: ComparisonSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    description,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => {
      const listItem: Record<string, unknown> = {
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "SoftwareApplication",
          name: item.name,
          description: item.description,
          applicationCategory: "HealthApplication",
          ...(item.url && { url: item.url }),
          ...(item.image && { image: item.image }),
          ...(item.priceRange && {
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "USD",
              description: item.priceRange,
            },
          }),
          ...(item.rating &&
            item.ratingCount && {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: item.rating.toString(),
                ratingCount: item.ratingCount.toString(),
                bestRating: "5",
                worstRating: "1",
              },
            }),
          ...(item.features && {
            featureList: item.features.join(", "),
          }),
        },
      };
      return listItem;
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
