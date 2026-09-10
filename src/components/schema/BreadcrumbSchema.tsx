import { Helmet } from "react-helmet-async";

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface BreadcrumbSchemaProps {
  items: BreadcrumbItem[];
}

const SITE_ORIGIN = "https://tryeatpal.com";

/**
 * A ListItem's `item` has to be the page's URL, and a URL in structured data means an
 * absolute one. Google discards a BreadcrumbList whose items are paths.
 *
 * Callers were split on this and had no way to all be right. BreadcrumbNavigation
 * renders `<Link to={item.url}>` alongside the schema, so its callers pass "/blog" --
 * a router path, which is what a Link needs -- and those paths went into the schema
 * untouched. So every blog post, /blog, /guides, the quiz results page and the whole
 * programmatic guide cluster (PseoPage feeds it buildBreadcrumbs output, which is
 * relative by construction) emitted a breadcrumb Google threw away. The six callers
 * that use BreadcrumbSchema directly pass absolute URLs and were fine.
 *
 * Normalising here rather than at each call site is what lets both hold: the visible
 * links stay relative, the schema comes out absolute, and a caller that already passes
 * an absolute URL is untouched.
 */
function absoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
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
      "item": absoluteUrl(item.url),
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
