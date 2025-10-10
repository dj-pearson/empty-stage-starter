import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Link, FileJson, Sparkles, Upload } from "lucide-react";
import { Food } from "@/types";

interface ImportRecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (recipeData: any) => void;
  foods: Food[];
}

export function ImportRecipeDialog({ open, onOpenChange, onImport, foods }: ImportRecipeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [recipeText, setRecipeText] = useState("");
  const [jsonInput, setJsonInput] = useState("");

  const handleUrlImport = async () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    setIsLoading(true);
    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('is_active', true)
        .single();

      if (!aiSettings) {
        toast.error("No active AI model configured");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('parse-recipe', {
        body: {
          url,
          aiModel: aiSettings,
        },
      });

      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      const recipe = data.recipe;
      onImport(mapRecipeToFormat(recipe));
      toast.success("Recipe imported from URL!");
      handleClose();
    } catch (error) {
      console.error('Error importing from URL:', error);
      toast.error("Failed to import recipe from URL");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextImport = async () => {
    if (!recipeText.trim()) {
      toast.error("Please paste recipe text");
      return;
    }

    setIsLoading(true);
    try {
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('is_active', true)
        .single();

      if (!aiSettings) {
        toast.error("No active AI model configured");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('parse-recipe', {
        body: {
          text: recipeText,
          aiModel: aiSettings,
        },
      });

      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      const recipe = data.recipe;
      onImport(mapRecipeToFormat(recipe));
      toast.success("Recipe imported from text!");
      handleClose();
    } catch (error) {
      console.error('Error importing from text:', error);
      toast.error("Failed to import recipe from text");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJsonImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      
      // Validate required fields
      if (!parsed.name) {
        toast.error("Recipe must have a name");
        return;
      }

      onImport(mapRecipeToFormat(parsed));
      toast.success("Recipe imported from JSON!");
      handleClose();
    } catch (error) {
      console.error('Error parsing JSON:', error);
      toast.error("Invalid JSON format");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        setJsonInput(content);
      } catch (error) {
        toast.error("Failed to read file");
      }
    };
    reader.readAsText(file);
  };

  const mapRecipeToFormat = (recipe: any) => {
    // Match ingredient names to food IDs
    const ingredientNames = recipe.ingredients || [];
    const matchedFoodIds = foods
      .filter(food => 
        ingredientNames.some((ing: string) => 
          food.name.toLowerCase().includes(ing.toLowerCase()) ||
          ing.toLowerCase().includes(food.name.toLowerCase())
        )
      )
      .map(food => food.id);

    return {
      name: recipe.name || recipe.title || "",
      description: recipe.description || "",
      food_ids: matchedFoodIds,
      instructions: recipe.instructions || "",
      prepTime: recipe.prepTime || recipe.prep_time || "",
      cookTime: recipe.cookTime || recipe.cook_time || "",
      servings: recipe.servings?.toString() || "",
      additionalIngredients: Array.isArray(recipe.additionalIngredients) 
        ? recipe.additionalIngredients.join(', ')
        : recipe.additionalIngredients || "",
      tips: recipe.tips || "",
    };
  };

  const handleClose = () => {
    setUrl("");
    setRecipeText("");
    setJsonInput("");
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const template = {
      name: "Example Recipe",
      description: "A delicious meal",
      ingredients: ["chicken", "cheese", "pasta"],
      instructions: "1. Cook pasta\n2. Add chicken\n3. Top with cheese",
      prepTime: "10 min",
      cookTime: "20 min",
      servings: "4",
      additionalIngredients: "salt, pepper, olive oil",
      tips: "Let kids help with safe tasks"
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recipe-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Recipe</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="url" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="url">
              <Link className="h-4 w-4 mr-2" />
              URL
            </TabsTrigger>
            <TabsTrigger value="text">
              <Sparkles className="h-4 w-4 mr-2" />
              AI Text
            </TabsTrigger>
            <TabsTrigger value="json">
              <FileJson className="h-4 w-4 mr-2" />
              JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="space-y-4">
            <div className="space-y-2">
              <Label>Recipe URL</Label>
              <Input
                placeholder="https://example.com/recipe"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Paste a URL to a recipe and AI will extract the details
              </p>
            </div>
            <Button onClick={handleUrlImport} disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Link className="h-4 w-4 mr-2" />
                  Import from URL
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="text" className="space-y-4">
            <div className="space-y-2">
              <Label>Recipe Text</Label>
              <Textarea
                placeholder="Paste recipe text here... (ingredients, instructions, etc.)"
                value={recipeText}
                onChange={(e) => setRecipeText(e.target.value)}
                rows={10}
              />
              <p className="text-sm text-muted-foreground">
                Paste any recipe text and AI will structure it for you
              </p>
            </div>
            <Button onClick={handleTextImport} disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Import with AI
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="json" className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>JSON Data</Label>
                <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                  <Upload className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
              <Input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="cursor-pointer"
              />
              <Textarea
                placeholder='{"name": "Recipe Name", "ingredients": [...], ...}'
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-sm text-muted-foreground">
                Upload or paste a JSON file with recipe data
              </p>
            </div>
            <Button onClick={handleJsonImport} className="w-full">
              <FileJson className="h-4 w-4 mr-2" />
              Import JSON
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
