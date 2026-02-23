import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FoodCategory } from '@/types';
import type { ParsedGroceryItem } from '@/lib/parse-grocery-text';
import { Plus, Trash2, CheckSquare, Square } from 'lucide-react';

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  protein: 'Protein',
  carb: 'Carbs',
  dairy: 'Dairy',
  fruit: 'Fruit',
  vegetable: 'Veggie',
  snack: 'Snack',
};

const CATEGORY_COLORS: Record<FoodCategory, string> = {
  protein: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  carb: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  dairy: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  fruit: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  vegetable: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  snack: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

interface EditableItem extends ParsedGroceryItem {
  selected: boolean;
}

interface ParsedItemsPreviewProps {
  items: ParsedGroceryItem[];
  onAddSelected: (items: ParsedGroceryItem[]) => void;
  isAdding?: boolean;
}

export function ParsedItemsPreview({ items, onAddSelected, isAdding }: ParsedItemsPreviewProps) {
  const [editableItems, setEditableItems] = useState<EditableItem[]>(
    items.map(item => ({ ...item, selected: true }))
  );

  const selectedCount = editableItems.filter(i => i.selected).length;
  const allSelected = selectedCount === editableItems.length;

  const toggleAll = () => {
    const newVal = !allSelected;
    setEditableItems(prev => prev.map(i => ({ ...i, selected: newVal })));
  };

  const toggleItem = (index: number) => {
    setEditableItems(prev =>
      prev.map((item, i) => i === index ? { ...item, selected: !item.selected } : item)
    );
  };

  const updateItem = (index: number, updates: Partial<EditableItem>) => {
    setEditableItems(prev =>
      prev.map((item, i) => i === index ? { ...item, ...updates } : item)
    );
  };

  const removeItem = (index: number) => {
    setEditableItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    const selected = editableItems
      .filter(i => i.selected)
      .map(({ selected: _, ...item }) => item);
    onAddSelected(selected);
  };

  if (editableItems.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No items found. Try a different image or text.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleAll}
          className="gap-1.5 text-xs"
        >
          {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {allSelected ? 'Deselect All' : 'Select All'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {selectedCount} of {editableItems.length} selected
        </span>
      </div>

      <ScrollArea className="max-h-[300px]">
        <div className="space-y-2 pr-2">
          {editableItems.map((item, index) => (
            <div
              key={index}
              className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                item.selected ? 'bg-accent/50 border-border' : 'bg-muted/30 border-transparent opacity-60'
              }`}
            >
              <Checkbox
                checked={item.selected}
                onCheckedChange={() => toggleItem(index)}
                aria-label={`Select ${item.name}`}
              />

              <Input
                value={item.name}
                onChange={(e) => updateItem(index, { name: e.target.value })}
                className="h-8 flex-1 min-w-0 text-sm"
                aria-label="Item name"
              />

              <Input
                type="number"
                min="0.25"
                step="0.25"
                value={item.quantity}
                onChange={(e) => updateItem(index, { quantity: parseFloat(e.target.value) || 1 })}
                className="h-8 w-16 text-sm"
                aria-label="Quantity"
              />

              <Input
                value={item.unit}
                onChange={(e) => updateItem(index, { unit: e.target.value })}
                placeholder="unit"
                className="h-8 w-20 text-sm"
                aria-label="Unit"
              />

              <Select
                value={item.category}
                onValueChange={(v) => updateItem(index, { category: v as FoodCategory })}
              >
                <SelectTrigger className="h-8 w-[90px] text-xs p-1">
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[item.category]}`}>
                    {CATEGORY_LABELS[item.category]}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(index)}
                aria-label={`Remove ${item.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Button
        type="button"
        onClick={handleAdd}
        disabled={selectedCount === 0 || isAdding}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add {selectedCount} Item{selectedCount !== 1 ? 's' : ''} to List
      </Button>
    </div>
  );
}
