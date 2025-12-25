import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Breadcrumb Component with Schema Markup
 *
 * Provides:
 * - Visual breadcrumb navigation
 * - JSON-LD BreadcrumbList schema for rich snippets
 * - Improved site hierarchy understanding for search engines
 * - Better user navigation
 * - Accessibility with ARIA labels
 *
 * SEO Benefits:
 * - Rich snippets in Google search results
 * - Better internal linking structure
 * - Improved click-through rates from SERPs
 * - Clearer site hierarchy for crawlers
 *
 * Usage:
 * ```tsx
 * <Breadcrumbs
 *   items={[
 *     { label: 'Blog', href: '/blog' },
 *     { label: 'Article Title', href: '/blog/article-slug' }
 *   ]}
 * />
 * ```
 */

export interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  showHome?: boolean;
  homeLabel?: string;
}

export function Breadcrumbs({
  items,
  className,
  showHome = true,
  homeLabel = "Home",
}: BreadcrumbsProps) {
  // Build the full breadcrumb list including home if requested
  const fullItems: BreadcrumbItem[] = showHome
    ? [{ label: homeLabel, href: "/" }, ...items]
    : items;

  // Generate JSON-LD structured data for search engines
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": fullItems.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.label,
      "item": `https://tryeatpal.com${item.href}`,
    })),
  };

  return (
    <>
      {/* JSON-LD Schema Markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      {/* Visual Breadcrumbs */}
      <nav
        aria-label="Breadcrumb"
        className={cn("text-sm text-muted-foreground", className)}
      >
        <ol className="flex items-center space-x-2">
          {fullItems.map((item, index) => {
            const isLast = index === fullItems.length - 1;
            const isFirst = index === 0;

            return (
              <li key={item.href} className="flex items-center">
                {index > 0 && (
                  <ChevronRight
                    className="h-4 w-4 mx-2 flex-shrink-0"
                    aria-hidden="true"
                  />
                )}

                {isLast ? (
                  <span
                    className="font-medium text-foreground"
                    aria-current="page"
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.href}
                    className="hover:text-primary transition-colors inline-flex items-center"
                    aria-label={
                      isFirst && showHome
                        ? `Navigate to ${item.label}`
                        : undefined
                    }
                  >
                    {isFirst && showHome && (
                      <Home className="h-4 w-4 mr-1" aria-hidden="true" />
                    )}
                    {item.label}
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

/**
 * Breadcrumb Wrapper Component
 *
 * Provides consistent styling and spacing for breadcrumbs across the site
 */
interface BreadcrumbWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function BreadcrumbWrapper({
  children,
  className,
}: BreadcrumbWrapperProps) {
  return (
    <div
      className={cn(
        "container mx-auto px-4 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Auto-generate breadcrumbs from pathname
 *
 * Utility function to automatically create breadcrumb items from the current URL path.
 *
 * Usage:
 * ```tsx
 * const breadcrumbs = generateBreadcrumbsFromPath('/blog/category/article-name');
 * // Returns: [
 * //   { label: 'Blog', href: '/blog' },
 * //   { label: 'Category', href: '/blog/category' },
 * //   { label: 'Article Name', href: '/blog/category/article-name' }
 * // ]
 * ```
 */
export function generateBreadcrumbsFromPath(
  pathname: string,
  customLabels?: Record<string, string>
): BreadcrumbItem[] {
  // Remove leading and trailing slashes
  const cleanPath = pathname.replace(/^\/|\/$/g, "");

  // Split into segments
  const segments = cleanPath.split("/").filter(Boolean);

  // Build breadcrumb items
  const items: BreadcrumbItem[] = [];
  let currentPath = "";

  segments.forEach((segment) => {
    currentPath += `/${segment}`;

    // Convert slug to readable label
    const defaultLabel = segment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    // Use custom label if provided, otherwise use default
    const label = customLabels?.[segment] || defaultLabel;

    items.push({
      label,
      href: currentPath,
    });
  });

  return items;
}

/**
 * Common breadcrumb configurations for EatPal pages
 *
 * Pre-defined breadcrumb paths for commonly used routes
 */
export const breadcrumbConfigs: Record<string, BreadcrumbItem[]> = {
  pricing: [{ label: "Pricing", href: "/pricing" }],

  blog: [{ label: "Blog", href: "/blog" }],

  contact: [{ label: "Contact", href: "/contact" }],

  faq: [{ label: "FAQ", href: "/faq" }],

  about: [{ label: "About", href: "/about" }],

  features: [{ label: "Features", href: "/features" }],

  "features/kids-meal-planning": [
    { label: "Features", href: "/features" },
    { label: "Kids Meal Planning", href: "/features/kids-meal-planning" },
  ],

  "features/picky-eater-solutions": [
    { label: "Features", href: "/features" },
    { label: "Picky Eater Solutions", href: "/features/picky-eater-solutions" },
  ],

  "features/try-bites": [
    { label: "Features", href: "/features" },
    { label: "Try Bites", href: "/features/try-bites" },
  ],

  "solutions/arfid-meal-planning": [
    { label: "Solutions", href: "/solutions" },
    { label: "ARFID Meal Planning", href: "/solutions/arfid-meal-planning" },
  ],

  "solutions/toddler-meal-planning": [
    { label: "Solutions", href: "/solutions" },
    { label: "Toddler Meal Planning", href: "/solutions/toddler-meal-planning" },
  ],
};

/**
 * Get breadcrumbs for a specific route
 *
 * Usage:
 * ```tsx
 * const breadcrumbs = getBreadcrumbsForRoute('/features/kids-meal-planning');
 * <Breadcrumbs items={breadcrumbs} />
 * ```
 */
export function getBreadcrumbsForRoute(pathname: string): BreadcrumbItem[] {
  // Remove leading slash
  const cleanPath = pathname.replace(/^\//, "");

  // Return pre-configured breadcrumbs if available
  if (breadcrumbConfigs[cleanPath]) {
    return breadcrumbConfigs[cleanPath];
  }

  // Auto-generate from path if not configured
  return generateBreadcrumbsFromPath(pathname);
}
