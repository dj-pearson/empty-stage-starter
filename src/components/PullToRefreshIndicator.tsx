import { cn } from "@/lib/utils";
import { Loader2, ArrowDown, Check } from "lucide-react";

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
  const progress = Math.min((pullDistance / threshold) * 100, 100);
  const shouldTrigger = pullDistance >= threshold;

  return (
    <div
      className={cn(
        "absolute top-0 left-0 right-0 flex items-center justify-center transition-all duration-200",
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
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : shouldTrigger ? (
            <Check className="h-6 w-6 animate-in zoom-in duration-200" />
          ) : (
            <ArrowDown
              className="h-6 w-6 transition-transform duration-200"
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
            ? "Refreshing..."
            : shouldTrigger
            ? "Release to refresh"
            : "Pull to refresh"}
        </p>
      </div>
    </div>
  );
}
