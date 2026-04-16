import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FoodCategory, GroceryItem } from "@/types";

const CATEGORIES: { value: FoodCategory; label: string }[] = [
  { value: "protein", label: "Protein" },
  { value: "carb", label: "Carbs" },
  { value: "dairy", label: "Dairy" },
  { value: "fruit", label: "Fruits" },
  { value: "vegetable", label: "Vegetables" },
  { value: "snack", label: "Snacks" },
];

interface EditGroceryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: GroceryItem | null;
  onSave: (id: string, updates: Partial<GroceryItem>) => void;
}

export function EditGroceryItemDialog({ open, onOpenChange, item, onSave }: EditGroceryItemDialogProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState<FoodCategory>("snack");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (item) {
      setName(item.name);
      setQuantity(item.quantity);
      setUnit(item.unit || "");
      setCategory(item.category);
      setPriority(item.priority || "medium");
      setNotes(item.notes || "");
    }
  }, [item]);

  const handleSave = () => {
    if (!item) return;
    onSave(item.id, {
      name: name.trim(),
      quantity,
      unit,
      category,
      priority,
      notes: notes.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Item</DialogTitle>
          <DialogDescription>Update category, quantity, priority, or notes.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-qty">Quantity</Label>
              <Input
                id="edit-qty"
                type="number"
                min={0}
                step={0.25}
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="edit-unit">Unit</Label>
              <Input id="edit-unit" placeholder="lb, oz, pc..." value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FoodCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High — need soon</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              rows={2}
              placeholder="Brand preference, size, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
