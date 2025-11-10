import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Users, Minus, Plus } from "lucide-react";
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

interface RecipeScalingControlProps {
  originalServings: number;
  servingsMin?: number;
  servingsMax?: number;
  ingredients: Array<{
    id: string;
    ingredient_name: string;
    quantity: string;
    unit: string;
    preparation_notes?: string;
    is_optional?: boolean;
    section?: string;
  }>;
  onServingsChange?: (servings: number, scaledIngredients: ScaledIngredient[]) => void;
  className?: string;
  compact?: boolean;
}

export function RecipeScalingControl({
  originalServings,
  servingsMin = 1,
  servingsMax = 12,
  ingredients,
  onServingsChange,
  className,
  compact = false,
}: RecipeScalingControlProps) {
  const [currentServings, setCurrentServings] = useState(originalServings);
  const [scaledIngredients, setScaledIngredients] = useState<ScaledIngredient[]>([]);

  // Common serving sizes for quick selection
  const commonSizes = [2, 4, 6, 8].filter(size => size >= servingsMin && size <= servingsMax);

  useEffect(() => {
    // Recalculate scaled ingredients when servings change
    const scaled = scaleIngredients(ingredients, originalServings, currentServings);
    setScaledIngredients(scaled);

    if (onServingsChange) {
      onServingsChange(currentServings, scaled);
    }
  }, [currentServings, ingredients, originalServings]);

  const handleServingsChange = (value: number[]) => {
    setCurrentServings(value[0]);
  };

  const incrementServings = () => {
    setCurrentServings(prev => Math.min(servingsMax, prev + 1));
  };

  const decrementServings = () => {
    setCurrentServings(prev => Math.max(servingsMin, prev - 1));
  };

  const scaleFactor = currentServings / originalServings;
  const isScaled = currentServings !== originalServings;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Servings:</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={decrementServings}
            disabled={currentServings <= servingsMin}
          >
            <Minus className="h-3 w-3" />
          </Button>

          <div className="w-12 text-center">
            <span className="text-lg font-semibold">{currentServings}</span>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={incrementServings}
            disabled={currentServings >= servingsMax}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {isScaled && (
          <Badge variant="secondary" className="text-xs">
            {scaleFactor > 1 ? `${scaleFactor}x` : `${Math.round(scaleFactor * 100)}%`}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Adjust Servings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Servings Display */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-3xl font-bold">{currentServings}</div>
            <div className="text-sm text-muted-foreground">
              servings
              {isScaled && (
                <span className="ml-2">
                  (originally {originalServings})
                </span>
              )}
            </div>
          </div>

          {isScaled && (
            <div className="text-right">
              <Badge variant="outline" className="text-lg px-3 py-1">
                {scaleFactor > 1 ? `${scaleFactor.toFixed(1)}x` : `${Math.round(scaleFactor * 100)}%`}
              </Badge>
              <div className="text-xs text-muted-foreground mt-1">scale factor</div>
            </div>
          )}
        </div>

        {/* Increment/Decrement Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={decrementServings}
            disabled={currentServings <= servingsMin}
          >
            <Minus className="h-4 w-4" />
          </Button>

          <Slider
            value={[currentServings]}
            onValueChange={handleServingsChange}
            min={servingsMin}
            max={servingsMax}
            step={1}
            className="flex-1"
          />

          <Button
            variant="outline"
            size="icon"
            onClick={incrementServings}
            disabled={currentServings >= servingsMax}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick Size Buttons */}
        {commonSizes.length > 0 && (
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground self-center">Quick:</span>
            {commonSizes.map(size => (
              <Button
                key={size}
                variant={currentServings === size ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentServings(size)}
                className="flex-1"
              >
                {size}
              </Button>
            ))}
          </div>
        )}

        {/* Reset Button */}
        {isScaled && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentServings(originalServings)}
            className="w-full"
          >
            Reset to Original ({originalServings} servings)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// Helper function to scale ingredients
function scaleIngredients(
  ingredients: Array<{
    id: string;
    ingredient_name: string;
    quantity: string;
    unit: string;
    preparation_notes?: string;
    is_optional?: boolean;
    section?: string;
  }>,
  originalServings: number,
  targetServings: number
): ScaledIngredient[] {
  const scaleFactor = targetServings / originalServings;

  return ingredients.map(ingredient => {
    const scaledQuantity = scaleQuantityString(ingredient.quantity, scaleFactor);

    return {
      id: ingredient.id,
      name: ingredient.ingredient_name,
      originalQuantity: ingredient.quantity,
      scaledQuantity,
      unit: ingredient.unit,
      preparationNotes: ingredient.preparation_notes,
      isOptional: ingredient.is_optional,
      section: ingredient.section,
    };
  });
}

// Helper function to scale a quantity string
function scaleQuantityString(quantityStr: string, scaleFactor: number): string {
  if (!quantityStr || quantityStr.trim() === '') {
    return quantityStr;
  }

  // Don't scale descriptive quantities
  const descriptive = /taste|pinch|dash|handful|sprinkle|few|some/i;
  if (descriptive.test(quantityStr)) {
    return quantityStr;
  }

  // Don't scale ranges (e.g., "2-3")
  if (quantityStr.includes('-')) {
    return quantityStr;
  }

  // Try to parse the quantity
  const parsed = parseQuantity(quantityStr);
  if (parsed === null) {
    return quantityStr; // Can't parse, return as is
  }

  // Scale it
  const scaled = parsed * scaleFactor;

  // Format it nicely
  return formatQuantity(scaled);
}

// Parse quantity strings including fractions
function parseQuantity(quantityStr: string): number | null {
  quantityStr = quantityStr.trim();

  // Try decimal first
  const decimalMatch = quantityStr.match(/^(\d+\.?\d*)$/);
  if (decimalMatch) {
    return parseFloat(decimalMatch[1]);
  }

  // Try mixed fraction (e.g., "1 1/2")
  const mixedMatch = quantityStr.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1]);
    const numerator = parseInt(mixedMatch[2]);
    const denominator = parseInt(mixedMatch[3]);
    return whole + (numerator / denominator);
  }

  // Try simple fraction (e.g., "1/2")
  const fractionMatch = quantityStr.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const numerator = parseInt(fractionMatch[1]);
    const denominator = parseInt(fractionMatch[2]);
    return numerator / denominator;
  }

  return null;
}

// Format quantity with smart rounding and fraction conversion
function formatQuantity(quantity: number): string {
  // Round very small quantities to 0
  if (quantity < 0.05) {
    return '0';
  }

  // For whole numbers, return as is
  if (Math.abs(quantity - Math.round(quantity)) < 0.01) {
    return Math.round(quantity).toString();
  }

  const whole = Math.floor(quantity);
  const decimal = quantity - whole;

  // Common fraction conversions
  const fractions: [number, string][] = [
    [0.125, '1/8'],
    [0.25, '1/4'],
    [0.333, '1/3'],
    [0.375, '3/8'],
    [0.5, '1/2'],
    [0.625, '5/8'],
    [0.666, '2/3'],
    [0.75, '3/4'],
    [0.875, '7/8'],
  ];

  // Find closest fraction
  for (const [value, fraction] of fractions) {
    if (Math.abs(decimal - value) < 0.05) {
      if (whole > 0) {
        return `${whole} ${fraction}`;
      } else {
        return fraction;
      }
    }
  }

  // If no good fraction match, use decimal
  return quantity.toFixed(2).replace(/\.?0+$/, '');
}

// Export for use in other components
export { scaleIngredients, scaleQuantityString, parseQuantity, formatQuantity };
