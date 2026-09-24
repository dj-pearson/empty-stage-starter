import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
} from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Upload, Loader2, Check, X, Trash2, Receipt, Link2Off, AlertTriangle, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useFoods } from "@/contexts/AppContext";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { analytics } from "@/lib/analytics";
import { useFeatureLimit } from "@/hooks/useFeatureLimit";
import { logger } from "@/lib/logger";
import { PHOTO_AI_NOTICE } from "@/lib/aiSafety";
import {
  acceptedRowsToFoods,
  averageConfidence,
  parseResponseToReviewRows,
  topUpUnits,
  unitsMismatch,
  type ParseResponse,
  type ReviewRow,
} from "@/lib/receiptParse";
import { matchReceiptLinesToList, receiptMatchScore } from "@/lib/receiptListMatch";
import { planReceiptApply, type ReceiptApplyPlan } from "@/lib/receiptApply";
import type { Food, GroceryItem } from "@/types";
import "@/i18n/appLocale";

/** Select value for "this line is not on the list". */
const NOT_ON_LIST = "__not_on_list__";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Stock to add to a matched pantry food. When passed it replaces the
   * dialog's own `updateFood({ quantity: current + delta })`, which wrote an
   * absolute total computed from a possibly stale copy and bypassed the
   * inventory ledger. `unit` is what the receipt line was sold in (null when
   * it said nothing), so the page can convert or flag it.
   */
  onTopUp?: (foodId: string, delta: number, unit: string | null) => Promise<void>;
  /**
   * Item 16: the unchecked rows of the grocery list on screen. Given, the
   * review sheet pairs receipt lines with them and the confirm checks them
   * off as well as crediting the pantry.
   */
  listRows?: GroceryItem[];
  /** The pantry food a list row credits, as checkout would resolve it. */
  resolveFoodForRow?: (row: GroceryItem) => Food | undefined;
  /**
   * Runs the confirmed plan (check-offs and pantry credit together) and says
   * whether it went through; the caller owns the toast and its Undo. Required
   * with listRows; without it the dialog saves to the pantry itself.
   */
  onApplyToList?: (plan: ReceiptApplyPlan) => Promise<boolean>;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("unexpected reader result"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function ScanReceiptDialog({
  open,
  onClose,
  onTopUp,
  listRows,
  resolveFoodForRow,
  onApplyToList,
}: Props) {
  const { t } = useTranslation();
  const { foods, addFoods, updateFood } = useFoods();
  const { checkFeatureLimit, incrementUsage } = useFeatureLimit();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"upload" | "parsing" | "review" | "saving">("upload");
  const [merchant, setMerchant] = useState<string | null>(null);
  const [purchasedAt, setPurchasedAt] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>("USD");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Receipt line uid -> the grocery row it pays for (null: not on the list).
  const [listMatch, setListMatch] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  // Receipt line uid -> the pantry food its own spelling matched, before any
  // list pairing replaced it. Re-pointing a line away from a row puts this back.
  const receiptFoodRef = useRef<ReadonlyMap<string, string | null>>(new Map());
  const listMode = Boolean(listRows && onApplyToList);
  const openListRows = useMemo(() => (listRows ?? []).filter((r) => !r.checked), [listRows]);
  const listRowById = useMemo(() => new Map(openListRows.map((r) => [r.id, r])), [openListRows]);
  const startRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setStage("upload");
    setMerchant(null);
    setPurchasedAt(null);
    setCurrency("USD");
    setRows([]);
    setError(null);
    setListMatch(new Map());
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleFileSelected = useCallback(
    async (file: File | null) => {
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error(t("grocery.receipt.notImage", "Please select an image file"));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(t("grocery.receipt.tooLarge", "Image too large - max 10 MB"));
        return;
      }

      // US-294: free tier = 3 receipt scans/month; paid = unlimited.
      const limit = await checkFeatureLimit("receipt_scan");
      if (!limit.allowed) {
        analytics.trackEvent("receipt_scan_limit_reached", {
          current: limit.current ?? null,
          limit: limit.limit ?? null,
        });
        return;
      }

      setStage("parsing");
      setError(null);
      startRef.current = performance.now();
      analytics.trackEvent("receipt_scan_started", {
        file_size_kb: Math.round(file.size / 1024),
      });

      try {
        const base64 = await fileToBase64(file);
        const { data, error: invokeError } = await invokeEdgeFunction<ParseResponse>(
          "parse-receipt-image",
          { body: { imageBase64: base64 } },
        );
        if (invokeError) throw invokeError;
        if (!data) throw new Error("Empty response from receipt parser");

        let parsedRows: ReviewRow[] = parseResponseToReviewRows(data, foods);
        receiptFoodRef.current = new Map(parsedRows.map((r) => [r.uid, r.matchedFoodId]));
        let matches = new Map<string, string>();
        if (listMode) {
          matches = matchReceiptLinesToList(parsedRows, openListRows);
          // A line paying for a list row credits the food that row resolves
          // to, which is what checkout would have credited. The receipt's own
          // spelling ("ORG WHL MILK") is a worse guess at it.
          //
          // Only when the pairing is sure of itself. A subset pairing (score 2:
          // "APPLE JUICE" against a row "apple") must not move a line off the
          // food its own spelling matched exactly; it stays paired on the sheet
          // but unticked, so the parent confirms it.
          parsedRows = parsedRows.map((r) => {
            const row = listRowById.get(matches.get(r.uid) ?? "");
            const food = row ? resolveFoodForRow?.(row) : undefined;
            if (!row || !food || food.id === r.matchedFoodId) return r;
            if (r.matchedFoodId && receiptMatchScore(r.parsedName, row.name) < 3) {
              return { ...r, accept: false };
            }
            const unitMismatch = unitsMismatch(r.unit, food.unit);
            return { ...r, matchedFoodId: food.id, unitMismatch, accept: r.confidence >= 0.5 && !unitMismatch };
          });
        }
        const avgConfidence = averageConfidence(parsedRows);

        const durationMs = startRef.current
          ? Math.round(performance.now() - startRef.current)
          : 0;
        analytics.trackEvent("receipt_parse_completed", {
          avg_confidence: Number(avgConfidence.toFixed(2)),
          line_count: parsedRows.length,
          merchant: data.merchant ?? "unknown",
          duration_ms: durationMs,
        });

        if (parsedRows.length === 0 || avgConfidence < 0.4) {
          analytics.trackEvent("receipt_low_confidence", {
            line_count: parsedRows.length,
            avg_confidence: Number(avgConfidence.toFixed(2)),
          });
          toast.error(
            t("grocery.receipt.unclear", "Couldn't read this receipt clearly. Try better light, or paste the list instead."),
          );
          setError(t("grocery.receipt.lowConfidence", "Low confidence parse. Try a clearer photo."));
          setStage("upload");
          return;
        }

        setMerchant(data.merchant);
        setPurchasedAt(data.purchasedAt);
        setCurrency(data.currency);
        setRows(parsedRows);
        setListMatch(matches);
        setStage("review");
        // Count the scan against the monthly quota only once the parse
        // actually produced a reviewable result.
        void incrementUsage("receipt_scan");
      } catch (err) {
        logger.error("receipt scan failed", err);
        toast.error(t("grocery.receipt.failed", "Receipt scan failed. Try again, or paste the list instead."));
        setError(err instanceof Error ? err.message : t("grocery.receipt.unknownError", "Unknown error"));
        setStage("upload");
      }
    },
    [foods, checkFeatureLimit, incrementUsage, t, listMode, openListRows, listRowById, resolveFoodForRow],
  );

  const updateRow = useCallback(
    (uid: string, patch: Partial<ReviewRow>) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.uid !== uid) return r;
          const next = { ...r, ...patch };
          // Editing the unit, or unlinking the match, can resolve a mismatch.
          if ("unit" in patch || "matchedFoodId" in patch) {
            const food = next.matchedFoodId ? foods.find((f) => f.id === next.matchedFoodId) : undefined;
            next.unitMismatch = food ? unitsMismatch(next.unit, food.unit) : false;
          }
          return next;
        }),
      );
    },
    [foods],
  );

  const removeRow = useCallback((uid: string) => {
    setRows((prev) => prev.filter((r) => r.uid !== uid));
    setListMatch((prev) => {
      if (!prev.has(uid)) return prev;
      const next = new Map(prev);
      next.delete(uid);
      return next;
    });
  }, []);

  /** Point a line at a list row (or at none). One line per row. */
  const setLineMatch = useCallback(
    (uid: string, rowId: string | null) => {
      setListMatch((prev) => {
        const next = new Map(prev);
        if (rowId) {
          for (const [otherUid, otherRow] of next) {
            if (otherUid !== uid && otherRow === rowId) next.set(otherUid, null);
          }
        }
        next.set(uid, rowId);
        return next;
      });
      const row = rowId ? listRowById.get(rowId) : undefined;
      const food = row ? resolveFoodForRow?.(row) : undefined;
      if (food) {
        // The row's food, with the unit check the parse path runs: a line in
        // "lb" pointed at a food counted in "bags" starts unticked.
        setRows((prev) =>
          prev.map((r) => {
            if (r.uid !== uid) return r;
            const unitMismatch = unitsMismatch(r.unit, food.unit);
            return { ...r, matchedFoodId: food.id, unitMismatch, accept: unitMismatch ? false : r.accept };
          }),
        );
      } else {
        // No food behind the new row, or no row at all: the line goes back to
        // what its own spelling matched (or becomes a new food), never keeps
        // crediting the previous row's food.
        updateRow(uid, { matchedFoodId: receiptFoodRef.current.get(uid) ?? null });
      }
    },
    [listRowById, resolveFoodForRow, updateRow],
  );

  const trustAll = useCallback(() => {
    setRows((prev) => prev.map((r) => ({ ...r, accept: true })));
  }, []);

  const skipLowConfidence = useCallback(() => {
    setRows((prev) => prev.map((r) => ({ ...r, accept: r.confidence >= 0.7 })));
  }, []);

  const acceptedRows = useMemo(() => rows.filter((r) => r.accept), [rows]);
  const droppedCount = rows.length - acceptedRows.length;

  const handleConfirm = useCallback(async () => {
    if (acceptedRows.length === 0) {
      toast.error(t("grocery.receipt.noneSelected", "No items selected"));
      return;
    }
    setStage("saving");
    try {
      // A match can go stale while the review is open (the food was deleted on
      // another device). That row becomes a new food rather than an update to
      // nothing.
      const foodById = new Map(foods.map((f) => [f.id, f]));
      const rowsToSave = acceptedRows.map((r) =>
        r.matchedFoodId && !foodById.has(r.matchedFoodId) ? { ...r, matchedFoodId: null } : r,
      );
      if (listMode && onApplyToList) {
        const plan = planReceiptApply(rowsToSave, listMatch);
        const ok = await onApplyToList(plan);
        if (!ok) {
          setStage("review");
          return;
        }
        analytics.trackEvent("receipt_items_accepted", {
          accepted_count: acceptedRows.length,
          edited_count: 0,
          dropped_count: droppedCount,
          merchant: merchant ?? "unknown",
          list_rows_checked: plan.checkOffRowIds.length,
        });
        handleClose();
        return;
      }
      const { updates, creates } = acceptedRowsToFoods(rowsToSave);

      // Creates first: addFoods can fail, and a retry after that must not top
      // up the matched foods a second time.
      if (creates.length > 0) {
        const ok = await addFoods(creates);
        if (!ok) throw new Error("addFoods returned false");
      }
      if (onTopUp) {
        const units = topUpUnits(rowsToSave);
        for (const { foodId, quantityDelta } of updates) {
          await onTopUp(foodId, quantityDelta, units.get(foodId) ?? null);
        }
      } else {
        for (const { foodId, quantityDelta } of updates) {
          const current = foodById.get(foodId)?.quantity ?? 0;
          updateFood(foodId, { quantity: Math.round((current + quantityDelta) * 100) / 100 });
        }
      }

      analytics.trackEvent("receipt_items_accepted", {
        accepted_count: acceptedRows.length,
        edited_count: 0,
        dropped_count: droppedCount,
        merchant: merchant ?? "unknown",
      });
      analytics.trackEvent("receipt_first_scan_completed", {
        item_count: acceptedRows.length,
      });

      toast.success(
        t("grocery.receipt.saved", {
          defaultValue: "Pantry updated: {{added}} new, {{topped}} topped up",
          added: creates.length,
          topped: updates.length,
        }),
      );
      handleClose();
    } catch (err) {
      logger.error("receipt save failed", err);
      toast.error(t("grocery.receipt.saveFailed", "Couldn't save pantry items. Try again."));
      setStage("review");
    }
  }, [
    acceptedRows, addFoods, updateFood, onTopUp, foods, droppedCount, handleClose, merchant, t,
    listMode, onApplyToList, listMatch,
  ]);

  // How many list rows the confirm will check off, for its label.
  const checkOffCount = useMemo(() => {
    if (!listMode) return 0;
    const ids = new Set<string>();
    for (const r of acceptedRows) {
      const rowId = listMatch.get(r.uid);
      if (rowId && listRowById.has(rowId)) ids.add(rowId);
    }
    return ids.size;
  }, [listMode, acceptedRows, listMatch, listRowById]);

  const foodNameById = useMemo(() => new Map(foods.map((f) => [f.id, f.name])), [foods]);
  const foodUnitById = useMemo(() => new Map(foods.map((f) => [f.id, f.unit ?? ""])), [foods]);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : handleClose())}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" aria-hidden="true" />
            {t("grocery.receipt.title", "Scan a receipt")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "grocery.receipt.description",
              "Snap a photo of your grocery receipt. Items already in your pantry are topped up; the rest are added.",
            )}
          </DialogDescription>
          {/* US-632: see ImageFoodCapture. */}
          <p className="text-xs text-muted-foreground">{PHOTO_AI_NOTICE}</p>
        </DialogHeader>

        {stage === "upload" && (
          <div className="space-y-4 py-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void handleFileSelected(file);
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="lg"
                className="gap-2 h-24 text-base"
              >
                <Camera className="h-6 w-6" aria-hidden="true" />
                {t("grocery.receipt.takePhoto", "Take photo")}
              </Button>
              <Button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute("capture");
                    fileInputRef.current.click();
                    fileInputRef.current.setAttribute("capture", "environment");
                  }
                }}
                variant="outline"
                size="lg"
                className="gap-2 h-24 text-base"
              >
                <Upload className="h-6 w-6" aria-hidden="true" />
                {t("grocery.receipt.uploadImage", "Upload image")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {t("grocery.receipt.tip", "Tip: lay the receipt flat, fill the frame, and use even light.")}
            </p>
            {error && (
              <p className="text-sm text-destructive text-center" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {stage === "parsing" && (
          <div className="space-y-3 py-6" aria-live="polite" aria-busy="true">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              <span>{t("grocery.receipt.reading", "Reading your receipt...")}</span>
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {stage === "review" && (
          <ReviewScreen
            merchant={merchant}
            purchasedAt={purchasedAt}
            currency={currency}
            rows={rows}
            onUpdateRow={updateRow}
            onRemoveRow={removeRow}
            onTrustAll={trustAll}
            onSkipLowConfidence={skipLowConfidence}
            foodNameById={foodNameById}
            foodUnitById={foodUnitById}
            list={
              listMode
                ? { rows: openListRows, rowById: listRowById, match: listMatch, onSetMatch: setLineMatch }
                : undefined
            }
          />
        )}

        {stage === "saving" && (
          <div className="flex items-center gap-3 py-6" aria-live="polite" aria-busy="true">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <span>
              {t("grocery.receipt.saving", {
                defaultValue: "Saving {{count}} items to pantry...",
                count: acceptedRows.length,
              })}
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            {t("grocery.receipt.cancel", "Cancel")}
          </Button>
          {stage === "review" && (
            <Button
              onClick={handleConfirm}
              disabled={acceptedRows.length === 0}
              className="gap-2"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {checkOffCount > 0
                ? t("grocery.receiptList.confirm", {
                    defaultValue: "Check off {{checked}}, update pantry",
                    checked: checkOffCount,
                  })
                : t("grocery.receipt.confirm", {
                    defaultValue: "Add {{count}} to pantry",
                    count: acceptedRows.length,
                  })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReviewScreenProps {
  merchant: string | null;
  purchasedAt: string | null;
  currency: string;
  rows: ReviewRow[];
  onUpdateRow: (uid: string, patch: Partial<ReviewRow>) => void;
  onRemoveRow: (uid: string) => void;
  onTrustAll: () => void;
  onSkipLowConfidence: () => void;
  foodNameById: ReadonlyMap<string, string>;
  foodUnitById: ReadonlyMap<string, string>;
  /** Item 16: the list on screen, and which row each line pays for. */
  list?: {
    rows: GroceryItem[];
    rowById: ReadonlyMap<string, GroceryItem>;
    match: ReadonlyMap<string, string | null>;
    onSetMatch: (uid: string, rowId: string | null) => void;
  };
}

const RECEIPT_CATEGORIES = [
  "protein",
  "carb",
  "dairy",
  "fruit",
  "vegetable",
  "snack",
  "beverage",
  "pantry",
  "frozen",
  "household",
  "other",
] as const;

function ReviewScreen({
  merchant,
  purchasedAt,
  currency,
  rows,
  onUpdateRow,
  onRemoveRow,
  onTrustAll,
  onSkipLowConfidence,
  foodNameById,
  foodUnitById,
  list,
}: ReviewScreenProps) {
  const { t } = useTranslation();
  const money = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency });
    } catch {
      return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }, [currency]);
  const renderLine = (row: ReviewRow) => (
      <li key={row.uid} className="p-2.5 flex items-start gap-2">
        <ConfidenceDot confidence={row.confidence} />
        <input
          type="checkbox"
          checked={row.accept}
          onChange={(e) =>
            onUpdateRow(row.uid, { accept: e.target.checked })
          }
          className="mt-2"
          aria-label={t("grocery.receipt.include", { defaultValue: "Include {{name}}", name: row.parsedName })}
        />
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr] gap-2 items-center">
          <Input
            value={row.parsedName}
            onChange={(e) =>
              onUpdateRow(row.uid, { parsedName: e.target.value })
            }
            aria-label={t("grocery.receipt.itemName", "Item name")}
            className="h-8"
          />
          <div className="flex gap-1">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={row.qty}
              onChange={(e) =>
                onUpdateRow(row.uid, { qty: Number(e.target.value) || 1 })
              }
              aria-label={t("grocery.receipt.quantity", "Quantity")}
              className="h-8"
            />
            <Input
              value={row.unit}
              onChange={(e) => onUpdateRow(row.uid, { unit: e.target.value })}
              placeholder={t("grocery.receipt.unitPlaceholder", "unit")}
              aria-label={t("grocery.receipt.unit", "Unit")}
              className="h-8 w-16"
            />
          </div>
          <Select
            value={row.category}
            onValueChange={(value) => onUpdateRow(row.uid, { category: value })}
          >
            <SelectTrigger className="h-8" aria-label={t("grocery.receipt.categoryLabel", "Category")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECEIPT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`grocery.receipt.category.${c}`, c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground tabular-nums text-right">
            {money.format(row.lineTotal)}
          </span>
          {list && (
            <div className="sm:col-span-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <Select
                value={list.match.get(row.uid) ?? NOT_ON_LIST}
                onValueChange={(value) => list.onSetMatch(row.uid, value === NOT_ON_LIST ? null : value)}
              >
                <SelectTrigger
                  className="h-8 w-auto min-w-40 text-xs"
                  aria-label={t("grocery.receiptList.pickRow", {
                    defaultValue: "Which list item {{name}} pays for",
                    name: row.parsedName,
                  })}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_ON_LIST}>
                    {t("grocery.receiptList.notOnListOption", { defaultValue: "Not on this list" })}
                  </SelectItem>
                  {list.rows.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {t("grocery.receiptList.checksOff", { defaultValue: "Checks off {{name}}", name: r.name })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {list.match.get(row.uid) && !(row.matchedFoodId && foodNameById.has(row.matchedFoodId)) && (
                <span>{t("grocery.receiptList.newToPantryNote", { defaultValue: "New to your pantry" })}</span>
              )}
            </div>
          )}
          {row.matchedFoodId && foodNameById.has(row.matchedFoodId) && (
            <div className="sm:col-span-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {t("grocery.receipt.topsUp", {
                  defaultValue: "Tops up {{name}} in your pantry",
                  name: foodNameById.get(row.matchedFoodId),
                })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => onUpdateRow(row.uid, { matchedFoodId: null })}
              >
                <Link2Off className="h-3 w-3" aria-hidden="true" />
                {t("grocery.receipt.addAsNew", "Add as new item")}
              </Button>
              {row.unitMismatch && (
                <p
                  className="flex w-full items-start gap-1.5 text-warning"
                  data-testid="receipt-unit-mismatch"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t("pantry.scan.receipt.unitMismatch", {
                    defaultValue:
                      "Your pantry counts {{name}} in {{pantryUnit}}; this line is {{unit}}. Fix the unit or add it as a new item before ticking it.",
                    name: foodNameById.get(row.matchedFoodId),
                    pantryUnit: foodUnitById.get(row.matchedFoodId) ?? "",
                    unit: row.unit,
                  })}
                </p>
              )}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemoveRow(row.uid)}
          aria-label={t("grocery.receipt.remove", { defaultValue: "Remove {{name}}", name: row.parsedName })}
          className="h-8 w-8"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </li>
  );

  // Item 16: three piles, so a parent sees what the confirm will do to the
  // list before it does it.
  const sections = list
    ? [
        {
          key: "matched",
          title: t("grocery.receiptList.matchedTitle", { defaultValue: "On your list" }),
          body: t("grocery.receiptList.matchedBody", {
            defaultValue: "Checked off the list and added to the pantry.",
          }),
          rows: rows.filter((r) => list.match.get(r.uid)),
        },
        {
          key: "new",
          title: t("grocery.receiptList.newTitle", { defaultValue: "New to pantry" }),
          body: t("grocery.receiptList.newBody", {
            defaultValue: "Not on this list and not in your pantry yet. Added as new foods.",
          }),
          rows: rows.filter((r) => !list.match.get(r.uid) && !r.matchedFoodId),
        },
        {
          key: "unmatched",
          title: t("grocery.receiptList.unmatchedTitle", { defaultValue: "Not on this list" }),
          body: t("grocery.receiptList.unmatchedBody", {
            defaultValue: "Matched no list item. Each tops up the pantry food shown.",
          }),
          rows: rows.filter((r) => !list.match.get(r.uid) && r.matchedFoodId),
        },
      ]
    : [];

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {merchant && <Badge variant="secondary">{merchant}</Badge>}
        {purchasedAt && (
          <span className="text-muted-foreground">{purchasedAt}</span>
        )}
        <span className="text-muted-foreground">{currency}</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onTrustAll}>
            {t("grocery.receipt.trustAll", "Trust all")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onSkipLowConfidence}>
            {t("grocery.receipt.skipLow", "Skip low-confidence")}
          </Button>
        </div>
      </div>

      {list ? (
        sections.map((section) =>
          section.rows.length === 0 ? null : (
            <section key={section.key} aria-labelledby={`receipt-section-${section.key}`} data-testid={`receipt-section-${section.key}`}>
              <h3 id={`receipt-section-${section.key}`} className="text-sm font-semibold">
                {section.title}
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">{section.body}</p>
              <ul className="divide-y rounded-md border">{section.rows.map(renderLine)}</ul>
            </section>
          ),
        )
      ) : (
        <ul className="divide-y rounded-md border">{rows.map(renderLine)}</ul>
      )}
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          <X className="inline h-4 w-4 mr-1" />
          {t("grocery.receipt.empty", "No items remaining. Cancel and try a clearer photo.")}
        </p>
      )}
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const { t } = useTranslation();
  const cls =
    confidence >= 0.8
      ? "bg-success"
      : confidence >= 0.5
        ? "bg-warning"
        : "bg-destructive";
  const label =
    confidence >= 0.8
      ? t("grocery.receipt.confidence.high", "High confidence")
      : confidence >= 0.5
        ? t("grocery.receipt.confidence.medium", "Medium confidence")
        : t("grocery.receipt.confidence.low", "Low confidence");
  return (
    <span
      role="img"
      className={`inline-block h-2.5 w-2.5 rounded-full mt-3 shrink-0 ${cls}`}
      title={`${label} (${Math.round(confidence * 100)}%)`}
      aria-label={label}
    />
  );
}
