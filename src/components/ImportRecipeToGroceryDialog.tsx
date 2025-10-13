import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Link2, Camera, Upload, Loader2, ShoppingCart, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FoodCategory } from "@/types";
import { Html5Qrcode } from "html5-qrcode";

interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
  category: FoodCategory;
  notes?: string;
}

interface ParsedRecipe {
  title: string;
  ingredients: ParsedIngredient[];
  servings?: number;
}

interface ImportRecipeToGroceryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (ingredients: ParsedIngredient[]) => void;
}

export function ImportRecipeToGroceryDialog({ open, onOpenChange, onImport }: ImportRecipeToGroceryDialogProps) {
  const [activeTab, setActiveTab] = useState<"url" | "photo">("url");
  const [recipeUrl, setRecipeUrl] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [selectedIngredients, setSelectedIngredients] = useState<Set<number>>(new Set());
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const handleParseUrl = async () => {
    if (!recipeUrl.trim()) {
      toast.error("Please enter a recipe URL");
      return;
    }

    setIsParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-recipe-grocery', {
        body: { url: recipeUrl }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.recipe) {
        setParsedRecipe(data.recipe);
        // Select all ingredients by default
        setSelectedIngredients(new Set(data.recipe.ingredients.map((_: any, i: number) => i)));
        toast.success(`Found ${data.recipe.ingredients.length} ingredients from "${data.recipe.title}"`);
      }
    } catch (error) {
      console.error('Error parsing recipe:', error);
      toast.error(error instanceof Error ? error.message : "Failed to parse recipe");
    } finally {
      setIsParsing(false);
    }
  };

  const handleParseImage = async (imageBase64: string) => {
    setIsParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-recipe-grocery', {
        body: { imageBase64 }
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.recipe) {
        setParsedRecipe(data.recipe);
        setSelectedIngredients(new Set(data.recipe.ingredients.map((_: any, i: number) => i)));
        toast.success(`Found ${data.recipe.ingredients.length} ingredients from the recipe photo`);
      }
    } catch (error) {
      console.error('Error parsing recipe image:', error);
      toast.error(error instanceof Error ? error.message : "Failed to parse recipe from image");
    } finally {
      setIsParsing(false);
    }
  };

  const startCamera = async () => {
    try {
      setCapturedImage(null);
      setParsedRecipe(null);
      setShowCamera(true);

      await new Promise((r) => setTimeout(r, 50));

      if (scannerRef.current) {
        try { await scannerRef.current.stop(); await scannerRef.current.clear(); } catch {}
        scannerRef.current = null;
      }

      const scanner = new Html5Qrcode('recipe-camera');
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) throw new Error('No cameras found');
      
      const back = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];

      await scanner.start(
        back.id,
        {
          fps: 10,
          aspectRatio: 1.333,
          qrbox: undefined,
        },
        () => {},
        () => {}
      );
    } catch (error) {
      console.error('Camera error:', error);
      toast.error("Failed to start camera");
      setShowCamera(false);
    }
  };

  const capturePhoto = async () => {
    const videoEl = document.querySelector('#recipe-camera video') as HTMLVideoElement | null;
    if (!videoEl || videoEl.videoWidth === 0) {
      toast.error("Camera not ready, please wait");
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
      handleParseImage(imageData);
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setCapturedImage(imageData);
      handleParseImage(imageData);
    };
    reader.readAsDataURL(file);
  };

  const toggleIngredient = (index: number) => {
    const newSelected = new Set(selectedIngredients);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIngredients(newSelected);
  };

  const handleImport = () => {
    if (!parsedRecipe) return;

    const ingredientsToImport = parsedRecipe.ingredients.filter((_, i) => selectedIngredients.has(i));
    
    if (ingredientsToImport.length === 0) {
      toast.error("Please select at least one ingredient");
      return;
    }

    onImport(ingredientsToImport);
    handleClose();
    toast.success(`Added ${ingredientsToImport.length} ingredients to grocery list`);
  };

  const handleClose = () => {
    stopCamera();
    setRecipeUrl("");
    setCapturedImage(null);
    setParsedRecipe(null);
    setSelectedIngredients(new Set());
    setActiveTab("url");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Import Recipe to Grocery List
          </DialogTitle>
          <DialogDescription>
            Parse a recipe from a URL or photo to add ingredients to your grocery list
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url" className="gap-2">
              <Link2 className="h-4 w-4" />
              Recipe URL
            </TabsTrigger>
            <TabsTrigger value="photo" className="gap-2">
              <Camera className="h-4 w-4" />
              Recipe Photo
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            <TabsContent value="url" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label htmlFor="recipe-url">Recipe URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="recipe-url"
                    type="url"
                    value={recipeUrl}
                    onChange={(e) => setRecipeUrl(e.target.value)}
                    placeholder="https://example.com/recipe"
                    disabled={isParsing}
                  />
                  <Button onClick={handleParseUrl} disabled={isParsing || !recipeUrl.trim()}>
                    {isParsing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Parse"
                    )}
                  </Button>
                </div>
              </div>
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
                    <div id="recipe-camera" className="w-full aspect-video" />
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

              {capturedImage && !isParsing && (
                <div className="space-y-2">
                  <img src={capturedImage} alt="Recipe" className="w-full rounded-lg border" />
                </div>
              )}
            </TabsContent>

            {isParsing && (
              <Card className="p-8">
                <div className="flex flex-col items-center justify-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Parsing recipe...</p>
                </div>
              </Card>
            )}

            {parsedRecipe && !isParsing && (
              <Card className="p-4 space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{parsedRecipe.title}</h3>
                  {parsedRecipe.servings && (
                    <p className="text-sm text-muted-foreground">Servings: {parsedRecipe.servings}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Select Ingredients to Add</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (selectedIngredients.size === parsedRecipe.ingredients.length) {
                          setSelectedIngredients(new Set());
                        } else {
                          setSelectedIngredients(new Set(parsedRecipe.ingredients.map((_, i) => i)));
                        }
                      }}
                    >
                      {selectedIngredients.size === parsedRecipe.ingredients.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>

                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {parsedRecipe.ingredients.map((ingredient, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleIngredient(index)}
                      >
                        <Checkbox
                          checked={selectedIngredients.has(index)}
                          onCheckedChange={() => toggleIngredient(index)}
                        />
                        <div className="flex-1 text-sm">
                          <p className="font-medium">{ingredient.name}</p>
                          <p className="text-muted-foreground">
                            {ingredient.quantity} {ingredient.unit} • {ingredient.category}
                          </p>
                          {ingredient.notes && (
                            <p className="text-xs text-muted-foreground mt-1">{ingredient.notes}</p>
                          )}
                        </div>
                        {selectedIngredients.has(index) && (
                          <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button variant="outline" onClick={handleClose} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={selectedIngredients.size === 0}
                    className="flex-1"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Add {selectedIngredients.size} Items
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
