import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { GroceryItem } from "@/types";
import { isCurrencyCode, localeCurrency, parsePriceInput, viewerLocale } from "@/lib/money";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

export interface PurchasePrice {
  unitPrice: number;
  currency: string;
}

interface PurchasePricesProps {
  /** The bought rows on screen. */
  items: readonly GroceryItem[];
  /** A price was entered (or cleared, with null) for one row. */
  onSetPrice: (item: GroceryItem, price: PurchasePrice | null) => void;
}

/**
 * Item 22: optional prices at checkout. Collapsed by default so a shop that
 * does not care about prices never sees a form; opened, one field per bought
 * row, saved when the field is left. Checkout then records each price on the
 * row's purchase movement, and a price in the food's own unit becomes the
 * food's last known price.
 */
export const PurchasePrices = memo(function PurchasePrices({ items, onSetPrice }: PurchasePricesProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [fallbackCurrency] = useState(() => localeCurrency(viewerLocale()));
  if (items.length === 0) return null;

  return (
    <div className="border-t border-border px-4 py-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 gap-1.5 px-2"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Tag className="h-4 w-4" aria-hidden="true" />
        {open ? t("pantry.price.checkoutHide", "Hide prices") : t("pantry.price.checkoutToggle", "Add prices (optional)")}
        <ChevronDown
          className={cn("h-4 w-4 motion-safe:transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </Button>
      {open && (
        <div className="mt-1 space-y-2 pb-1">
          <p className="text-xs text-muted-foreground">
            {t(
              "pantry.price.checkoutHint",
              "Saved with this shop, and used to estimate what thrown-out food costs."
            )}
          </p>
          <ul className="space-y-2">
            {items.map((item) => (
              <PriceField
                key={item.id}
                item={item}
                currency={isCurrencyCode(item.currency) ? item.currency : fallbackCurrency}
                onSetPrice={onSetPrice}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});

function PriceField({
  item,
  currency,
  onSetPrice,
}: {
  item: GroceryItem;
  currency: string;
  onSetPrice: (item: GroceryItem, price: PurchasePrice | null) => void;
}) {
  const { t } = useTranslation();
  const initial = typeof item.price_per_unit === "number" ? String(item.price_per_unit) : "";
  const [text, setText] = useState(initial);
  const parsed = parsePriceInput(text);
  const invalid = text.trim() !== "" && parsed === null;
  const id = `purchase-price-${item.id}`;

  const commit = () => {
    if (invalid) return;
    const before = typeof item.price_per_unit === "number" ? item.price_per_unit : null;
    if (parsed === before) return;
    onSetPrice(item, parsed === null ? null : { unitPrice: parsed, currency });
  };

  return (
    <li className="flex items-center gap-2">
      <Label htmlFor={id} className="flex-1 min-w-0 text-sm truncate">
        {item.unit
          ? t("pantry.price.rowLabel", { defaultValue: "{{name}}, per {{unit}}", name: item.name, unit: item.unit })
          : item.name}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        aria-invalid={invalid}
        className="h-11 w-24 text-right tabular-nums"
      />
      <span className="w-10 text-xs text-muted-foreground">{currency}</span>
    </li>
  );
}
