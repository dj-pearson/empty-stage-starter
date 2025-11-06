import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Link2, FileJson, Sparkles, Upload, Camera, ChefHat, Users, User } from "lucide-react";
import { Food, Kid } from "@/types";
import { Html5Qrcode } from "html5-qrcode";

interface ImportRecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (recipeData: any) => void;
  foods: Food[];
  kids: Kid[];
}

export function ImportRecipeDialog({ open, onOpenChange, onImport, foods, kids }: ImportRecipeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [recipeText, setRecipeText] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  
  // New states for photo import and designation
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Designation states
  const [isFamily, setIsFamily] = useState(false);
  const [selectedKidId, setSelectedKidId] = useState<string>("");
  const [preferredMealSlot, setPreferredMealSlot] = useState<string>("");

  const startCamera = async () => {
    try {
      setCapturedImage(null);
      setShowCamera(true);
      await new Promise((r) => setTimeout(r, 50));

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          await scannerRef.current.clear();
        } catch (error) {
          // Ignore cleanup errors - scanner may already be stopped
          console.debug('Scanner cleanup error (expected):', error);
        }
        scannerRef.current = null;
      }

      const scanner = new Html5Qrcode('recipe-photo-scanner');
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) throw new Error('No cameras found');
      
      const back = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];

      await scanner.start(back.id, { fps: 10, aspectRatio: 1.333 }, () => {}, () => {});
    } catch (error) {
      console.error('Camera error:', error);
      toast.error("Failed to start camera");
      setShowCamera(false);
    }
  };

  const capturePhoto = async () => {
    const videoEl = document.querySelector('#recipe-photo-scanner video') as HTMLVideoElement | null;
    if (!videoEl || videoEl.videoWidth === 0) {
      toast.error("Camera not ready");
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoEl, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(imageData);
      await stopCamera();
      handlePhotoImport(imageData);
    }
  };

  const stopCamera = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {}
    setShowCamera(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result as string;
      setCapturedImage(imageData);
      handlePhotoImport(imageData);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoImport = async (imageBase64: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-recipe-grocery', {
        body: { imageBase64 }
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      const recipe = data.recipe;
      onImport(mapRecipeToFormat(recipe));
      toast.success("Recipe imported from photo!");
      handleClose();
    } catch (error) {
      console.error('Error importing from photo:', error);
      toast.error("Failed to import recipe from photo");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlImport = async () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-recipe-grocery', {
        body: { url }
      });

      if (error) throw error;
      if (data?.error) {
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

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    const ingredientsList = recipe.ingredients || [];
    
    const matchedFoodIds = foods
      .filter(food => 
        ingredientsList.some((ing: any) => {
          const ingName = typeof ing === 'string' ? ing : ing.name;
          return food.name.toLowerCase().includes(ingName.toLowerCase()) ||
                 ingName.toLowerCase().includes(food.name.toLowerCase());
        })
      )
      .map(food => food.id);

    return {
      name: recipe.title || "",
      description: `${recipe.servings ? `Serves ${recipe.servings} | ` : ''}Imported recipe`,
      food_ids: matchedFoodIds,
      instructions: ingredientsList.map((ing: any, i: number) => 
        typeof ing === 'string' ? `${i + 1}. ${ing}` : `${i + 1}. ${ing.quantity} ${ing.unit} ${ing.name}`
      ).join('\n'),
      prepTime: "",
      cookTime: "",
      servings: recipe.servings?.toString() || "",
      additionalIngredients: "",
      tips: "",
      // Add designation metadata
      metadata: {
        isFamily,
        kidId: isFamily ? null : selectedKidId || null,
        preferredMealSlot: preferredMealSlot || null
      }
    };
  };

  const handleClose = () => {
    setUrl("");
    setRecipeText("");
    setJsonInput("");
    setCapturedImage(null);
    setShowCamera(false);
    stopCamera();
    setIsFamily(false);
    setSelectedKidId("");
    setPreferredMealSlot("");
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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" />
            Import Recipe
          </DialogTitle>
          <DialogDescription>
            Import recipes from URLs, photos, or JSON with family/child designation
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="url" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="url">
              <Link2 className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">URL</span>
            </TabsTrigger>
            <TabsTrigger value="photo">
              <Camera className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Photo</span>
            </TabsTrigger>
            <TabsTrigger value="text">
              <Sparkles className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Text</span>
            </TabsTrigger>
            <TabsTrigger value="json">
              <FileJson className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">JSON</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            <TabsContent value="url" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label>Recipe URL</Label>
                <Input
                  placeholder="https://example.com/recipe"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
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
                    <Link2 className="h-4 w-4 mr-2" />
                    Import from URL
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="photo" className="space-y-4 mt-0">
              {!showCamera && !capturedImage && (
                <div className="flex flex-col gap-3">
                  <Button onClick={startCamera} size="lg" className="w-full">
                    <Camera className="h-5 w-5 mr-2" />
                    Take Photo
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    <Upload className="h-5 w-5 mr-2" />
                    Upload Image
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              )}

              {showCamera && (
                <div className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden bg-black">
                    <div id="recipe-photo-scanner" className="w-full aspect-video" />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={capturePhoto} className="flex-1">
                      <Camera className="h-5 w-5 mr-2" />
                      Capture
                    </Button>
                    <Button onClick={stopCamera} variant="outline">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {capturedImage && !isLoading && (
                <div className="space-y-2">
                  <img src={capturedImage} alt="Recipe" className="w-full rounded-lg border" />
                </div>
              )}
            </TabsContent>

            <TabsContent value="text" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label>Recipe Text</Label>
                <Textarea
                  placeholder="Paste recipe text here... (ingredients, instructions, etc.)"
                  value={recipeText}
                  onChange={(e) => setRecipeText(e.target.value)}
                  rows={8}
                  disabled={isLoading}
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

            <TabsContent value="json" className="space-y-4 mt-0">
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
                  onChange={handleJsonFileUpload}
                  className="cursor-pointer"
                />
                <Textarea
                  placeholder='{"name": "Recipe Name", "ingredients": [...], ...}'
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  rows={8}
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

            {/* Recipe Designation Section */}
            <Card className="p-4 bg-muted/30">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Recipe Type</Label>
                    <p className="text-xs text-muted-foreground">
                      Designate for family or specific child
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={isFamily ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setIsFamily(!isFamily);
                      if (!isFamily) setSelectedKidId("");
                    }}
                  >
                    {isFamily ? (
                      <>
                        <Users className="h-4 w-4 mr-2" />
                        Family
                      </>
                    ) : (
                      <>
                        <User className="h-4 w-4 mr-2" />
                        Child-Specific
                      </>
                    )}
                  </Button>
                </div>

                {!isFamily && kids.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">Select Child</Label>
                    <Select value={selectedKidId} onValueChange={setSelectedKidId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a child" />
                      </SelectTrigger>
                      <SelectContent>
                        {kids.map((kid) => (
                          <SelectItem key={kid.id} value={kid.id}>
                            {kid.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-sm">Preferred Meal Slot (Optional)</Label>
                  <Select value={preferredMealSlot} onValueChange={setPreferredMealSlot}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any meal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any meal</SelectItem>
                      <SelectItem value="breakfast">Breakfast</SelectItem>
                      <SelectItem value="lunch">Lunch</SelectItem>
                      <SelectItem value="dinner">Dinner</SelectItem>
                      <SelectItem value="snack1">Morning Snack</SelectItem>
                      <SelectItem value="snack2">Afternoon Snack</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Helps organize your recipes by typical meal times
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
