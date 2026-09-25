import { memo, useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  LayoutGrid,
  List,
  Heart,
  Clock,
  ChefHat,
  X,
  ShieldCheck,
  ThumbsUp,
  Star,
  Sparkles,
  ArrowUpDown,
} from "lucide-react";
import {
  KID_QUICK_FILTERS,
  RECIPE_QUICK_FILTERS,
  RECIPE_SORT_OPTIONS,
  isRecipeSortOption,
  type RecipeSortOption,
  type RecipeViewMode,
  type RecipeQuickFilter,
} from "@/hooks/useRecipeFilters";
import "@/i18n/appLocale";

interface RecipeToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: RecipeSortOption;
  onSortChange: (sort: RecipeSortOption) => void;
  viewMode: RecipeViewMode;
  onViewModeChange: (mode: RecipeViewMode) => void;
  quickFilters: RecipeQuickFilter[];
  onToggleQuickFilter: (filter: RecipeQuickFilter) => void;
  onClearFilters: () => void;
  resultCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  /**
   * True while any target kid's allergy list is not loaded (redacted offline
   * cache). The allergen-safe chip cannot answer then, so it is disabled.
   */
  allergenUnknown?: boolean;
  /** Hide the per-kid chips and sorts when the household has no kids yet. */
  hasKids?: boolean;
}

const SORT_DEFAULTS: Record<RecipeSortOption, string> = {
  "best-fit": "Best fit for kids",
  "kids-eat-most": "Kids eat most",
  newest: "Newest",
  "a-z": "A-Z",
  rating: "Rating",
  "cook-time": "Cook time",
  difficulty: "Difficulty",
  "times-made": "Times made",
  "recently-made": "Recently made",
};

const KID_SORTS: readonly RecipeSortOption[] = ["best-fit", "kids-eat-most"];

type ChipFilter = (typeof RECIPE_QUICK_FILTERS)[number];

const FILTER_DEFAULTS: Record<ChipFilter, string> = {
  "allergen-safe": "Allergen-safe",
  "safe-foods": "Safe foods",
  "no-dislikes": "No dislikes",
  "try-bite": "Try bite",
  quick: "Quick (30 min)",
  "ready-to-cook": "Ready to cook",
  favorites: "Favorites",
};

const iconClass = "h-3.5 w-3.5";
const FILTER_ICONS: Record<ChipFilter, ReactNode> = {
  "allergen-safe": <ShieldCheck className={iconClass} aria-hidden="true" />,
  "safe-foods": <Star className={iconClass} aria-hidden="true" />,
  "no-dislikes": <ThumbsUp className={iconClass} aria-hidden="true" />,
  "try-bite": <Sparkles className={iconClass} aria-hidden="true" />,
  quick: <Clock className={iconClass} aria-hidden="true" />,
  "ready-to-cook": <ChefHat className={iconClass} aria-hidden="true" />,
  favorites: <Heart className={iconClass} aria-hidden="true" />,
};

function RecipeToolbarImpl({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  quickFilters,
  onToggleQuickFilter,
  onClearFilters,
  resultCount,
  totalCount,
  hasActiveFilters,
  allergenUnknown = false,
  hasKids = true,
}: RecipeToolbarProps) {
  const { t } = useTranslation();
  const hintId = useId();

  const sortOptions = RECIPE_SORT_OPTIONS.filter((s) => hasKids || !KID_SORTS.includes(s));
  const chips = RECIPE_QUICK_FILTERS.filter((f) => hasKids || !KID_QUICK_FILTERS.includes(f));
  const showAllergenHint = hasKids && allergenUnknown;

  const countText = hasActiveFilters
    ? t("recipes.toolbar.countFiltered", {
        defaultValue_one: "{{count}} of {{total}} recipe",
        defaultValue_other: "{{count}} of {{total}} recipes",
        count: resultCount,
        total: totalCount,
      })
    : t("recipes.toolbar.count", {
        defaultValue_one: "{{count}} recipe",
        defaultValue_other: "{{count}} recipes",
        count: resultCount,
      });

  return (
    <div className="space-y-3 mb-6">
      {/* One row at every width: search grows, sort and view stay compact. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={t("recipes.toolbar.searchLabel", { defaultValue: "Search recipes" })}
            placeholder={t("recipes.toolbar.searchPlaceholder", {
              defaultValue: "Search recipes, ingredients, tags...",
            })}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 sm:h-10 pl-9 pr-11 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("recipes.toolbar.clearSearch", { defaultValue: "Clear search" })}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <Select
          value={sortBy}
          onValueChange={(v) => {
            if (isRecipeSortOption(v)) onSortChange(v);
          }}
        >
          <SelectTrigger
            className="h-11 w-14 shrink-0 gap-1 px-2 sm:h-10 sm:w-[180px] sm:px-3"
            aria-label={t("recipes.toolbar.sortLabel", { defaultValue: "Sort recipes" })}
          >
            <ArrowUpDown className="h-4 w-4 shrink-0 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline truncate">
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`recipes.toolbar.sort.${value}`, { defaultValue: SORT_DEFAULTS[value] })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div
          role="group"
          aria-label={t("recipes.toolbar.viewLabel", { defaultValue: "View" })}
          className="flex shrink-0 rounded-md border"
        >
          <Button
            type="button"
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="icon"
            className="h-11 w-11 sm:h-10 sm:w-10 rounded-r-none"
            onClick={() => onViewModeChange("grid")}
            aria-pressed={viewMode === "grid"}
            aria-label={t("recipes.toolbar.gridView", { defaultValue: "Grid view" })}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "ghost"}
            size="icon"
            className="h-11 w-11 sm:h-10 sm:w-10 rounded-l-none"
            onClick={() => onViewModeChange("list")}
            aria-pressed={viewMode === "list"}
            aria-label={t("recipes.toolbar.listView", { defaultValue: "List view" })}
          >
            <List className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Chips scroll sideways on a phone and wrap on wider screens. */}
      <div
        className="-mx-4 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        role="group"
        aria-label={t("recipes.toolbar.filtersLabel", { defaultValue: "Quick filters" })}
      >
        {chips.map((value) => {
          const isActive = quickFilters.includes(value);
          const disabled = value === "allergen-safe" && showAllergenHint;
          return (
            <Button
              key={value}
              type="button"
              variant={isActive ? "default" : "outline"}
              size="sm"
              className="h-10 sm:h-8 shrink-0 gap-1.5 rounded-full text-xs"
              onClick={() => onToggleQuickFilter(value)}
              aria-pressed={isActive}
              disabled={disabled}
              aria-describedby={disabled ? hintId : undefined}
            >
              {FILTER_ICONS[value]}
              {t(`recipes.toolbar.filter.${value}`, { defaultValue: FILTER_DEFAULTS[value] })}
            </Button>
          );
        })}
      </div>

      {showAllergenHint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {t("recipes.toolbar.allergenOffline", {
            defaultValue: "Allergy info loads when you're online",
          })}
        </p>
      )}

      <div className="flex min-h-[44px] items-center justify-between gap-2 sm:min-h-0">
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {countText}
        </p>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 sm:h-8 text-xs"
            onClick={onClearFilters}
          >
            {t("recipes.toolbar.clearAll", { defaultValue: "Clear all" })}
          </Button>
        )}
      </div>
    </div>
  );
}

export const RecipeToolbar = memo(RecipeToolbarImpl);
