import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Food, FoodCategory } from "@/types";
import { Loader2, Plus, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BulkAddFoodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (foods: Omit<Food, "id">[]) => Promise<void>;
}

export function BulkAddFoodDialog({
  open,
  onOpenChange,
  onSave,
}: BulkAddFoodDialogProps) {
  const [foodText, setFoodText] = useState("");
  const [defaultCategory, setDefaultCategory] = useState<FoodCategory>("snack");
  const [isSafe, setIsSafe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!foodText.trim()) return;

    setIsLoading(true);

    try {
      // Split by newlines and filter out empty lines
      const lines = foodText
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // Create food objects
      const foods: Omit<Food, "id">[] = lines.map(line => {
        // Try to parse quantity from line (e.g., "Apples x5" or "Apples (5)")
        const quantityMatch = line.match(/[x×(](\d+)[)]/i);
        const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;

        // Clean the name by removing quantity indicators
        const cleanName = line
          .replace(/[x×(]\d+[)]/gi, "")
          .trim();

        return {
          name: cleanName,
          category: defaultCategory,
          is_safe: isSafe,
          is_try_bite: !isSafe,
          quantity: quantity,
        };
      });

      await onSave(foods);

      // Reset form
      setFoodText("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error in bulk add:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const previewCount = foodText
    .split("\n")
    .filter(line => line.trim().length > 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Bulk Add Foods</DialogTitle>
          <DialogDescription>
            Add multiple foods at once. Enter one food per line.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Tips:</strong> You can add quantities like "Apples x5" or "Oranges (3)".
              Default quantity is 1 if not specified.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="food-list">Food List (one per line)</Label>
            <Textarea
              id="food-list"
              placeholder="Banana&#10;Apple x5&#10;Chicken Nuggets (2)&#10;Mac & Cheese"
              value={foodText}
              onChange={(e) => setFoodText(e.target.value)}
              className="min-h-[200px] font-mono"
            />
            {previewCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {previewCount} food{previewCount !== 1 ? "s" : ""} ready to add
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default-category">Default Category</Label>
              <Select
                value={defaultCategory}
                onValueChange={(value) => setDefaultCategory(value as FoodCategory)}
              >
                <SelectTrigger id="default-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="protein">Protein</SelectItem>
                  <SelectItem value="carb">Carb</SelectItem>
                  <SelectItem value="dairy">Dairy</SelectItem>
                  <SelectItem value="fruit">Fruit</SelectItem>
                  <SelectItem value="vegetable">Vegetable</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="food-type">Food Type</Label>
              <Select
                value={isSafe ? "safe" : "try"}
                onValueChange={(value) => setIsSafe(value === "safe")}
              >
                <SelectTrigger id="food-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="safe">Safe Food</SelectItem>
                  <SelectItem value="try">Try Bite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!foodText.trim() || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add {previewCount} Food{previewCount !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
