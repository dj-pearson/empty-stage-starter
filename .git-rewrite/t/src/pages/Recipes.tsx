import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Pencil, Trash2, ChefHat, Clock, Users, Lightbulb, AlertTriangle, Package, Upload } from "lucide-react";
import { RecipeBuilder } from "@/components/RecipeBuilder";
import { ImportRecipeDialog } from "@/components/ImportRecipeDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleEdit = (recipe: Recipe) => {
    setEditRecipe(recipe);
    setDialogOpen(true);
  };

  const handleSave = (recipeData: any) => {
    if (editRecipe) {
      updateRecipe(editRecipe.id, recipeData);
      toast.success("Recipe updated!");
    } else {
      addRecipe(recipeData);
      toast.success("Recipe created!");
    }
    handleClose();
  };

  const handleImport = (recipeData: any) => {
    addRecipe(recipeData);
    toast.success("Recipe imported successfully!");
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditRecipe(null);
  };

  const handleDelete = (id: string) => {
    deleteRecipe(id);
    setDeleteId(null);
    toast.success("Recipe deleted");
  };

  const getRecipeFoods = (recipe: Recipe) => {
    return recipe.food_ids
      .map(id => foods.find(f => f.id === id))
      .filter(Boolean);
  };

  const getStockStatus = (recipe: Recipe) => {
    const recipeFoods = getRecipeFoods(recipe);
    const outOfStock = recipeFoods.filter(food => food && (food.quantity || 0) === 0);
    const lowStock = recipeFoods.filter(food => food && (food.quantity || 0) > 0 && (food.quantity || 0) <= 2);
    
    return {
      outOfStock,
      lowStock,
      hasIssues: outOfStock.length > 0 || lowStock.length > 0
    };
  };

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
          <div className="flex gap-2">
            <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="lg">
              <Upload className="h-5 w-5 mr-2" />
              Import
            </Button>
            <Button onClick={() => setDialogOpen(true)} size="lg" className="shadow-lg">
              <Plus className="h-5 w-5 mr-2" />
              Create Recipe
            </Button>
          </div>
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
              const stockStatus = getStockStatus(recipe);
              
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
                 <CardContent className="space-y-4">
                   {/* Stock Warnings */}
                   {stockStatus.hasIssues && (
                     <Alert variant={stockStatus.outOfStock.length > 0 ? "destructive" : "default"}>
                       <AlertTriangle className="h-4 w-4" />
                       <AlertDescription>
                         {stockStatus.outOfStock.length > 0 && (
                           <div className="mb-2">
                             <p className="font-medium">Out of stock:</p>
                             <p className="text-sm">{stockStatus.outOfStock.map(f => f?.name).join(', ')}</p>
                           </div>
                         )}
                         {stockStatus.lowStock.length > 0 && (
                           <div>
                             <p className="font-medium">Low stock:</p>
                             <p className="text-sm">{stockStatus.lowStock.map(f => `${f?.name} (${f?.quantity})`).join(', ')}</p>
                           </div>
                         )}
                       </AlertDescription>
                     </Alert>
                   )}

                   {/* Time and Servings */}
                   {(recipe.prepTime || recipe.cookTime || recipe.servings) && (
                     <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                       {recipe.prepTime && (
                         <div className="flex items-center gap-1">
                           <Clock className="h-4 w-4" />
                           <span>Prep: {recipe.prepTime}</span>
                         </div>
                       )}
                       {recipe.cookTime && (
                         <div className="flex items-center gap-1">
                           <Clock className="h-4 w-4" />
                           <span>Cook: {recipe.cookTime}</span>
                         </div>
                       )}
                       {recipe.servings && (
                         <div className="flex items-center gap-1">
                           <Users className="h-4 w-4" />
                           <span>{recipe.servings} servings</span>
                         </div>
                       )}
                     </div>
                   )}

                   {/* Ingredients */}
                   <div className="space-y-2">
                     <p className="text-sm font-medium text-muted-foreground">
                       Main Ingredients ({recipeFoods.length}):
                     </p>
                     <div className="flex flex-wrap gap-2">
                       {recipeFoods.map((food) => {
                         if (!food) return null;
                         const isOutOfStock = (food.quantity || 0) === 0;
                         const isLowStock = (food.quantity || 0) > 0 && (food.quantity || 0) <= 2;
                         
                         return (
                           <Badge 
                             key={food.id} 
                             variant={isOutOfStock ? "destructive" : isLowStock ? "secondary" : "outline"}
                             className="gap-1"
                           >
                             {food.name}
                             {(food.quantity !== undefined && food.quantity !== null) && (
                               <span className="text-xs opacity-70">
                                 ({food.quantity})
                               </span>
                             )}
                             {isOutOfStock && <Package className="h-3 w-3" />}
                           </Badge>
                         );
                       })}
                     </div>
                   </div>

                   {/* Additional Ingredients */}
                   {recipe.additionalIngredients && (
                     <div className="space-y-1">
                       <p className="text-sm font-medium text-muted-foreground">Also needed:</p>
                       <p className="text-sm">{recipe.additionalIngredients}</p>
                     </div>
                   )}

                   {/* Instructions Preview */}
                   {recipe.instructions && (
                     <div className="space-y-1">
                       <p className="text-sm font-medium text-muted-foreground">Instructions:</p>
                       <p className="text-sm line-clamp-3">{recipe.instructions}</p>
                     </div>
                   )}

                   {/* Tips */}
                   {recipe.tips && (
                     <div className="space-y-1 bg-muted/50 p-3 rounded-lg">
                       <div className="flex items-center gap-1 text-sm font-medium">
                         <Lightbulb className="h-4 w-4" />
                         <span>Picky Eater Tips:</span>
                       </div>
                       <p className="text-sm">{recipe.tips}</p>
                     </div>
                   )}
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
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editRecipe ? "Edit Recipe" : "Create Recipe"}
              </DialogTitle>
            </DialogHeader>

            <RecipeBuilder
              foods={foods}
              editRecipe={editRecipe}
              onSave={handleSave}
              onCancel={handleClose}
            />
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

        {/* Import Dialog */}
        <ImportRecipeDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onImport={handleImport}
          foods={foods}
        />
      </div>
    </div>
  );
}
