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
import { Camera, Upload, Loader2, Check, X, Trash2, Receipt, Link2Off, AlertTriangle } from "lucide-react";
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
import "@/i18n/appLocale";

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

export function ScanReceiptDialog({ open, onClose, onTopUp }: Props) {
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
  const startRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    setStage("upload");
    setMerchant(null);
    setPurchasedAt(null);
    setCurrency("USD");
    setRows([]);
    setError(null);
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

        const parsedRows: ReviewRow[] = parseResponseToReviewRows(data, foods);
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
    [foods, checkFeatureLimit, incrementUsage, t],
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
  }, []);

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
  }, [acceptedRows, addFoods, updateFood, onTopUp, foods, droppedCount, handleClose, merchant, t]);

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
              {t("grocery.receipt.confirm", {
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
}: ReviewScreenProps) {
  const { t } = useTranslation();
  const money = useMemo(() => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency });
    } catch {
      return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }, [currency]);
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

      <ul className="divide-y rounded-md border">
        {rows.map((row) => (
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
        ))}
      </ul>
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
