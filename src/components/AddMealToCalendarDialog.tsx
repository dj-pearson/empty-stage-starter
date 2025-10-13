import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Recipe, Kid } from "@/types";
import { Search, ChefHat } from "lucide-react";
import { toast } from "sonner";

interface AddMealToCalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  mealType: string;
  recipes: Recipe[];
  kids: Kid[];
  activeKidId: string | null;
  onAddMeal: (recipeId: string, date: string, mealType: string, kidId: string | null) => void;
}

export function AddMealToCalendarDialog({
  open,
  onOpenChange,
  date,
  mealType,
  recipes,
  kids,
  activeKidId,
  onAddMeal,
}: AddMealToCalendarDialogProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
  const [selectedKidId, setSelectedKidId] = useState<string | null>(activeKidId);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSubmit = () => {
    if (!selectedRecipeId) {
      toast.error("Please select a recipe");
      return;
    }

    onAddMeal(selectedRecipeId, date, mealType, selectedKidId);
    setSelectedRecipeId("");
    setSearchQuery("");
    onOpenChange(false);
    toast.success("Meal added to calendar!");
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedRecipe = recipes.find(r => r.id === selectedRecipeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Add Meal to Calendar</DialogTitle>
          <DialogDescription>
            Select a recipe for {mealType} on {date}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Kid Selector (if in family mode) */}
          {!activeKidId && kids.length > 1 && (
            <div className="space-y-2">
              <Label>For Child (optional)</Label>
              <Select
                value={selectedKidId || "family"}
                onValueChange={(value) => setSelectedKidId(value === "family" ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="family">Whole Family</SelectItem>
                  {kids.map(kid => (
                    <SelectItem key={kid.id} value={kid.id}>
                      {kid.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Search */}
          <div className="space-y-2">
            <Label>Search Recipes</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by recipe name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Recipe List */}
          <div className="space-y-2">
            <Label>Select Recipe</Label>
            <ScrollArea className="h-[300px] border rounded-md">
              {filteredRecipes.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <ChefHat className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No recipes found</p>
                  <p className="text-sm mt-2">
                    {searchQuery ? "Try a different search" : "Create some recipes first"}
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {filteredRecipes.map(recipe => (
                    <button
                      key={recipe.id}
                      onClick={() => setSelectedRecipeId(recipe.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedRecipeId === recipe.id
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {recipe.image_url && (
                          <img
                            src={recipe.image_url}
                            alt={recipe.name}
                            className="w-12 h-12 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{recipe.name}</p>
                          {recipe.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {recipe.description}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {recipe.prepTime && (
                              <Badge variant="secondary" className="text-xs">
                                {recipe.prepTime}m
                              </Badge>
                            )}
                            {recipe.difficulty_level && (
                              <Badge variant="outline" className="text-xs">
                                {recipe.difficulty_level}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Selected Recipe Preview */}
          {selectedRecipe && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">Selected:</p>
              <p className="text-sm text-muted-foreground mt-1">{selectedRecipe.name}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedRecipeId}>
            Add to Calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

