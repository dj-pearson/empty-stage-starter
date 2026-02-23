import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShoppingCart, ImageIcon, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";
import { FoodCategory } from "@/types";
import { logger } from "@/lib/logger";

interface ParsedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: FoodCategory;
  notes?: string;
  selected: boolean;
}

const categoryLabels: Record<FoodCategory, string> = {
  protein: "Protein",
  carb: "Carbs",
  dairy: "Dairy",
  fruit: "Fruits",
  vegetable: "Vegetables",
  snack: "Snacks",
};

const categoryColors: Record<FoodCategory, string> = {
  protein: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  carb: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  dairy: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  fruit: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  vegetable: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  snack: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

let nextId = 0;
function generateId(): string {
  return `share-${Date.now()}-${nextId++}`;
}

export default function ShareTarget() {
  const navigate = useNavigate();
  const { addGroceryItem } = useApp();
  const [isParsing, setIsParsing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [sharedContent, setSharedContent] = useState<{
    title?: string;
    text?: string;
    url?: string;
    imageData?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const selectedCount = parsedItems.filter((i) => i.selected).length;

  // Process the shared data from the Web Share Target API
  useEffect(() => {
    async function processSharedData() {
      try {
        // The share target uses POST with multipart/form-data
        // For service-worker-less PWAs, we read from the URL search params (GET fallback)
        // or from a cached form submission
        const url = new URL(window.location.href);
        const title = url.searchParams.get("title") || "";
        const text = url.searchParams.get("text") || "";
        const sharedUrl = url.searchParams.get("url") || "";

        // Check if there's shared content via cache (POST share target uses service worker)
        let imageData: string | undefined;

        // Try to get image from cache if shared via POST
        if ("caches" in window) {
          try {
            const cache = await caches.open("share-target");
            const cachedResponse = await cache.match("/share");
            if (cachedResponse) {
              const formData = await cachedResponse.formData();
              const imageFile = formData.get("image") as File | null;
              if (imageFile) {
                imageData = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(imageFile);
                });
              }
              // Also grab text fields from form data if not in URL
              const formTitle = formData.get("title") as string;
              const formText = formData.get("text") as string;
              const formUrl = formData.get("url") as string;

              // Clean up cache entry
              await cache.delete("/share");

              setSharedContent({
                title: title || formTitle || undefined,
                text: text || formText || undefined,
                url: sharedUrl || formUrl || undefined,
                imageData,
              });

              // Parse based on content type
              if (imageData) {
                await parseImage(imageData);
              } else {
                const combinedText = [formTitle || title, formText || text, formUrl || sharedUrl]
                  .filter(Boolean)
                  .join("\n");
                if (combinedText.trim()) {
                  await parseText(combinedText);
                } else {
                  setError("No content was shared. Please try again.");
                }
              }
              return;
            }
          } catch (cacheError) {
            logger.debug("Cache API not available or error:", cacheError);
          }
        }

        // Fallback: use URL params (GET-based sharing or text shares)
        const combinedText = [title, text, sharedUrl].filter(Boolean).join("\n");

        if (!combinedText.trim()) {
          setError(
            "No grocery list content was detected. Try sharing text or a screenshot of your grocery list."
          );
          return;
        }

        setSharedContent({
          title: title || undefined,
          text: text || undefined,
          url: sharedUrl || undefined,
        });

        await parseText(combinedText);
      } catch (err) {
        logger.error("Error processing shared data:", err);
        setError("Failed to process shared content. Please try again.");
      }
    }

    processSharedData();
  }, []);

  const parseImage = async (imageBase64: string) => {
    setIsParsing(true);
    try {
      const { data, error: fnError } = await invokeEdgeFunction<{
        success: boolean;
        items?: Array<{
          name: string;
          quantity: number;
          unit: string;
          category: FoodCategory;
          notes?: string;
        }>;
        error?: string;
      }>("parse-grocery-screenshot", { body: { imageBase64 } });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      if (data?.success && data.items && data.items.length > 0) {
        setParsedItems(
          data.items.map((item) => ({ id: generateId(), ...item, selected: true }))
        );
      } else {
        setError("No grocery items found in the shared image.");
      }
    } catch (err) {
      logger.error("Error parsing shared image:", err);
      setError(err instanceof Error ? err.message : "Failed to parse the shared image.");
    } finally {
      setIsParsing(false);
    }
  };

  const parseText = async (text: string) => {
    setIsParsing(true);
    try {
      const { data, error: fnError } = await invokeEdgeFunction<{
        success: boolean;
        items?: Array<{
          name: string;
          quantity: number;
          unit: string;
          category: FoodCategory;
          notes?: string;
        }>;
        error?: string;
      }>("parse-grocery-screenshot", { body: { textContent: text } });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      if (data?.success && data.items && data.items.length > 0) {
        setParsedItems(
          data.items.map((item) => ({ id: generateId(), ...item, selected: true }))
        );
      } else {
        setError("No grocery items found in the shared text.");
      }
    } catch (err) {
      logger.error("Error parsing shared text:", err);
      setError(err instanceof Error ? err.message : "Failed to parse the shared text.");
    } finally {
      setIsParsing(false);
    }
  };

  const toggleItem = (id: string) => {
    setParsedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleAll = () => {
    const allSelected = parsedItems.every((i) => i.selected);
    setParsedItems((prev) => prev.map((item) => ({ ...item, selected: !allSelected })));
  };

  const removeItem = (id: string) => {
    setParsedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<ParsedItem>) => {
    setParsedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleAddToGroceryList = () => {
    const selected = parsedItems.filter((i) => i.selected);
    if (selected.length === 0) {
      toast.error("No items selected");
      return;
    }

    selected.forEach(({ name, quantity, unit, category, notes }) => {
      addGroceryItem({ name, quantity, unit, category, notes });
    });

    toast.success(
      `Added ${selected.length} item${selected.length === 1 ? "" : "s"} to grocery list`
    );
    navigate("/grocery");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-lg mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
            <ShoppingCart className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Add to Grocery List</h1>
          {sharedContent && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              {sharedContent.imageData ? (
                <ImageIcon className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span>
                {sharedContent.title || "Shared content"}
              </span>
            </div>
          )}
        </div>

        {/* Shared image preview */}
        {sharedContent?.imageData && (
          <div className="rounded-lg overflow-hidden border">
            <img
              src={sharedContent.imageData}
              alt="Shared grocery list"
              className="w-full max-h-48 object-contain bg-muted"
            />
          </div>
        )}

        {/* Loading state */}
        {isParsing && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">
                  Reading your grocery list...
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error state */}
        {error && !isParsing && (
          <Card className="border-destructive/50">
            <CardContent className="py-8 text-center space-y-4">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => navigate("/grocery")}>
                  Go to Grocery List
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Parsed items */}
        {!isParsing && parsedItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-sm">
                {parsedItems.every((i) => i.selected) ? "Deselect All" : "Select All"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedCount} of {parsedItems.length} selected
              </span>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2 pr-3">
                {parsedItems.map((item) => (
                  <Card
                    key={item.id}
                    className={`p-3 transition-opacity ${!item.selected ? "opacity-50" : ""}`}
                  >
                    {editingItemId === item.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={item.name}
                              onChange={(e) => updateItem(item.id, { name: e.target.value })}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Qty</Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(item.id, {
                                  quantity: Math.max(1, parseInt(e.target.value) || 1),
                                })
                              }
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Unit</Label>
                            <Input
                              value={item.unit}
                              onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Category</Label>
                          <Select
                            value={item.category}
                            onValueChange={(v) =>
                              updateItem(item.id, { category: v as FoodCategory })
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(categoryLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setEditingItemId(null)}
                          className="w-full"
                        >
                          Done
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={item.selected}
                          onCheckedChange={() => toggleItem(item.id)}
                          aria-label={`Select ${item.name}`}
                        />
                        <button
                          type="button"
                          className="flex-1 text-left"
                          onClick={() => setEditingItemId(item.id)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{item.name}</span>
                            <Badge
                              variant="secondary"
                              className={`text-xs ${categoryColors[item.category]}`}
                            >
                              {categoryLabels[item.category]}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.quantity} {item.unit}
                            {item.notes ? ` · ${item.notes}` : ""}
                          </p>
                        </button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => navigate("/grocery")} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleAddToGroceryList}
                className="flex-1"
                disabled={selectedCount === 0}
              >
                <ShoppingCart className="h-4 w-4 mr-1.5" />
                Add {selectedCount} Item{selectedCount === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
