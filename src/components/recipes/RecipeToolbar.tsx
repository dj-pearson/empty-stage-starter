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
  Star,
  ChefHat,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  RecipeSortOption,
  RecipeViewMode,
  RecipeQuickFilter,
} from "@/hooks/useRecipeFilters";

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
}

const SORT_OPTIONS: { value: RecipeSortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'a-z', label: 'A-Z' },
  { value: 'rating', label: 'Rating' },
  { value: 'cook-time', label: 'Cook Time' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'times-made', label: 'Times Made' },
  { value: 'recently-made', label: 'Recently Made' },
];

const QUICK_FILTERS: { value: RecipeQuickFilter; label: string; icon: React.ReactNode }[] = [
  { value: 'favorites', label: 'Favorites', icon: <Heart className="h-3 w-3" /> },
  { value: 'ready-to-cook', label: 'Ready to Cook', icon: <ChefHat className="h-3 w-3" /> },
  { value: 'quick', label: 'Quick (<30min)', icon: <Clock className="h-3 w-3" /> },
  { value: 'kid-approved', label: 'Kid Approved', icon: <Star className="h-3 w-3" /> },
];

export function RecipeToolbar({
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
}: RecipeToolbarProps) {
  return (
    <div className="space-y-3 mb-6">
      {/* Search + Sort + View Toggle row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipes, ingredients, tags..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={(v) => onSortChange(v as RecipeSortOption)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => onViewModeChange('grid')}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => onViewModeChange('list')}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map((filter) => {
          const isActive = quickFilters.includes(filter.value);
          return (
            <Button
              key={filter.value}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className={cn("h-7 text-xs gap-1", isActive && "shadow-sm")}
              onClick={() => onToggleQuickFilter(filter.value)}
            >
              {filter.icon}
              {filter.label}
            </Button>
          );
        })}

        {/* Result count & clear */}
        <div className="flex items-center gap-2 ml-auto">
          {hasActiveFilters && (
            <>
              <span className="text-xs text-muted-foreground">
                {resultCount} of {totalCount} recipes
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onClearFilters}
              >
                Clear all
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
