import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface RelatedPage {
  title: string;
  description: string;
  href: string;
  icon?: React.ReactNode;
}

interface RelatedPagesProps {
  pages: RelatedPage[];
  title?: string;
  className?: string;
}

/**
 * RelatedPages component for internal linking
 *
 * Displays a grid of related pages to improve internal linking and user navigation.
 * Important for SEO as it helps search engines understand site structure.
 *
 * Usage:
 * ```tsx
 * <RelatedPages
 *   title="Related Features"
 *   pages={[
 *     { title: "Try Bites", description: "Track food exposures", href: "/features/try-bites" },
 *     { title: "Nutrition", description: "Monitor intake", href: "/features/nutrition-tracking" }
 *   ]}
 * />
 * ```
 */
export const RelatedPages = memo(function RelatedPages({
  pages,
  title = "Related Pages",
  className,
}: RelatedPagesProps) {
  if (pages.length === 0) return null;

  return (
    <section className={cn("py-12", className)}>
      <h2 className="text-2xl font-heading font-bold mb-6 text-primary">
        {title}
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pages.map((page) => (
          <Link key={page.href} to={page.href} className="group">
            <Card className="h-full transition-all duration-300 group-hover:shadow-lg group-hover:border-primary/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg group-hover:text-primary transition-colors">
                    {page.icon && (
                      <span className="mr-2 inline-flex">{page.icon}</span>
                    )}
                    {page.title}
                  </CardTitle>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="line-clamp-2">
                  {page.description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
});
