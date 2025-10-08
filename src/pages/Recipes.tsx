import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, ChefHat } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Recipe } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Recipes() {
  const { recipes, foods, addRecipe, updateRecipe, deleteRecipe } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    food_ids: [] as string[],
  });

  const handleEdit = (recipe: Recipe) => {
    setEditRecipe(recipe);
    setFormData({
      name: recipe.name,
      description: recipe.description || "",
      food_ids: recipe.food_ids,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Please enter a recipe name");
      return;
    }

    if (formData.food_ids.length === 0) {
      toast.error("Please select at least one food");
      return;
    }

    if (editRecipe) {
      updateRecipe(editRecipe.id, formData);
      toast.success("Recipe updated!");
    } else {
      addRecipe(formData);
      toast.success("Recipe created!");
    }

    handleClose();
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditRecipe(null);
    setFormData({ name: "", description: "", food_ids: [] });
  };

  const handleDelete = (id: string) => {
    deleteRecipe(id);
    setDeleteId(null);
    toast.success("Recipe deleted");
  };

  const toggleFood = (foodId: string) => {
    setFormData(prev => ({
      ...prev,
      food_ids: prev.food_ids.includes(foodId)
        ? prev.food_ids.filter(id => id !== foodId)
        : [...prev.food_ids, foodId],
    }));
  };

  const getRecipeFoods = (recipe: Recipe) => {
    return recipe.food_ids
      .map(id => foods.find(f => f.id === id))
      .filter(Boolean);
  };

  const safeFoods = foods.filter(f => f.is_safe);

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Recipes & Meal Templates</h1>
            <p className="text-muted-foreground">
              Create complete meals like "Taco Night" or "Pizza Party"
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} size="lg" className="shadow-lg">
            <Plus className="h-5 w-5 mr-2" />
            Create Recipe
          </Button>
        </div>

        {recipes.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <ChefHat className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Recipes Yet</h3>
              <p className="text-muted-foreground mb-6">
                Create meal templates to quickly plan complete meals instead of individual foods
              </p>
              <Button onClick={() => setDialogOpen(true)} size="lg">
                <Plus className="h-5 w-5 mr-2" />
                Create Your First Recipe
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipes.map((recipe) => {
              const recipeFoods = getRecipeFoods(recipe);
              
              return (
                <Card key={recipe.id} className="hover:shadow-lg transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <ChefHat className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">{recipe.name}</CardTitle>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(recipe)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(recipe.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {recipe.description && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {recipe.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">
                        Includes ({recipeFoods.length} foods):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {recipeFoods.map((food) => food && (
                          <Badge key={food.id} variant="outline">
                            {food.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          if (!open) handleClose();
          setDialogOpen(open);
        }}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editRecipe ? "Edit Recipe" : "Create Recipe"}
              </DialogTitle>
              <DialogDescription>
                Group foods together to create complete meal templates
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Recipe Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Taco Night, Pizza Party"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add notes about this meal..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Select Foods * ({formData.food_ids.length} selected)</Label>
                <div className="border rounded-lg p-4 max-h-[300px] overflow-y-auto space-y-3">
                  {safeFoods.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No safe foods available. Add some in the Pantry first.
                    </p>
                  ) : (
                    safeFoods.map((food) => (
                      <div key={food.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={food.id}
                          checked={formData.food_ids.includes(food.id)}
                          onCheckedChange={() => toggleFood(food.id)}
                        />
                        <label
                          htmlFor={food.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1 cursor-pointer"
                        >
                          {food.name}
                          <span className="text-muted-foreground ml-2">
                            ({food.category})
                          </span>
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1">
                  {editRecipe ? "Update Recipe" : "Create Recipe"}
                </Button>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Recipe?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this recipe. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && handleDelete(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
