import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScaledIngredient {
  id: string;
  name: string;
  originalQuantity: string;
  scaledQuantity: string;
  unit: string;
  preparationNotes?: string;
  isOptional?: boolean;
  section?: string;
}

interface ScaledIngredientsListProps {
  ingredients: ScaledIngredient[];
  showOriginal?: boolean;
  checkedIngredients?: Set<string>;
  onToggleIngredient?: (ingredientId: string) => void;
  className?: string;
}

export function ScaledIngredientsList({
  ingredients,
  showOriginal = true,
  checkedIngredients,
  onToggleIngredient,
  className,
}: ScaledIngredientsListProps) {
  // Group ingredients by section
  const sections = groupBySection(ingredients);

  return (
    <div className={cn("space-y-4", className)}>
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {/* Section Header */}
          {section.name && (
            <>
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                {section.name}
              </h4>
              {sectionIndex > 0 && <Separator className="mb-3" />}
            </>
          )}

          {/* Ingredients in this section */}
          <div className="space-y-2">
            {section.ingredients.map((ingredient) => {
              const isChecked = checkedIngredients?.has(ingredient.id);
              const isScaled = ingredient.scaledQuantity !== ingredient.originalQuantity;

              return (
                <div
                  key={ingredient.id}
                  className={cn(
                    "flex items-start gap-3 p-2 rounded-lg transition-colors",
                    onToggleIngredient && "cursor-pointer hover:bg-accent",
                    isChecked && "bg-muted/50"
                  )}
                  onClick={() => onToggleIngredient?.(ingredient.id)}
                >
                  {/* Checkbox (if interactive) */}
                  {onToggleIngredient && (
                    <div
                      className={cn(
                        "mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                        isChecked
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {isChecked && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                  )}

                  {/* Ingredient Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        {/* Quantity + Unit + Name */}
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={cn("font-medium", isChecked && "line-through text-muted-foreground")}>
                            {ingredient.scaledQuantity}
                          </span>

                          {ingredient.unit && (
                            <span className={cn("text-sm", isChecked && "line-through text-muted-foreground")}>
                              {ingredient.unit}
                            </span>
                          )}

                          <span className={cn(isChecked && "line-through text-muted-foreground")}>
                            {ingredient.name}
                          </span>

                          {ingredient.isOptional && (
                            <Badge variant="outline" className="text-xs ml-1">
                              optional
                            </Badge>
                          )}
                        </div>

                        {/* Original Quantity (if scaled and showOriginal) */}
                        {isScaled && showOriginal && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <span className="line-through">
                              Originally: {ingredient.originalQuantity} {ingredient.unit}
                            </span>
                          </div>
                        )}

                        {/* Preparation Notes */}
                        {ingredient.preparationNotes && (
                          <div className="text-sm text-muted-foreground mt-1 italic">
                            {ingredient.preparationNotes}
                          </div>
                        )}
                      </div>

                      {/* Scaled Indicator */}
                      {isScaled && !showOriginal && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          scaled
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Empty State */}
      {ingredients.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No ingredients listed</p>
        </div>
      )}
    </div>
  );
}

// Helper function to group ingredients by section
function groupBySection(ingredients: ScaledIngredient[]): Array<{
  name: string | null;
  ingredients: ScaledIngredient[];
}> {
  const sections = new Map<string | null, ScaledIngredient[]>();

  ingredients.forEach(ingredient => {
    const sectionName = ingredient.section || null;
    if (!sections.has(sectionName)) {
      sections.set(sectionName, []);
    }
    sections.get(sectionName)!.push(ingredient);
  });

  // Convert to array, with null section first (if exists)
  const result: Array<{ name: string | null; ingredients: ScaledIngredient[] }> = [];

  if (sections.has(null)) {
    result.push({
      name: null,
      ingredients: sections.get(null)!,
    });
    sections.delete(null);
  }

  // Add named sections in original order
  Array.from(sections.entries()).forEach(([name, ingredients]) => {
    result.push({ name, ingredients });
  });

  return result;
}
