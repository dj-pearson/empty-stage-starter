import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { RecipeCollection } from "@/types";
import { BookOpen, ChevronDown, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { collectionIcon, collectionTone } from "@/lib/collectionAppearance";
import "@/i18n/appLocale";

interface RecipeCollectionsSelectorProps {
  collections: RecipeCollection[];
  /** Recipes per collection id. */
  counts: Record<string, number>;
  /** recipes.length: the "All recipes" count. Not a sum of memberships. */
  totalRecipeCount: number;
  selectedId: string | null;
  onSelect: (collectionId: string | null) => void;
  onCreate: () => void;
  onManage: () => void;
  /** Collections failed to load; the control stays visible but inert. */
  disabled?: boolean;
  /** Tooltip shown while disabled. */
  disabledReason?: string;
  className?: string;
}

/**
 * Collection filter for the recipe library. Below md it is a horizontally
 * scrolling row of toggle chips (one tap to switch, nothing hidden behind a
 * menu); from md up it is the compact dropdown.
 */
export function RecipeCollectionsSelector({
  collections,
  counts,
  totalRecipeCount,
  selectedId,
  onSelect,
  onCreate,
  onManage,
  disabled = false,
  disabledReason,
  className,
}: RecipeCollectionsSelectorProps) {
  const { t } = useTranslation();
  const selected = selectedId ? collections.find((c) => c.id === selectedId) ?? null : null;
  const allLabel = t("recipes.collections.all", { defaultValue: "All recipes" });
  const reason =
    disabledReason ??
    t("recipes.collections.unavailable", {
      defaultValue: "Collections couldn't load. We'll retry when you're back online.",
    });

  const SelectedIcon = selected ? collectionIcon(selected.icon) : BookOpen;
  const selectedTone = selected ? collectionTone(selected.color).text : "text-muted-foreground";
  const selectedCount = selected ? counts[selected.id] ?? 0 : totalRecipeCount;

  const chipClass = (active: boolean) =>
    cn(
      "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
      "motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:cursor-not-allowed disabled:opacity-60",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
    );

  const chips = (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:hidden"
      role="group"
      aria-label={t("recipes.collections.label", { defaultValue: "Collections" })}
    >
      <button
        type="button"
        className={chipClass(selectedId === null)}
        aria-pressed={selectedId === null}
        onClick={() => onSelect(null)}
      >
        {allLabel}
        <span className="tabular-nums opacity-80">{totalRecipeCount}</span>
      </button>
      {collections.map((collection) => {
        const Icon = collectionIcon(collection.icon);
        const active = collection.id === selectedId;
        return (
          <button
            key={collection.id}
            type="button"
            className={chipClass(active)}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(collection.id)}
          >
            <Icon
              className={cn("h-4 w-4", active ? "" : collectionTone(collection.color).text)}
              aria-hidden="true"
            />
            <span className="max-w-[10rem] truncate">{collection.name}</span>
            <span className="tabular-nums opacity-80">{counts[collection.id] ?? 0}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={chipClass(false)}
        onClick={onCreate}
        disabled={disabled}
        aria-label={t("recipes.collections.create", { defaultValue: "New collection" })}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span>{t("recipes.collections.new", { defaultValue: "New" })}</span>
      </button>
      {collections.length > 0 && (
        <button
          type="button"
          className={chipClass(false)}
          onClick={onManage}
          disabled={disabled}
          aria-label={t("recipes.collections.manage", { defaultValue: "Manage collections" })}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const trigger = (
    <Button
      variant="outline"
      className="min-w-[200px] justify-between"
      disabled={disabled}
      aria-label={
        selected
          ? t("recipes.collections.showing", { defaultValue: "Collection: {{name}}", name: selected.name })
          : t("recipes.collections.showingAll", { defaultValue: "Collection: all recipes" })
      }
    >
      <span className="flex min-w-0 items-center gap-2">
        <SelectedIcon className={cn("h-4 w-4 shrink-0", selectedTone)} aria-hidden="true" />
        <span className="truncate">{selected ? selected.name : allLabel}</span>
        <Badge variant="secondary" className="ml-1 tabular-nums">
          {selectedCount}
        </Badge>
      </span>
      <ChevronDown className="ml-2 h-4 w-4 opacity-50" aria-hidden="true" />
    </Button>
  );

  const dropdown = (
    <div className="hidden items-center gap-2 md:flex">
      {disabled ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled button fires no pointer events, so the span carries the tooltip. */}
              <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {trigger}
              </span>
            </TooltipTrigger>
            <TooltipContent>{reason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[260px]">
            <DropdownMenuItem onSelect={() => onSelect(null)} aria-current={selectedId === null ? "true" : undefined}>
              <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1">{allLabel}</span>
              <Badge variant="secondary" className="ml-2 tabular-nums">
                {totalRecipeCount}
              </Badge>
            </DropdownMenuItem>

            {collections.length > 0 && <DropdownMenuSeparator />}

            {collections.map((collection) => {
              const Icon = collectionIcon(collection.icon);
              const count = counts[collection.id] ?? 0;
              return (
                <DropdownMenuItem
                  key={collection.id}
                  onSelect={() => onSelect(collection.id)}
                  aria-current={collection.id === selectedId ? "true" : undefined}
                >
                  <Icon className={cn("mr-2 h-4 w-4", collectionTone(collection.color).text)} aria-hidden="true" />
                  <span className="flex-1 truncate">{collection.name}</span>
                  <Badge variant="secondary" className="ml-2 tabular-nums">
                    {count}
                  </Badge>
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreate}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("recipes.collections.create", { defaultValue: "New collection" })}
            </DropdownMenuItem>
            {collections.length > 0 && (
              <DropdownMenuItem onSelect={onManage}>
                <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("recipes.collections.manage", { defaultValue: "Manage collections" })}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  return (
    <div className={cn("min-w-0", className)}>
      {chips}
      {dropdown}
      {disabled && (
        <p className="mt-1 text-xs text-muted-foreground md:hidden" role="status">
          {reason}
        </p>
      )}
    </div>
  );
}
