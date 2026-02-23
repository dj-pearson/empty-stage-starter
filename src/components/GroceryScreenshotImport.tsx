import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Upload, Loader2, ShoppingCart, CheckCircle2, ImageIcon, X, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { FoodCategory } from "@/types";
import { Html5Qrcode } from "html5-qrcode";
import { logger } from "@/lib/logger";

interface ParsedGroceryItem {
  name: string;
  quantity: number;
  unit: string;
  category: FoodCategory;
  notes?: string;
}

interface GroceryScreenshotImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (items: ParsedGroceryItem[]) => void;
  /** Optional pre-loaded image (e.g. from PWA share target) */
  initialImage?: string | null;
  /** Optional shared text to parse (e.g. from PWA share target) */
  initialText?: string | null;
}

const categoryLabels: Record<FoodCategory, string> = {
  protein: "Protein",
  carb: "Carbs",
  dairy: "Dairy",
  fruit: "Fruits",
  vegetable: "Vegetables",
  snack: "Snacks",
};

export function GroceryScreenshotImport({
  open,
  onOpenChange,
  onImport,
  initialImage,
  initialText,
}: GroceryScreenshotImportProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(initialImage || null);
  const [pastedText, setPastedText] = useState(initialText || "");
  const [parsedItems, setParsedItems] = useState<ParsedGroceryItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Auto-parse initial data when dialog opens with pre-loaded content
  const hasAutoStartedRef = useRef(false);
  if (open && !hasAutoStartedRef.current && (initialImage || initialText)) {
    hasAutoStartedRef.current = true;
    // Defer to avoid state update during render
    setTimeout(() => {
      if (initialImage) {
        setCapturedImage(initialImage);
        parseImage(initialImage);
      } else if (initialText) {
        setPastedText(initialText);
        parseText(initialText);
      }
    }, 0);
  }

  const parseImage = async (imageBase64: string) => {
    setIsParsing(true);
    try {
      const { data, error } = await invokeEdgeFunction<{
        success: boolean;
        items: ParsedGroceryItem[];
        error?: string;
      }>("parse-grocery-screenshot", {
        body: { imageBase64 },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.success && data?.items) {
        setParsedItems(data.items);
        setSelectedItems(new Set(data.items.map((_, i) => i)));
        toast.success(`Found ${data.items.length} grocery items`);
      } else {
        toast.error("No grocery items found in the image");
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
    try {
      const { data, error } = await invokeEdgeFunction<{
        success: boolean;
        items: ParsedGroceryItem[];
        error?: string;
      }>("parse-grocery-screenshot", {
        body: { text },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.success && data?.items) {
        setParsedItems(data.items);
        setSelectedItems(new Set(data.items.map((_, i) => i)));
        toast.success(`Found ${data.items.length} grocery items`);
      } else {
        toast.error("No grocery items found in the text");
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
    // Reset the input so re-selecting the same file works
    event.target.value = "";
  };

  const startCamera = async () => {
    try {
      setCapturedImage(null);
      setParsedItems([]);
      setShowCamera(true);

      await new Promise((r) => setTimeout(r, 50));

      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
          await scannerRef.current.clear();
        } catch {
          // Ignore cleanup errors
        }
        scannerRef.current = null;
      }

      const scanner = new Html5Qrcode("grocery-screenshot-camera");
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) throw new Error("No cameras found");

      const back =
        cameras.find((c) => /back|rear|environment/i.test(c.label)) ||
        cameras[cameras.length - 1];

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
      logger.error("Camera error:", error);
      toast.error("Failed to start camera");
      setShowCamera(false);
    }
  };

  const capturePhoto = async () => {
    const videoEl = document.querySelector(
      "#grocery-screenshot-camera video"
    ) as HTMLVideoElement | null;
    if (!videoEl || videoEl.videoWidth === 0) {
      toast.error("Camera not ready, please wait");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoEl, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg", 0.85);
      setCapturedImage(imageData);
      await stopCamera();
      parseImage(imageData);
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

  const toggleItem = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const updateItem = (index: number, updates: Partial<ParsedGroceryItem>) => {
    setParsedItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const removeItem = (index: number) => {
    setParsedItems((prev) => prev.filter((_, i) => i !== index));
    setSelectedItems((prev) => {
      const newSet = new Set<number>();
      prev.forEach((i) => {
        if (i < index) newSet.add(i);
        else if (i > index) newSet.add(i - 1);
      });
      return newSet;
    });
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleImport = () => {
    const itemsToImport = parsedItems.filter((_, i) => selectedItems.has(i));

    if (itemsToImport.length === 0) {
      toast.error("Please select at least one item");
      return;
    }

    onImport(itemsToImport);
    handleClose();
    toast.success(`Added ${itemsToImport.length} items to grocery list`);
  };

  const handleParseText = () => {
    if (!pastedText.trim()) {
      toast.error("Please paste or type a grocery list");
      return;
    }
    parseText(pastedText.trim());
  };

  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    setPastedText("");
    setParsedItems([]);
    setSelectedItems(new Set());
    setEditingIndex(null);
    hasAutoStartedRef.current = false;
    onOpenChange(false);
  };

  const handleRetry = () => {
    setCapturedImage(null);
    setPastedText("");
    setParsedItems([]);
    setSelectedItems(new Set());
    setEditingIndex(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Import Grocery List
          </DialogTitle>
          <DialogDescription>
            Take a screenshot of your grocery list from Notes, Reminders, a text message, or paste it
            directly
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Input phase - show when no items parsed yet */}
          {parsedItems.length === 0 && !isParsing && (
            <div className="space-y-4">
              {/* Image input options */}
              {!showCamera && !capturedImage && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">From Image or Screenshot</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="lg" className="h-auto py-4 flex-col gap-2">
                      <Upload className="h-6 w-6" />
                      <span className="text-sm">Upload Screenshot</span>
                    </Button>
                    <Button onClick={startCamera} variant="outline" size="lg" className="h-auto py-4 flex-col gap-2">
                      <Camera className="h-6 w-6" />
                      <span className="text-sm">Take Photo</span>
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or paste text</span>
                    </div>
                  </div>

                  {/* Text paste area */}
                  <div className="space-y-2">
                    <textarea
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder={"Paste your grocery list here, e.g.:\n\nMilk\n2 dozen Eggs\nBread - whole wheat\nChicken breast 2 lbs\nBroccoli\nApples (6)"}
                      className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      rows={6}
                    />
                    <Button
                      onClick={handleParseText}
                      disabled={!pastedText.trim()}
                      className="w-full"
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Parse Grocery List
                    </Button>
                  </div>
                </div>
              )}

              {/* Camera view */}
              {showCamera && (
                <div className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden bg-black">
                    <div id="grocery-screenshot-camera" className="w-full aspect-video" />
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
            </div>
          )}

          {/* Captured image preview */}
          {capturedImage && !isParsing && parsedItems.length === 0 && (
            <div className="space-y-2">
              <img src={capturedImage} alt="Grocery list" className="w-full rounded-lg border max-h-[200px] object-contain" />
            </div>
          )}

          {/* Loading state */}
          {isParsing && (
            <Card className="p-8">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium">Parsing your grocery list...</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Identifying items, quantities, and categories
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Parsed items review */}
          {parsedItems.length > 0 && !isParsing && (
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    {parsedItems.length} items found
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Review and edit items before adding to your list
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleRetry}>
                    Try Again
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedItems.size === parsedItems.length) {
                        setSelectedItems(new Set());
                      } else {
                        setSelectedItems(new Set(parsedItems.map((_, i) => i)));
                      }
                    }}
                  >
                    {selectedItems.size === parsedItems.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
              </div>

              <div className="max-h-[350px] overflow-y-auto space-y-2">
                {parsedItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedItems.has(index)}
                      onCheckedChange={() => toggleItem(index)}
                      className="mt-0.5"
                    />

                    {editingIndex === index ? (
                      /* Inline edit mode */
                      <div className="flex-1 space-y-2">
                        <Input
                          value={item.name}
                          onChange={(e) => updateItem(index, { name: e.target.value })}
                          placeholder="Item name"
                          autoFocus
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(index, { quantity: parseInt(e.target.value) || 1 })
                            }
                            placeholder="Qty"
                          />
                          <Input
                            value={item.unit}
                            onChange={(e) => updateItem(index, { unit: e.target.value })}
                            placeholder="Unit"
                          />
                          <Select
                            value={item.category}
                            onValueChange={(v) => updateItem(index, { category: v as FoodCategory })}
                          >
                            <SelectTrigger>
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
                          onClick={() => setEditingIndex(null)}
                        >
                          Done
                        </Button>
                      </div>
                    ) : (
                      /* Display mode */
                      <>
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => toggleItem(index)}
                        >
                          <p className="font-medium text-sm">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.unit}
                            <Badge variant="outline" className="ml-2 text-xs px-1.5 py-0">
                              {categoryLabels[item.category]}
                            </Badge>
                          </p>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground italic mt-0.5">
                              {item.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditingIndex(index)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeItem(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        {selectedItems.has(index) && (
                          <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedItems.size === 0}
                  className="flex-1"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add {selectedItems.size} Items
                </Button>
              </div>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
