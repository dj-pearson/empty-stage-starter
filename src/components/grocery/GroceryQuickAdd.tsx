import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFoods, useGrocery } from '@/contexts/AppContext';
import { parseGroceryText } from '@/lib/parse-grocery-text';
import type { GroceryAddInput } from '@/lib/groceryMerge';
import { toGroceryAddInput } from '@/components/grocery/groceryInputSchemas';
import '@/i18n/appLocale';

/** How many names the suggestion list offers. A datalist is not a search UI. */
const MAX_SUGGESTIONS = 60;

export interface GroceryQuickAddProps {
  onAdd: (items: GroceryAddInput[]) => void;
}

/**
 * The one-line add that stays open in the aisle.
 *
 * Type "2 lb chicken", press Enter, and the field is empty and still focused
 * for the next item. The line goes through parseGroceryText, so a quantity and
 * unit typed in front of the name land in their own fields, and "eggs, milk,
 * bread" adds three rows. Suggestions are the pantry's names first, then what
 * the household has bought recently.
 */
export function GroceryQuickAdd({ onAdd }: GroceryQuickAddProps) {
  const { t } = useTranslation();
  const { foods } = useFoods();
  const { groceryItems } = useGrocery();
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (name: string | undefined) => {
      const trimmed = name?.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(trimmed);
    };
    for (const food of foods) push(food.name);
    // Recently bought: checked rows, newest first where the row says when.
    const bought = groceryItems
      .filter((item) => item.checked)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    for (const item of bought) push(item.name);
    return out.slice(0, MAX_SUGGESTIONS);
  }, [foods, groceryItems]);

  const submit = () => {
    const parsed = parseGroceryText(value);
    if (parsed.length === 0) {
      inputRef.current?.focus();
      return;
    }
    onAdd(parsed.map((item) => toGroceryAddInput(item, { added_via: 'quick_add' })));
    setValue('');
    setStatus(
      parsed.length === 1
        ? t('grocery.input.quickAdd.addedOne', { defaultValue: 'Added {{name}}', name: parsed[0].name })
        : t('grocery.input.quickAdd.addedMany', { defaultValue: 'Added {{count}} items', count: parsed.length }),
    );
    inputRef.current?.focus();
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Label htmlFor={inputId} className="sr-only">
        {t('grocery.input.quickAdd.label', 'Add an item')}
      </Label>
      <Input
        id={inputId}
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('grocery.input.quickAdd.placeholder', 'Add item, e.g. 2 lb chicken')}
        list={listId}
        autoComplete="off"
        enterKeyHint="done"
        maxLength={200}
        className="h-11 min-w-0 flex-1"
      />
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </datalist>
      <Button
        type="submit"
        className="h-11 min-w-11 shrink-0 px-3"
        disabled={!value.trim()}
        aria-label={t('grocery.input.quickAdd.submit', 'Add to list')}
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        <span className="ml-1 hidden sm:inline">{t('grocery.input.quickAdd.add', 'Add')}</span>
      </Button>
      <p role="status" className="sr-only">
        {status}
      </p>
    </form>
  );
}
