import { Helmet } from "react-helmet-async";

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface BreadcrumbSchemaProps {
  items: BreadcrumbItem[];
}

/**
 * BreadcrumbSchema - Navigation breadcrumb structured data
 *
 * Improves:
 * - Search result breadcrumb display
 * - Site structure understanding
 * - Navigation clarity for AI
 */
export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url,
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schemaData)}
      </script>
    </Helmet>
  );
}
