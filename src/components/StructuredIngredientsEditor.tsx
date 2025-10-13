import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface StructuredIngredient {
  id: string;
  quantity: string;
  unit: string;
  name: string;
  preparation?: string;
  optional: boolean;
  sort_order: number;
}

const COMMON_UNITS = [
  "cup", "cups",
  "tbsp", "tablespoon", "tablespoons",
  "tsp", "teaspoon", "teaspoons",
  "oz", "ounce", "ounces",
  "lb", "pound", "pounds",
  "g", "gram", "grams",
  "kg", "kilogram", "kilograms",
  "ml", "milliliter", "milliliters",
  "l", "liter", "liters",
  "piece", "pieces",
  "slice", "slices",
  "clove", "cloves",
  "can", "cans",
  "package", "packages",
  "handful",
  "pinch",
  "dash",
  "to taste",
];

interface StructuredIngredientsEditorProps {
  ingredients: StructuredIngredient[];
  onChange: (ingredients: StructuredIngredient[]) => void;
}

export function StructuredIngredientsEditor({
  ingredients,
  onChange,
}: StructuredIngredientsEditorProps) {
  const [newIngredient, setNewIngredient] = useState<Partial<StructuredIngredient>>({
    quantity: "",
    unit: "cup",
    name: "",
    preparation: "",
    optional: false,
  });

  const handleAdd = () => {
    if (!newIngredient.name?.trim()) return;

    const ingredient: StructuredIngredient = {
      id: Math.random().toString(36).substr(2, 9),
      quantity: newIngredient.quantity || "",
      unit: newIngredient.unit || "",
      name: newIngredient.name.trim(),
      preparation: newIngredient.preparation?.trim() || undefined,
      optional: newIngredient.optional || false,
      sort_order: ingredients.length,
    };

    onChange([...ingredients, ingredient]);
    
    // Reset form
    setNewIngredient({
      quantity: "",
      unit: "cup",
      name: "",
      preparation: "",
      optional: false,
    });
  };

  const handleRemove = (id: string) => {
    onChange(ingredients.filter(i => i.id !== id));
  };

  const handleUpdate = (id: string, updates: Partial<StructuredIngredient>) => {
    onChange(
      ingredients.map(i => (i.id === id ? { ...i, ...updates } : i))
    );
  };

  const parseIngredientText = (text: string) => {
    // Simple parser for common formats like "2 cups flour"
    const match = text.match(/^([\d\/.]+)?\s*(\w+)?\s+(.+)$/);
    
    if (match) {
      const [, quantity, unit, name] = match;
      setNewIngredient({
        quantity: quantity || "",
        unit: unit || "cup",
        name: name.trim(),
        preparation: "",
        optional: false,
      });
    } else {
      setNewIngredient({
        ...newIngredient,
        name: text.trim(),
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ingredients</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing Ingredients List */}
        {ingredients.length > 0 && (
          <div className="space-y-2">
            {ingredients.map((ingredient) => (
              <div
                key={ingredient.id}
                className="flex items-start gap-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <GripVertical className="h-5 w-5 text-muted-foreground mt-1 cursor-grab" />
                
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <Input
                      value={ingredient.quantity}
                      onChange={(e) => handleUpdate(ingredient.id, { quantity: e.target.value })}
                      placeholder="2"
                      className="col-span-2"
                    />
                    <Select
                      value={ingredient.unit}
                      onValueChange={(value) => handleUpdate(ingredient.id, { unit: value })}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMON_UNITS.map(unit => (
                          <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={ingredient.name}
                      onChange={(e) => handleUpdate(ingredient.id, { name: e.target.value })}
                      placeholder="flour"
                      className="col-span-7"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Input
                      value={ingredient.preparation || ""}
                      onChange={(e) => handleUpdate(ingredient.id, { preparation: e.target.value })}
                      placeholder="chopped, diced, etc. (optional)"
                      className="flex-1 text-sm"
                    />
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={ingredient.optional}
                        onChange={(e) => handleUpdate(ingredient.id, { optional: e.target.checked })}
                        className="rounded"
                      />
                      Optional
                    </label>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(ingredient.id)}
                  className="shrink-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add New Ingredient Form */}
        <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
          <Label className="text-sm font-medium">Add Ingredient</Label>
          
          {/* Quick Parse Input */}
          <div className="space-y-2">
            <Input
              placeholder='Try: "2 cups flour" or just "flour"'
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  parseIngredientText(e.currentTarget.value);
                  e.currentTarget.value = "";
                }
              }}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Press Enter to quick-parse, or fill the form below
            </p>
          </div>

          {/* Detailed Form */}
          <div className="grid grid-cols-12 gap-2">
            <Input
              value={newIngredient.quantity || ""}
              onChange={(e) => setNewIngredient({ ...newIngredient, quantity: e.target.value })}
              placeholder="2"
              className="col-span-2"
            />
            <Select
              value={newIngredient.unit || "cup"}
              onValueChange={(value) => setNewIngredient({ ...newIngredient, unit: value })}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_UNITS.map(unit => (
                  <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={newIngredient.name || ""}
              onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
              placeholder="ingredient name"
              className="col-span-7"
            />
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={newIngredient.preparation || ""}
              onChange={(e) => setNewIngredient({ ...newIngredient, preparation: e.target.value })}
              placeholder="chopped, diced, etc. (optional)"
              className="flex-1 text-sm"
            />
            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                checked={newIngredient.optional || false}
                onChange={(e) => setNewIngredient({ ...newIngredient, optional: e.target.checked })}
                className="rounded"
              />
              Optional
            </label>
          </div>

          <Button
            onClick={handleAdd}
            disabled={!newIngredient.name?.trim()}
            size="sm"
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Ingredient
          </Button>
        </div>

        {/* Display Preview */}
        {ingredients.length > 0 && (
          <div className="space-y-2 p-3 bg-accent/30 rounded-lg">
            <p className="text-sm font-medium">Preview:</p>
            <ul className="text-sm space-y-1">
              {ingredients.map((ing) => (
                <li key={ing.id}>
                  <span className="font-medium">
                    {ing.quantity} {ing.unit}
                  </span>{" "}
                  {ing.name}
                  {ing.preparation && (
                    <span className="text-muted-foreground">, {ing.preparation}</span>
                  )}
                  {ing.optional && (
                    <Badge variant="outline" className="ml-2 text-xs">optional</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

