import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, Loader2, Minus, Pencil, Plus, Sun, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { groupItems, nextAisleAfter } from "@/lib/groceryData";
import { formatQuantity } from "@/lib/groceryMerge";
import { aislePosition, sortAisleGroupNames, type WalkOrderContext } from "@/lib/storeWalkOrder";
import { cn } from "@/lib/utils";
import type { GroceryItem } from "@/types";
import "@/i18n/appLocale";

export interface InStoreModeProps {
  /**
   * The rows to shop: unchecked ones, plus just-checked ones still lingering
   * (item.checked true) so a tap can be taken back before the row moves on.
   */
  items: GroceryItem[];
  walkContext: WalkOrderContext | null;
  storeName?: string | null;
  /** Progress over what the page counts (the kid filter included). */
  done: number;
  total: number;
  /** Shown under the title while the list is filtered, e.g. "Only Ava's items". */
  filterLabel?: string | null;
  onToggle: (item: GroceryItem) => void;
  onQuantityStep: (item: GroceryItem, delta: number) => void;
  onEdit: (item: GroceryItem) => void;
  onDelete: (item: GroceryItem) => void;
  onExit: () => void;
  /** Checkout, offered once nothing is left. */
  onFinish?: () => void;
  finishLabel?: string;
  finishing?: boolean;
}

/**
 * Item 18: one aisle at a time, in the store's walk order.
 *
 * Built for a phone held over a trolley: full-width names, a 56px check target,
 * and the quantity, edit and delete controls folded behind a tap on the row so
 * a thumb cannot hit them by accident. When the aisle on screen runs out of
 * rows it moves on to the next one in the walk by itself. Every write goes
 * through the page's own handlers, so the offline queue sees exactly what it
 * sees from the list.
 */
export function InStoreMode({
  items,
  walkContext,
  storeName,
  done,
  total,
  filterLabel,
  onToggle,
  onQuantityStep,
  onEdit,
  onDelete,
  onExit,
  onFinish,
  finishLabel,
  finishing,
}: InStoreModeProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const wakeLock = useScreenWakeLock(true);

  const byAisle = useMemo(() => groupItems(items, "aisle"), [items]);
  const order = useMemo(
    () => sortAisleGroupNames(Object.keys(byAisle).filter((g) => byAisle[g].length > 0), walkContext),
    [byAisle, walkContext],
  );

  const [current, setCurrent] = useState<string | null>(() => order[0] ?? null);
  const lastOrder = useRef<readonly string[]>(order);

  // Auto-advance: the aisle on screen emptied (its last row left after the
  // linger), so move to the next one in the walk.
  const orderKey = order.join("\u0000");
  useEffect(() => {
    setCurrent((prev) => nextAisleAfter(lastOrder.current, prev, order));
    lastOrder.current = order;
    // orderKey carries the order's content; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const aisle = current && order.includes(current) ? current : (order[0] ?? null);
  const index = aisle ? order.indexOf(aisle) : -1;
  const rows = aisle ? byAisle[aisle] ?? [] : [];
  const left = items.filter((i) => !i.checked).length;

  const [openRowId, setOpenRowId] = useState<string | null>(null);
  useEffect(() => setOpenRowId(null), [aisle]);

  // A new aisle starts at its top, and focus moves to its name so a screen
  // reader says where the shopper is now.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [aisle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Escape that closes a dialog opened over this one (Edit) closes only
      // that dialog, not the whole trip.
      const openDialogs = document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
      if (openDialogs.length > 0) return;
      onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  const go = useCallback(
    (step: number) => {
      if (index < 0) return;
      const next = order[index + step];
      if (next) setCurrent(next);
    },
    [index, order],
  );

  const place = aisle ? aislePosition(aisle, walkContext) : null;
  const percent = total > 0 ? Math.floor((done / total) * 100) : 0;
  const transition = reducedMotion ? undefined : "transition-colors duration-150";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="in-store-title"
      data-testid="in-store-mode"
      className="fixed inset-0 z-50 flex flex-col bg-background print:hidden"
    >
      <header className="border-b border-border px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p id="in-store-title" className="truncate text-sm font-medium text-muted-foreground">
              {storeName
                ? t("grocery.inStore.titleStore", { defaultValue: "Shopping at {{store}}", store: storeName })
                : t("grocery.inStore.title", { defaultValue: "In-store mode" })}
            </p>
            {filterLabel && (
              <p className="truncate text-xs text-muted-foreground" data-testid="in-store-filter">
                {filterLabel}
              </p>
            )}
          </div>
          <Button variant="outline" className="h-11 shrink-0 gap-1.5" onClick={onExit}>
            <X className="h-4 w-4" aria-hidden="true" />
            {t("grocery.inStore.exit", { defaultValue: "Exit" })}
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Progress
            value={percent}
            className="h-2 flex-1"
            aria-label={t("grocery.inStore.progressLabel", {
              defaultValue: "{{done}} of {{total}} in the cart",
              done,
              total,
            })}
          />
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground" data-testid="in-store-progress">
            {t("grocery.inStore.progress", {
              defaultValue: "{{done}} of {{total}}",
              done,
              total,
            })}
          </span>
        </div>
        {wakeLock.active && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Sun className="h-3 w-3" aria-hidden="true" />
            {t("grocery.inStore.screenOn", { defaultValue: "Screen stays on while you shop" })}
          </p>
        )}
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto px-4 py-3">
        {aisle ? (
          <>
            <div className="mb-3">
              <p className="text-sm tabular-nums text-muted-foreground" data-testid="in-store-aisle-position">
                {t("grocery.inStore.aislePosition", {
                  defaultValue: "Aisle {{position}} of {{count}} on this trip",
                  position: index + 1,
                  count: order.length,
                })}
              </p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="text-2xl font-bold tracking-tight focus:outline-none"
                data-testid="in-store-aisle"
              >
                {place?.aisleNumber
                  ? t("grocery.inStore.aisleNumbered", {
                      defaultValue: "Aisle {{number}} - {{name}}",
                      number: place.aisleNumber,
                      name: aisle,
                    })
                  : aisle}
              </h2>
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((item) => {
                const open = openRowId === item.id;
                const qty = Number(item.quantity);
                const qtyText = Number.isFinite(qty)
                  ? `${formatQuantity(qty)}${item.unit ? ` ${item.unit}` : ""}`
                  : "";
                return (
                  <li key={item.id} data-testid="in-store-row" data-checked={item.checked ? "true" : "false"}>
                    <div className="flex items-center gap-2 pr-2">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={item.checked}
                        aria-label={
                          item.checked
                            ? t("grocery.row.uncheck", { defaultValue: "Uncheck {{name}}", name: item.name })
                            : t("grocery.row.check", { defaultValue: "Check off {{name}}", name: item.name })
                        }
                        onClick={() => onToggle(item)}
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border-2",
                            transition,
                            item.checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground bg-background",
                          )}
                        >
                          {item.checked && <Check className="h-6 w-6" />}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenRowId(open ? null : item.id)}
                        className={cn(
                          "min-h-16 min-w-0 flex-1 rounded-md py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        <span
                          className={cn(
                            "block break-words text-lg font-medium leading-snug",
                            item.checked ? "text-muted-foreground line-through" : "text-foreground",
                          )}
                        >
                          {item.name}
                        </span>
                        {qtyText && qty !== 1 && (
                          <span className="block text-sm tabular-nums text-muted-foreground">{qtyText}</span>
                        )}
                      </button>
                    </div>
                    {open && (
                      <div className="flex flex-wrap items-center gap-2 px-4 pb-3" data-testid="in-store-row-tools">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => onQuantityStep(item, -1)}
                          disabled={qty <= 0.25}
                          aria-label={t("grocery.row.decrease", { defaultValue: "Decrease {{name}}", name: item.name })}
                        >
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <span className="min-w-12 text-center tabular-nums">{qtyText}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-11 w-11"
                          onClick={() => onQuantityStep(item, 1)}
                          aria-label={t("grocery.row.increase", { defaultValue: "Increase {{name}}", name: item.name })}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" className="h-11 gap-1.5" onClick={() => onEdit(item)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          {t("grocery.inStore.edit", { defaultValue: "Edit" })}
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-11 gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => onDelete(item)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          {t("grocery.inStore.remove", { defaultValue: "Remove" })}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="py-12 text-center" data-testid="in-store-done">
            <h2 ref={headingRef} tabIndex={-1} className="mb-2 text-2xl font-bold tracking-tight focus:outline-none">
              {t("grocery.inStore.doneTitle", { defaultValue: "That's everything" })}
            </h2>
            <p className="mb-6 text-muted-foreground">
              {t("grocery.inStore.doneBody", { defaultValue: "Every item on this trip is in the cart." })}
            </p>
            <div className="flex flex-col items-center gap-2">
              {onFinish && finishLabel && (
                <Button className="h-12 min-w-56" onClick={onFinish} disabled={finishing} aria-busy={finishing}>
                  {finishing ? (
                    <Loader2 className="mr-1.5 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  )}
                  {finishLabel}
                </Button>
              )}
              <Button variant="outline" className="h-12 min-w-56" onClick={onExit}>
                {t("grocery.inStore.backToList", { defaultValue: "Back to the list" })}
              </Button>
            </div>
          </div>
        )}
      </main>

      {aisle && (
        <footer className="flex items-center gap-2 border-t border-border px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <Button
            variant="outline"
            className="h-12 flex-1 gap-1"
            onClick={() => go(-1)}
            disabled={index <= 0}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            {t("grocery.inStore.previous", { defaultValue: "Previous aisle" })}
          </Button>
          <span className="shrink-0 px-1 text-sm tabular-nums text-muted-foreground">
            {t("grocery.inStore.left", { defaultValue: "{{count}} left", count: left })}
          </span>
          <Button
            variant="outline"
            className="h-12 flex-1 gap-1"
            onClick={() => go(1)}
            disabled={index < 0 || index >= order.length - 1}
          >
            {t("grocery.inStore.next", { defaultValue: "Next aisle" })}
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
        </footer>
      )}
    </div>
  );
}
