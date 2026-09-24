import { useState, useRef, useEffect, useCallback, useId, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { toast } from "sonner";
import { Loader2, Link2, FileJson, Sparkles, Upload, Camera, ChefHat, AlertCircle, RotateCcw } from "lucide-react";
import type { Food, Kid, Recipe } from "@/types";
import type { Html5Qrcode } from "html5-qrcode";
import { logger } from "@/lib/logger";
import { normalizeImportedRecipe, RecipeImportError, type ImportPath } from "@/lib/recipeImport";
import '@/i18n/appLocale';

interface ImportRecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Receives the parsed draft. The Recipes page opens it in the builder for
   * review (item 12) rather than saving it here. This dialog closes only after
   * the promise resolves and stays open with its input on rejection.
   */
  onImport: (recipe: Omit<Recipe, "id">) => Promise<void>;
  foods: Food[];
  /** Unused since the never-persisted Family/Child card was removed; kept so callers compile. */
  kids?: Kid[];
}

type EdgeRecipeResponse = { recipe?: unknown; error?: string } | null | undefined;

const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof RecipeImportError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
};

export function ImportRecipeDialog({ open, onOpenChange, onImport, foods }: ImportRecipeDialogProps) {
  const { t } = useTranslation();
  const uid = useId();
  const [isLoading, setIsLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [recipeText, setRecipeText] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  /** Shown inline in the active pane; the dialog stays open with its input. */
  const [error, setError] = useState<string | null>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (err) {
      logger.debug('Scanner stop error (expected):', err);
      scannerRef.current = null;
    }
    setShowCamera(false);
  }, []);

  // Clean up camera when dialog closes
  useEffect(() => {
    if (!open) {
      void stopCamera();
    }
  }, [open, stopCamera]);

  const startCamera = async () => {
    try {
      setError(null);
      setCapturedImage(null);
      setShowCamera(true);
      // The scanner is ~300KB and only this tab needs it.
      const { Html5Qrcode: Scanner } = await import("html5-qrcode");
      await new Promise((r) => setTimeout(r, 50));

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          await scannerRef.current.clear();
        } catch (err) {
          // Ignore cleanup errors - scanner may already be stopped
          logger.debug('Scanner cleanup error (expected):', err);
        }
        scannerRef.current = null;
      }

      const scanner = new Scanner('recipe-photo-scanner');
      scannerRef.current = scanner;

      const cameras = await Scanner.getCameras();
      if (!cameras || cameras.length === 0) throw new Error('No cameras found');

      const back = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];

      await scanner.start(back.id, { fps: 10, aspectRatio: 1.333 }, () => {}, () => {});
    } catch (err) {
      logger.error('Camera error:', err);
      setError(t("recipes.import.cameraFailed", { defaultValue: "Couldn't start the camera. Try uploading a photo instead." }));
      setShowCamera(false);
    }
  };

  const resetAndClose = () => {
    setUrl("");
    setRecipeText("");
    setJsonInput("");
    setCapturedImage(null);
    setError(null);
    void stopCamera();
    onOpenChange(false);
  };

  /**
   * The one place a recipe leaves the dialog. Close only once the save has
   * landed; on failure keep everything the person typed and say why.
   */
  const submit = async (input: unknown, path: ImportPath, sourceUrl?: string) => {
    const recipe = normalizeImportedRecipe(input, path, foods, sourceUrl);
    await onImport(recipe);
    resetAndClose();
  };

  const fetchParsed = async (fn: 'parse-recipe-grocery' | 'parse-recipe', body: Record<string, unknown>): Promise<unknown> => {
    const { data, error: fnError } = await invokeEdgeFunction<EdgeRecipeResponse>(fn, { body });
    if (fnError) throw fnError;
    if (data?.error) throw new Error(data.error);
    if (!data?.recipe) throw new RecipeImportError(t("recipes.import.nothingFound", { defaultValue: "We couldn't find a recipe there." }));
    return data.recipe;
  };

  const run = async (task: () => Promise<void>, fallback: string, logLabel: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      logger.error(logLabel, err);
      setError(errorMessage(err, fallback));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhotoImport = (imageBase64: string) =>
    run(
      async () => submit(await fetchParsed('parse-recipe-grocery', { imageBase64 }), "photo"),
      t("recipes.import.photoFailed", { defaultValue: "Couldn't import a recipe from that photo." }),
      'Error importing from photo:',
    );

  const capturePhoto = async () => {
    const videoEl = document.querySelector('#recipe-photo-scanner video') as HTMLVideoElement | null;
    if (!videoEl || videoEl.videoWidth === 0) {
      toast.error(t("recipes.import.cameraNotReady", { defaultValue: "Camera not ready" }));
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
      await handlePhotoImport(imageData);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Let the same file be chosen again after an error.
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target?.result;
      if (typeof imageData !== "string") return;
      setCapturedImage(imageData);
      void handlePhotoImport(imageData);
    };
    reader.readAsDataURL(file);
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setError(null);
    void startCamera();
  };

  const chooseAnotherPhoto = () => {
    setCapturedImage(null);
    setError(null);
    fileInputRef.current?.click();
  };

  const handleUrlImport = async (e?: FormEvent) => {
    e?.preventDefault();
    const target = url.trim();
    if (!target) {
      setError(t("recipes.import.urlRequired", { defaultValue: "Enter a recipe URL" }));
      return;
    }
    await run(
      async () => submit(await fetchParsed('parse-recipe-grocery', { url: target }), "url", target),
      t("recipes.import.urlFailed", { defaultValue: "Couldn't import a recipe from that URL." }),
      'Error importing from URL:',
    );
  };

  const handleTextImport = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!recipeText.trim()) {
      setError(t("recipes.import.textRequired", { defaultValue: "Paste the recipe text first" }));
      return;
    }
    // US-709: parse-recipe resolves its own model server-side. The client
    // sends only the content to parse -- naming an endpoint or an API-key
    // env var from here would hand any signed-in user a server secret.
    await run(
      async () => submit(await fetchParsed('parse-recipe', { text: recipeText }), "text"),
      t("recipes.import.textFailed", { defaultValue: "Couldn't import a recipe from that text." }),
      'Error importing from text:',
    );
  };

  const handleJsonImport = async () => {
    await run(
      async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonInput);
        } catch {
          throw new RecipeImportError(t("recipes.import.invalidJson", { defaultValue: "That isn't valid JSON." }));
        }
        await submit(parsed, "json");
      },
      t("recipes.import.jsonFailed", { defaultValue: "Couldn't import that JSON." }),
      'Error importing JSON:',
    );
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") setJsonInput(content);
      else setError(t("recipes.import.fileReadFailed", { defaultValue: "Couldn't read that file." }));
    };
    reader.onerror = () => setError(t("recipes.import.fileReadFailed", { defaultValue: "Couldn't read that file." }));
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = {
      name: "Example Recipe",
      description: "A delicious and easy family meal",
      ingredients: ["chicken breast", "cheddar cheese", "penne pasta", "marinara sauce"],
      instructions: "1. Cook pasta according to package directions\n2. Season and cook chicken in a skillet\n3. Combine pasta, chicken, and sauce\n4. Top with cheese and broil until melted",
      prepTime: "10 min",
      cookTime: "20 min",
      servings: "4",
      difficulty: "easy",
      tags: ["dinner", "kid-friendly", "quick"],
      additionalIngredients: "salt, pepper, olive oil",
      tips: "Let kids help with safe tasks like adding cheese",
      source_url: "https://example.com/recipe",
      image_url: "https://example.com/recipe-photo.jpg"
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recipe-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorBox = error ? (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </div>
  ) : null;

  const importingLabel = t("recipes.import.importing", { defaultValue: "Importing..." });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : !isLoading && resetAndClose())}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChefHat className="h-5 w-5" aria-hidden="true" />
            {t("recipes.import.title", { defaultValue: "Import Recipe" })}
          </DialogTitle>
          <DialogDescription>
            {t("recipes.import.description", {
              defaultValue: "Import a recipe from a link, a photo, pasted text or a JSON file",
            })}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="url" className="flex-1 flex flex-col overflow-hidden" onValueChange={() => setError(null)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="url" aria-label={t("recipes.import.tab.url", { defaultValue: "URL" })}>
              <Link2 className="h-4 w-4 sm:mr-1" aria-hidden="true" />
              <span className="hidden sm:inline">{t("recipes.import.tab.url", { defaultValue: "URL" })}</span>
            </TabsTrigger>
            <TabsTrigger value="photo" aria-label={t("recipes.import.tab.photo", { defaultValue: "Photo" })}>
              <Camera className="h-4 w-4 sm:mr-1" aria-hidden="true" />
              <span className="hidden sm:inline">{t("recipes.import.tab.photo", { defaultValue: "Photo" })}</span>
            </TabsTrigger>
            <TabsTrigger value="text" aria-label={t("recipes.import.tab.text", { defaultValue: "Text" })}>
              <Sparkles className="h-4 w-4 sm:mr-1" aria-hidden="true" />
              <span className="hidden sm:inline">{t("recipes.import.tab.text", { defaultValue: "Text" })}</span>
            </TabsTrigger>
            <TabsTrigger value="json" aria-label={t("recipes.import.tab.json", { defaultValue: "JSON" })}>
              <FileJson className="h-4 w-4 sm:mr-1" aria-hidden="true" />
              <span className="hidden sm:inline">{t("recipes.import.tab.json", { defaultValue: "JSON" })}</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            <TabsContent value="url" className="mt-0">
              <form onSubmit={handleUrlImport} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor={`${uid}-url`}>{t("recipes.import.urlLabel", { defaultValue: "Recipe URL" })}</Label>
                  <Input
                    id={`${uid}-url`}
                    type="url"
                    inputMode="url"
                    placeholder="https://example.com/recipe"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isLoading}
                    autoFocus
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("recipes.import.urlHint", { defaultValue: "Paste a link to a recipe and we'll pull out the details" })}
                  </p>
                </div>
                {errorBox}
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      {importingLabel}
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" aria-hidden="true" />
                      {t("recipes.import.fromUrl", { defaultValue: "Import from URL" })}
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="photo" className="space-y-4 mt-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              />
              {!showCamera && !capturedImage && (
                <div className="flex flex-col gap-3">
                  <Button type="button" onClick={startCamera} size="lg" className="w-full">
                    <Camera className="h-5 w-5 mr-2" aria-hidden="true" />
                    {t("recipes.import.takePhoto", { defaultValue: "Take Photo" })}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    <Upload className="h-5 w-5 mr-2" aria-hidden="true" />
                    {t("recipes.import.uploadImage", { defaultValue: "Upload Image" })}
                  </Button>
                </div>
              )}

              {showCamera && (
                <div className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden bg-muted">
                    <div id="recipe-photo-scanner" className="w-full aspect-video" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={capturePhoto} className="flex-1">
                      <Camera className="h-5 w-5 mr-2" aria-hidden="true" />
                      {t("recipes.import.capture", { defaultValue: "Capture" })}
                    </Button>
                    <Button type="button" onClick={() => void stopCamera()} variant="outline">
                      {t("common.cancel", { defaultValue: "Cancel" })}
                    </Button>
                  </div>
                </div>
              )}

              {capturedImage && (
                <div className="space-y-3">
                  <div className="relative">
                    <img
                      src={capturedImage}
                      alt={t("recipes.import.photoAlt", { defaultValue: "The recipe photo" })}
                      className={isLoading ? "w-full rounded-lg border opacity-60" : "w-full rounded-lg border"}
                    />
                    {isLoading && (
                      <div
                        className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium text-foreground"
                        role="status"
                      >
                        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        {t("recipes.import.readingPhoto", { defaultValue: "Reading the recipe..." })}
                      </div>
                    )}
                  </div>
                  {errorBox}
                  {error && !isLoading && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button type="button" variant="outline" className="flex-1" onClick={retakePhoto}>
                        <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
                        {t("recipes.import.retake", { defaultValue: "Retake" })}
                      </Button>
                      <Button type="button" variant="outline" className="flex-1" onClick={chooseAnotherPhoto}>
                        <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                        {t("recipes.import.chooseAnother", { defaultValue: "Choose another" })}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {!capturedImage && errorBox}
            </TabsContent>

            <TabsContent value="text" className="mt-0">
              <form onSubmit={handleTextImport} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor={`${uid}-text`}>{t("recipes.import.textLabel", { defaultValue: "Recipe Text" })}</Label>
                  <Textarea
                    id={`${uid}-text`}
                    placeholder={t("recipes.import.textPlaceholder", {
                      defaultValue: "Paste recipe text here... (ingredients, instructions, etc.)",
                    })}
                    value={recipeText}
                    onChange={(e) => setRecipeText(e.target.value)}
                    rows={8}
                    disabled={isLoading}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("recipes.import.textHint", { defaultValue: "Paste any recipe text and AI will structure it for you" })}
                  </p>
                </div>
                {errorBox}
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      {importingLabel}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
                      {t("recipes.import.withAi", { defaultValue: "Import with AI" })}
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="json" className="space-y-4 mt-0">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${uid}-json`}>{t("recipes.import.jsonLabel", { defaultValue: "JSON Data" })}</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
                    <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                    {t("recipes.import.downloadTemplate", { defaultValue: "Download Template" })}
                  </Button>
                </div>
                <Input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleJsonFileUpload}
                  className="cursor-pointer"
                  aria-label={t("recipes.import.jsonFile", { defaultValue: "JSON file" })}
                />
                <Textarea
                  id={`${uid}-json`}
                  placeholder='{"name": "Recipe Name", "ingredients": [...], ...}'
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground">
                  {t("recipes.import.jsonHint", { defaultValue: "Upload or paste a JSON file with recipe data" })}
                </p>
              </div>
              {errorBox}
              <Button type="button" onClick={handleJsonImport} disabled={isLoading} className="w-full">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <FileJson className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {isLoading ? importingLabel : t("recipes.import.importJson", { defaultValue: "Import JSON" })}
              </Button>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
