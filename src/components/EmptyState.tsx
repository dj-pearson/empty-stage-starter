import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { ComponentType } from "react";

interface EmptyStateProps {
  icon: LucideIcon | ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <div className="rounded-full bg-muted p-6 mb-4">
        <Icon className="h-10 w-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mb-6">{description}</p>
      {action && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={action.onClick}>{action.label}</Button>
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Specialized empty state variants for common scenarios
export function EmptyRecipes({ onAddRecipe }: { onAddRecipe: () => void }) {
  return (
    <EmptyState
      icon={() => (
        <svg
          className="h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      )}
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
      icon={() => (
        <svg
          className="h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      )}
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
      icon={() => (
        <svg
          className="h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
      )}
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
      icon={() => (
        <svg
          className="h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      )}
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
      icon={() => (
        <svg
          className="h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      )}
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
      icon={() => (
        <svg
          className="h-10 w-10 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      )}
      title="No results found"
      description="We couldn't find anything matching your search. Try different keywords or filters."
    />
  );
}
