import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Loader2, ArrowDown, Check } from "lucide-react";
import "@/i18n/appLocale";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
  className?: string;
}

/**
 * Visual indicator for pull-to-refresh functionality
 * Shows progress based on pull distance and animates when refreshing
 */
export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
  className,
}: PullToRefreshIndicatorProps) {
  const { t } = useTranslation();
  const progress = Math.min((pullDistance / threshold) * 100, 100);
  const shouldTrigger = pullDistance >= threshold;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        // top-14: below the 56px mobile header, which would otherwise cover it.
        "pointer-events-none fixed top-14 left-0 right-0 z-30 flex items-center justify-center overflow-hidden motion-safe:transition-all motion-safe:duration-200",
        className
      )}
      style={{
        height: isRefreshing ? '60px' : `${pullDistance}px`,
        opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
      }}
    >
      <div className="flex flex-col items-center gap-2">
        {/* Icon */}
        <div
          className={cn(
            "relative flex items-center justify-center transition-all duration-200",
            shouldTrigger && !isRefreshing && "text-primary",
            isRefreshing && "text-primary"
          )}
        >
          {isRefreshing ? (
            <Loader2 className="h-6 w-6 motion-safe:animate-spin" aria-hidden="true" />
          ) : shouldTrigger ? (
            <Check className="h-6 w-6 motion-safe:animate-in motion-safe:zoom-in motion-safe:duration-200" aria-hidden="true" />
          ) : (
            <ArrowDown
              aria-hidden="true"
              className="h-6 w-6 motion-safe:transition-transform motion-safe:duration-200"
              style={{
                transform: `rotate(${progress * 1.8}deg)`,
              }}
            />
          )}
        </div>

        {/* Progress Circle */}
        {!isRefreshing && (
          <div className="relative w-12 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "absolute top-0 left-0 h-full transition-all duration-100 rounded-full",
                shouldTrigger ? "bg-primary" : "bg-primary/60"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Text */}
        <p className="text-xs text-muted-foreground font-medium">
          {isRefreshing
            ? t("pullToRefresh.refreshing", "Refreshing...")
            : shouldTrigger
            ? t("pullToRefresh.release", "Release to refresh")
            : t("pullToRefresh.pull", "Pull to refresh")}
        </p>
      </div>
    </div>
  );
}
