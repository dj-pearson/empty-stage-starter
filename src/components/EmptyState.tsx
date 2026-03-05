import { BookOpen, Package, ClipboardList, CalendarDays, Users, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

// Re-export the canonical EmptyState for backward compatibility
export { EmptyState };

// Specialized empty state variants using the canonical component with Lucide icons

export function EmptyRecipes({ onAddRecipe }: { onAddRecipe: () => void }) {
  return (
    <EmptyState
      icon={<BookOpen className="h-10 w-10" />}
      title="No recipes yet"
      description="Start building your family's recipe collection. Add your first recipe to get started with meal planning."
      action={{
        label: "Add Your First Recipe",
        onClick: onAddRecipe,
      }}
    />
  );
}

export function EmptyPantry({ onAddFood }: { onAddFood: () => void }) {
  return (
    <EmptyState
      icon={<Package className="h-10 w-10" />}
      title="Your pantry is empty"
      description="Keep track of what you have at home. Add items to your pantry to get personalized recipe suggestions."
      action={{
        label: "Add Food Items",
        onClick: onAddFood,
      }}
    />
  );
}

export function EmptyGroceryList({
  onCreateList,
}: {
  onCreateList: () => void;
}) {
  return (
    <EmptyState
      icon={<ClipboardList className="h-10 w-10" />}
      title="No grocery lists"
      description="Create organized shopping lists. Add items manually or generate them from your meal plan."
      action={{
        label: "Create Grocery List",
        onClick: onCreateList,
      }}
    />
  );
}

export function EmptyMealPlan({ onPlanMeal }: { onPlanMeal: () => void }) {
  return (
    <EmptyState
      icon={<CalendarDays className="h-10 w-10" />}
      title="No meals planned"
      description="Plan your week ahead. Schedule meals and let us generate your grocery list automatically."
      action={{
        label: "Plan This Week",
        onClick: onPlanMeal,
      }}
    />
  );
}

export function EmptyChildren({ onAddChild }: { onAddChild: () => void }) {
  return (
    <EmptyState
      icon={<Users className="h-10 w-10" />}
      title="No child profiles yet"
      description="Create profiles for your children to track their preferences, allergens, and meal progress."
      action={{
        label: "Add Child",
        onClick: onAddChild,
      }}
    />
  );
}

export function EmptySearchResults() {
  return (
    <EmptyState
      icon={<Search className="h-10 w-10" />}
      title="No results found"
      description="We couldn't find anything matching your search. Try different keywords or filters."
    />
  );
}
