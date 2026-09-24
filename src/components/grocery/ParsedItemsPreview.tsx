import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Food, FoodCategory, Kid } from '@/types';
import type { ParsedGroceryItem } from '@/lib/parse-grocery-text';
import { cn } from '@/lib/utils';
import { Plus, Trash2, CheckSquare, Square, AlertTriangle } from 'lucide-react';
import {
  GROCERY_CATEGORIES,
  allergenConflictsForNames,
  describeConflicts,
} from '@/components/grocery/groceryInputSchemas';

interface EditableItem extends ParsedGroceryItem {
  selected: boolean;
  /**
   * What the quantity box shows. Kept as text until blur, so clearing the box
   * to type "1.5" does not snap back to 1 on the first keystroke, which is
   * what `parseFloat(value) || 1` on every change did.
   */
  quantityText: string;
}

interface ParsedItemsPreviewProps {
  items: ParsedGroceryItem[];
  onAddSelected: (items: ParsedGroceryItem[]) => void;
  isAdding?: boolean;
  /** Pantry foods, to tell which parsed names carry a kid's allergen. */
  foods?: readonly Food[];
  /** Kids whose allergens to check. */
  kids?: readonly Pick<Kid, 'id' | 'name' | 'allergens'>[];
}

export function ParsedItemsPreview({ items, onAddSelected, isAdding, foods = [], kids = [] }: ParsedItemsPreviewProps) {
  const { t } = useTranslation();
  const [editableItems, setEditableItems] = useState<EditableItem[]>(() => {
    // A row that carries a kid's allergen starts unselected: adding it is a
    // decision the parent makes, not a default they have to catch.
    const conflicts = allergenConflictsForNames(items.map((i) => i.name), foods, kids);
    return items.map((item, index) => ({
      ...item,
      selected: !conflicts.has(index),
      quantityText: String(item.quantity),
    }));
  });

  const conflicts = useMemo(
    () => allergenConflictsForNames(editableItems.map((i) => i.name), foods, kids),
    [editableItems, foods, kids],
  );

  const selectedCount = editableItems.filter((i) => i.selected).length;
  const allSelected = selectedCount === editableItems.length;

  const toggleAll = () => {
    const newVal = !allSelected;
    setEditableItems((prev) => prev.map((i) => ({ ...i, selected: newVal })));
  };

  const toggleItem = (index: number) => {
    setEditableItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item)),
    );
  };

  const updateItem = (index: number, updates: Partial<EditableItem>) => {
    setEditableItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  };

  const commitQuantity = (index: number) => {
    setEditableItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const parsed = parseFloat(item.quantityText);
        if (Number.isFinite(parsed) && parsed > 0) return { ...item, quantity: parsed, quantityText: String(parsed) };
        // Unreadable or zero: keep the last good value rather than inventing 1.
        return { ...item, quantityText: String(item.quantity) };
      }),
    );
  };

  const removeItem = (index: number) => {
    setEditableItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    const selected = editableItems
      .filter((i) => i.selected && i.name.trim())
      .map(({ selected: _selected, quantityText, ...item }) => {
        // A box still being edited when Add is pressed counts as committed.
        const parsed = parseFloat(quantityText);
        return {
          ...item,
          name: item.name.trim(),
          quantity: Number.isFinite(parsed) && parsed > 0 ? parsed : item.quantity,
        };
      });
    onAddSelected(selected);
  };

  const categoryLabel = (category: FoodCategory) => t(`grocery.input.category.${category}`, category);

  if (editableItems.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        {t('grocery.input.preview.empty', 'No items found. Try a different image or text.')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={toggleAll} className="gap-1.5 text-xs h-11 sm:h-9">
          {allSelected ? <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" /> : <Square className="h-3.5 w-3.5" aria-hidden="true" />}
          {allSelected
            ? t('grocery.input.preview.deselectAll', 'Deselect all')
            : t('grocery.input.preview.selectAll', 'Select all')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t('grocery.input.preview.selectedOf', {
            defaultValue: '{{selected}} of {{total}} selected',
            selected: selectedCount,
            total: editableItems.length,
          })}
        </span>
      </div>

      <ScrollArea className="max-h-[300px]">
        <ul className="space-y-2 pr-2">
          {editableItems.map((item, index) => {
            const hits = conflicts.get(index);
            const checkboxId = `parsed-item-${index}`;
            return (
              <li
                key={index}
                className={cn(
                  'rounded-md border p-2 transition-colors',
                  item.selected ? 'bg-accent/50 border-border' : 'bg-muted/30 border-transparent',
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {/* Line 1 on a phone: pick, name, remove. */}
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={item.selected}
                      onCheckedChange={() => toggleItem(index)}
                      aria-label={t('grocery.input.preview.select', { defaultValue: 'Select {{name}}', name: item.name })}
                      className="h-5 w-5"
                    />
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem(index, { name: e.target.value })}
                      className="h-11 min-w-0 flex-1 text-sm sm:h-8"
                      aria-label={t('grocery.input.preview.name', 'Item name')}
                      maxLength={120}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive sm:order-last sm:h-8 sm:w-8"
                      onClick={() => removeItem(index)}
                      aria-label={t('grocery.input.preview.remove', { defaultValue: 'Remove {{name}}', name: item.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>

                  {/* Line 2 on a phone: how much and which category. */}
                  <div className="flex items-center gap-2 pl-7 sm:pl-0">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={item.quantityText}
                      onChange={(e) => updateItem(index, { quantityText: e.target.value })}
                      onBlur={() => commitQuantity(index)}
                      className="h-11 w-16 text-sm sm:h-8"
                      aria-label={t('grocery.input.preview.quantity', { defaultValue: 'Quantity of {{name}}', name: item.name })}
                    />
                    <Input
                      value={item.unit}
                      onChange={(e) => updateItem(index, { unit: e.target.value })}
                      placeholder={t('grocery.input.preview.unitPlaceholder', 'unit')}
                      className="h-11 w-20 text-sm sm:h-8"
                      aria-label={t('grocery.input.preview.unit', { defaultValue: 'Unit of {{name}}', name: item.name })}
                      maxLength={24}
                    />
                    <Select
                      value={item.category}
                      onValueChange={(v) => updateItem(index, { category: v as FoodCategory })}
                    >
                      <SelectTrigger
                        className="h-11 w-[104px] p-1 text-xs sm:h-8"
                        aria-label={t('grocery.input.preview.category', { defaultValue: 'Category of {{name}}', name: item.name })}
                      >
                        <SelectValue>
                          <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                            {categoryLabel(item.category)}
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {GROCERY_CATEGORIES.map((key) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {categoryLabel(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {hits && (
                  <p className="mt-1.5 flex items-start gap-1.5 pl-7 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {t('grocery.input.allergen.notFor', {
                        defaultValue: 'Allergen: {{list}}',
                        list: describeConflicts(hits),
                      })}
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <Button type="button" onClick={handleAdd} disabled={selectedCount === 0 || isAdding} className="h-11 w-full">
        <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
        {t('grocery.input.preview.addSelected', { defaultValue: 'Add {{count}} items to list', count: selectedCount })}
      </Button>
    </div>
  );
}
