import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { BreadcrumbSchema, type BreadcrumbItem } from "@/components/schema/BreadcrumbSchema";
import { cn } from "@/lib/utils";

export interface BreadcrumbNavigationProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * BreadcrumbNavigation - Visual breadcrumb trail with structured data
 *
 * This component provides both:
 * 1. Visual breadcrumb navigation for users
 * 2. BreadcrumbList structured data for search engines
 *
 * Benefits:
 * - 🔍 Breadcrumbs displayed in Google search results
 * - 🏗️ Helps search engines understand site hierarchy
 * - 👥 Improves user navigation and UX
 * - 📊 Better internal linking structure
 * - 🤖 Enhanced AI understanding of site structure
 *
 * Usage:
 * ```tsx
 * <BreadcrumbNavigation
 *   items={[
 *     { name: 'Home', url: '/' },
 *     { name: 'Blog', url: '/blog' },
 *     { name: 'Article Title', url: '/blog/article' }
 *   ]}
 * />
 * ```
 */
export function BreadcrumbNavigation({
  items,
  className,
}: BreadcrumbNavigationProps) {
  // Don't render if there's only one item (homepage)
  if (items.length <= 1) {
    return null;
  }

  return (
    <>
      {/* Add structured data for search engines */}
      <BreadcrumbSchema items={items} />

      {/* Visual breadcrumb navigation */}
      <nav
        aria-label="Breadcrumb"
        className={cn("mb-6", className)}
      >
        <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const isFirst = index === 0;

            return (
              <li key={item.url} className="flex items-center gap-2">
                {/* Separator - not shown for first item */}
                {!isFirst && (
                  <ChevronRight
                    className="h-4 w-4 flex-shrink-0"
                    aria-hidden="true"
                  />
                )}

                {/* Breadcrumb item */}
                {isLast ? (
                  // Current page - not a link
                  <span
                    className="font-medium text-foreground"
                    aria-current="page"
                  >
                    {isFirst && (
                      <Home className="h-4 w-4 inline mr-1" aria-hidden="true" />
                    )}
                    {item.name}
                  </span>
                ) : (
                  // Link to previous pages
                  <Link
                    to={item.url}
                    className="hover:text-primary transition-colors inline-flex items-center"
                  >
                    {isFirst && (
                      <Home className="h-4 w-4 mr-1" aria-hidden="true" />
                    )}
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
