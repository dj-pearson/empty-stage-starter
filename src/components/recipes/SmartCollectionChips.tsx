import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Check, FolderOpen, Timer, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SmartCollection } from "@/lib/recipeSmartCollections";
import "@/i18n/appLocale";

interface SmartCollectionChipsProps {
  collections: readonly SmartCollection[];
  selectedId: string | null;
  /** Selecting the active chip again clears the filter. */
  onSelect: (id: string | null) => void;
  className?: string;
}

function iconFor(kind: SmartCollection["kind"]) {
  if (kind === "safe") return <Check className="h-4 w-4 text-safe-food" aria-hidden="true" />;
  if (kind === "everyone") return <Users2 className="h-4 w-4" aria-hidden="true" />;
  if (kind === "quick") return <Timer className="h-4 w-4" aria-hidden="true" />;
  return <FolderOpen className="h-4 w-4" aria-hidden="true" />;
}

const chipClass = (active: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
    "motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent",
  );

/**
 * The computed collections (item 11), above the user's own: one "Safe for"
 * per kid, "Everyone can eat", "Quick" and "Unfiled", each with its count.
 */
export const SmartCollectionChips = memo(function SmartCollectionChips({
  collections,
  selectedId,
  onSelect,
  className,
}: SmartCollectionChipsProps) {
  const { t } = useTranslation();
  if (collections.length === 0) return null;

  const label = (c: SmartCollection): string => {
    switch (c.kind) {
      case "safe":
        return t("recipes.smart.safeFor", { defaultValue: "Safe for {{name}}", name: c.kid?.name ?? "" });
      case "everyone":
        return t("recipes.smart.everyone", { defaultValue: "Everyone can eat" });
      case "quick":
        return t("recipes.smart.quick", { defaultValue: "Quick" });
      default:
        return t("recipes.smart.unfiled", { defaultValue: "Unfiled" });
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("recipes.smart.label", { defaultValue: "Smart collections" })}
      className={cn("-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]", className)}
      data-testid="smart-collections"
    >
      {collections.map((c) => {
        const active = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={chipClass(active)}
            onClick={() => onSelect(active ? null : c.id)}
            title={
              c.kind === "quick"
                ? t("recipes.smart.quickHint", { defaultValue: "30 minutes or less" })
                : c.kind === "everyone"
                  ? t("recipes.smart.everyoneHint", {
                      defaultValue: "Every child eats or is trying it, and no allergen for anyone",
                    })
                  : undefined
            }
          >
            {active ? <Check className="h-4 w-4" aria-hidden="true" /> : iconFor(c.kind)}
            <span className="max-w-[12rem] truncate">{label(c)}</span>
            <span className="tabular-nums opacity-80">{c.count}</span>
          </button>
        );
      })}
    </div>
  );
});
