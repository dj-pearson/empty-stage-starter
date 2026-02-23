import { useState, useRef } from "react";
import { Camera, Upload, Loader2, Trash2, Plus, Check, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { toast } from "sonner";
import { FoodCategory } from "@/types";
import { logger } from "@/lib/logger";

interface ParsedGroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: FoodCategory;
  notes?: string;
  selected: boolean;
}

interface ParseGroceryScreenshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItems: (items: Array<{
    name: string;
    quantity: number;
    unit: string;
    category: FoodCategory;
    notes?: string;
  }>) => void;
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
  return `parsed-${Date.now()}-${nextId++}`;
}

export function ParseGroceryScreenshotDialog({
  open,
  onOpenChange,
  onAddItems,
}: ParseGroceryScreenshotDialogProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedGroceryItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedCount = parsedItems.filter((i) => i.selected).length;

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setCapturedImage(imageData);
      parseImage(imageData);
    };
    reader.readAsDataURL(file);

    // Reset so same file can be re-selected
    event.target.value = "";
  };

  const parseImage = async (imageBase64: string) => {
    setIsParsing(true);
    setParsedItems([]);

    try {
      const { data, error } = await invokeEdgeFunction<{
        success: boolean;
        items?: Array<{
          name: string;
          quantity: number;
          unit: string;
          category: FoodCategory;
          notes?: string;
        }>;
        error?: string;
      }>("parse-grocery-screenshot", {
        body: { imageBase64 },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.success && data.items) {
        const items: ParsedGroceryItem[] = data.items.map((item) => ({
          id: generateId(),
          ...item,
          selected: true,
        }));
        setParsedItems(items);
        toast.success(`Found ${items.length} item${items.length === 1 ? "" : "s"}`);
      } else {
        toast.error("No items found in the image");
      }
    } catch (error) {
      logger.error("Error parsing grocery screenshot:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to parse grocery list from image"
      );
    } finally {
      setIsParsing(false);
    }
  };

  const parseText = async (text: string) => {
    setIsParsing(true);
    setParsedItems([]);

    try {
      const { data, error } = await invokeEdgeFunction<{
        success: boolean;
        items?: Array<{
          name: string;
          quantity: number;
          unit: string;
          category: FoodCategory;
          notes?: string;
        }>;
        error?: string;
      }>("parse-grocery-screenshot", {
        body: { textContent: text },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.success && data.items) {
        const items: ParsedGroceryItem[] = data.items.map((item) => ({
          id: generateId(),
          ...item,
          selected: true,
        }));
        setParsedItems(items);
        toast.success(`Found ${items.length} item${items.length === 1 ? "" : "s"}`);
      } else {
        toast.error("No items found in the text");
      }
    } catch (error) {
      logger.error("Error parsing grocery text:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to parse grocery list from text"
      );
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

  const updateItem = (id: string, updates: Partial<ParsedGroceryItem>) => {
    setParsedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleAddSelected = () => {
    const selected = parsedItems.filter((i) => i.selected);
    if (selected.length === 0) {
      toast.error("No items selected");
      return;
    }

    onAddItems(
      selected.map(({ name, quantity, unit, category, notes }) => ({
        name,
        quantity,
        unit,
        category,
        notes,
      }))
    );

    toast.success(`Added ${selected.length} item${selected.length === 1 ? "" : "s"} to grocery list`);
    handleClose();
  };

  const handleClose = () => {
    setCapturedImage(null);
    setParsedItems([]);
    setEditingItemId(null);
    setIsParsing(false);
    onOpenChange(false);
  };

  const handleRetry = () => {
    setCapturedImage(null);
    setParsedItems([]);
    setEditingItemId(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Import from Screenshot
          </DialogTitle>
          <DialogDescription>
            Upload a screenshot of a grocery list from Notes, Reminders, a recipe, or any other source
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Upload prompt - show when no image and not parsing */}
          {!capturedImage && !isParsing && parsedItems.length === 0 && (
            <div className="space-y-3">
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
                size="lg"
              >
                <Upload className="h-5 w-5 mr-2" />
                Upload Screenshot
              </Button>

              <Button
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.capture = "environment";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const imageData = ev.target?.result as string;
                      setCapturedImage(imageData);
                      parseImage(imageData);
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Camera className="h-5 w-5 mr-2" />
                Take Photo
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  Works with screenshots from Apple Notes, Reminders, recipe websites,
                  handwritten lists, and more
                </p>
              </div>
            </div>
          )}

          {/* Image preview */}
          {capturedImage && (
            <div className="relative rounded-lg overflow-hidden border">
              <img
                src={capturedImage}
                alt="Grocery list screenshot"
                className="w-full max-h-48 object-contain bg-muted"
              />
              {!isParsing && parsedItems.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={handleRetry}
                >
                  <X className="h-3 w-3 mr-1" />
                  New Image
                </Button>
              )}
            </div>
          )}

          {/* Analyzing state */}
          {isParsing && (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center space-y-2">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Reading your grocery list...
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Parsed items list */}
          {!isParsing && parsedItems.length > 0 && (
            <div className="space-y-3">
              {/* Select all / count header */}
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAll}
                  className="text-sm"
                >
                  {parsedItems.every((i) => i.selected) ? "Deselect All" : "Select All"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedCount} of {parsedItems.length} selected
                </span>
              </div>

              <ScrollArea className="max-h-[350px]">
                <div className="space-y-2 pr-3">
                  {parsedItems.map((item) => (
                    <Card
                      key={item.id}
                      className={`p-3 transition-opacity ${
                        !item.selected ? "opacity-50" : ""
                      }`}
                    >
                      {editingItemId === item.id ? (
                        /* Editing mode */
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                              <Label className="text-xs">Name</Label>
                              <Input
                                value={item.name}
                                onChange={(e) =>
                                  updateItem(item.id, { name: e.target.value })
                                }
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
                                onChange={(e) =>
                                  updateItem(item.id, { unit: e.target.value })
                                }
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
                            <Check className="h-3 w-3 mr-1" />
                            Done
                          </Button>
                        </div>
                      ) : (
                        /* Display mode */
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
                              <span className="font-medium text-sm">
                                {item.name}
                              </span>
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(item.id)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </ScrollArea>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleAddSelected}
                  className="flex-1"
                  disabled={selectedCount === 0}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add {selectedCount} Item{selectedCount === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
