import { memo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  name: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

/**
 * Breadcrumbs component with visual navigation and JSON-LD schema
 *
 * Usage:
 * ```tsx
 * <Breadcrumbs
 *   items={[
 *     { name: "Features", href: "/features" },
 *     { name: "Kids Meal Planning", href: "/features/kids-meal-planning" }
 *   ]}
 * />
 * ```
 */
export const Breadcrumbs = memo(function Breadcrumbs({
  items,
  className,
}: BreadcrumbsProps) {
  const baseUrl = "https://tryeatpal.com";

  // Generate JSON-LD structured data
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: baseUrl,
      },
      ...items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 2,
        name: item.name,
        item: `${baseUrl}${item.href}`,
      })),
    ],
  };

  return (
    <>
      {/* JSON-LD Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Visual Breadcrumbs */}
      <nav
        aria-label="Breadcrumb"
        className={cn(
          "flex items-center text-sm text-muted-foreground",
          className
        )}
      >
        <ol className="flex items-center flex-wrap gap-1">
          <li className="flex items-center">
            <Link
              to="/"
              className="flex items-center hover:text-primary transition-colors"
              aria-label="Home"
            >
              <Home className="h-4 w-4" />
            </Link>
          </li>

          {items.map((item, index) => (
            <li key={item.href} className="flex items-center">
              <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0" />
              {index === items.length - 1 ? (
                <span
                  className="font-medium text-foreground truncate max-w-[200px]"
                  aria-current="page"
                >
                  {item.name}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="hover:text-primary transition-colors truncate max-w-[200px]"
                >
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
});
