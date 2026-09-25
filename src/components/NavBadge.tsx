import { cn } from "@/lib/utils";
import { formatBadgeCount } from "@/lib/navBadges";
import type { NavBadgeValue } from "@/lib/navigation";

/**
 * The visual half of a nav badge (item 33). It is aria-hidden: the link it sits
 * in carries the whole sentence ("Grocery, 6 items left") as its accessible
 * name via src/hooks/useNavItemLabel.ts, so a screen reader hears the status
 * once, as part of the destination, rather than a bare "6" after it.
 *
 * `inline` trails the label (expanded sidebar); `corner` sits on the icon
 * (collapsed sidebar, bottom bar, More tiles). The entrance fades in only when
 * motion is allowed; with reduced motion it simply appears.
 */
export function NavBadge({
  value,
  placement,
  className,
}: {
  value: NavBadgeValue;
  placement: "inline" | "corner";
  className?: string;
}) {
  const corner = placement === "corner";
  const motion = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75";

  if (value.kind === "dot") {
    return (
      <span
        aria-hidden="true"
        data-testid="nav-badge-dot"
        className={cn(
          "block h-2 w-2 rounded-full bg-primary",
          corner ? "absolute -right-0.5 -top-0.5 ring-2 ring-card" : "ml-auto shrink-0",
          motion,
          className
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      data-testid="nav-badge-count"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5",
        "text-[11px] font-semibold leading-none tabular-nums text-primary-foreground",
        corner ? "absolute -right-2.5 -top-2 ring-2 ring-card" : "ml-auto shrink-0",
        motion,
        className
      )}
    >
      {formatBadgeCount(value.count)}
    </span>
  );
}
