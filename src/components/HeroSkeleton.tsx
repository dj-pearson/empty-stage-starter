import { cn } from '@/lib/utils';

interface HeroSkeletonProps {
  className?: string;
}

/**
 * Branded loading skeleton for the hero section
 * Matches the EnhancedHero layout to prevent layout shift
 */
export function HeroSkeleton({ className }: HeroSkeletonProps) {
  return (
    <section
      className={cn(
        "relative py-20 bg-gradient-to-b from-background via-trust-softPink/5 to-secondary/10 overflow-hidden min-h-[85vh] flex items-center",
        className
      )}
      aria-label="Loading hero content"
      aria-busy="true"
    >
      {/* Decorative background blobs - static version */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-1/4 -left-1/4 w-[800px] h-[800px] bg-trust-softPink/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px] animate-pulse" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Headline skeleton */}
          <div className="mb-6 space-y-3">
            <div className="h-12 md:h-16 bg-primary/10 rounded-lg mx-auto max-w-3xl animate-pulse" />
            <div className="h-12 md:h-16 bg-primary/10 rounded-lg mx-auto max-w-2xl animate-pulse" />
          </div>

          {/* Subheadline skeleton */}
          <div className="mb-10 space-y-2">
            <div className="h-6 bg-muted/40 rounded mx-auto max-w-xl animate-pulse" />
            <div className="h-6 bg-muted/40 rounded mx-auto max-w-lg animate-pulse" />
          </div>

          {/* CTA buttons skeleton */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <div className="h-14 w-48 bg-primary/20 rounded-full animate-pulse" />
            <div className="h-14 w-40 bg-muted/30 rounded-full animate-pulse" />
          </div>

          {/* Stats cards skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-card/50 backdrop-blur-sm rounded-xl p-4 border border-border/50 animate-pulse"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="h-8 bg-primary/20 rounded mb-2 w-16 mx-auto" />
                <div className="h-4 bg-muted/40 rounded w-20 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Accessible loading indicator for screen readers */}
      <span className="sr-only">Loading page content, please wait...</span>
    </section>
  );
}
