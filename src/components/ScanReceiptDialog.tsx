import { useCallback, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Camera, Upload, Loader2, Check, X, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { analytics } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import type { Food, FoodCategory } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ParsedLineItem {
  rawText: string;
  parsedName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  category: string;
  confidence: number;
}

interface ParseResponse {
  merchant: string | null;
  purchasedAt: string | null;
  currency: string;
  lineItems: ParsedLineItem[];
}

interface ReviewRow extends ParsedLineItem {
  uid: string;
  accept: boolean;
  matchedFoodId: string | null;
}

const VALID_CATEGORIES: FoodCategory[] = [
  "protein",
  "carb",
  "dairy",
  "fruit",
  "vegetable",
  "snack",
];

function categoryFromString(raw: string): FoodCategory {
  const lower = raw.toLowerCase();
  if (VALID_CATEGORIES.includes(lower as FoodCategory)) return lower as FoodCategory;
  if (lower === "beverage" || lower === "frozen" || lower === "pantry") return "snack";
  return "snack";
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

function fuzzyMatchFood(name: string, foods: Food[]): Food | null {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  const exact = foods.find((f) => f.name.trim().toLowerCase() === target);
  if (exact) return exact;
  const startsWith = foods.find((f) => f.name.trim().toLowerCase().startsWith(target));
  if (startsWith) return startsWith;
  const contains = foods.find((f) => f.name.trim().toLowerCase().includes(target));
  return contains ?? null;
}

export function ScanReceiptDialog({ open, onClose }: Props) {
  const { foods, addFoods } = useApp();
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
        toast.error("Please select an image file");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image too large — max 10 MB");
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

        const seen = new Set<string>();
        const parsedRows: ReviewRow[] = data.lineItems.map((it, idx) => {
          let uid = `${it.parsedName}-${idx}`;
          while (seen.has(uid)) uid = `${uid}-x`;
          seen.add(uid);
          const matched = fuzzyMatchFood(it.parsedName, foods);
          return {
            ...it,
            uid,
            accept: it.confidence >= 0.5,
            matchedFoodId: matched?.id ?? null,
          };
        });

        const avgConfidence =
          parsedRows.length === 0
            ? 0
            : parsedRows.reduce((acc, r) => acc + r.confidence, 0) /
              parsedRows.length;

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
            "Couldn't read this receipt clearly — try better light or use bulk paste",
          );
          setError("Low confidence parse. Try a clearer photo.");
          setStage("upload");
          return;
        }

        setMerchant(data.merchant);
        setPurchasedAt(data.purchasedAt);
        setCurrency(data.currency);
        setRows(parsedRows);
        setStage("review");
      } catch (err) {
        logger.error("receipt scan failed", err);
        toast.error("Receipt scan failed. Try again or use bulk add.");
        setError(err instanceof Error ? err.message : "Unknown error");
        setStage("upload");
      }
    },
    [foods],
  );

  const updateRow = useCallback(
    (uid: string, patch: Partial<ReviewRow>) => {
      setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
    },
    [],
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
      toast.error("No items selected");
      return;
    }
    setStage("saving");
    try {
      const newFoods: Omit<Food, "id">[] = acceptedRows.map((r) => ({
        name: r.parsedName,
        category: categoryFromString(r.category),
        is_safe: true,
        is_try_bite: false,
        quantity: r.qty,
        unit: r.unit || undefined,
      }));
      const ok = await addFoods(newFoods);
      if (!ok) throw new Error("addFoods returned false");

      analytics.trackEvent("receipt_items_accepted", {
        accepted_count: acceptedRows.length,
        edited_count: 0,
        dropped_count: droppedCount,
        merchant: merchant ?? "unknown",
      });
      analytics.trackEvent("receipt_first_scan_completed", {
        item_count: acceptedRows.length,
      });

      toast.success(`Added ${acceptedRows.length} items to pantry`);
      handleClose();
    } catch (err) {
      logger.error("receipt save failed", err);
      toast.error("Couldn't save pantry items. Try again.");
      setStage("review");
    }
  }, [acceptedRows, addFoods, droppedCount, handleClose, merchant]);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : handleClose())}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" aria-hidden="true" />
            Scan a receipt
          </DialogTitle>
          <DialogDescription>
            Snap a photo of your grocery receipt and we'll add the items to your pantry.
          </DialogDescription>
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
                Take photo
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
                Upload image
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Tip: lay the receipt flat, fill the frame, even light. We'll handle the rest.
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
              <span>Reading your receipt…</span>
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
          />
        )}

        {stage === "saving" && (
          <div className="flex items-center gap-3 py-6" aria-live="polite" aria-busy="true">
            <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
            <span>Saving {acceptedRows.length} items to pantry…</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          {stage === "review" && (
            <Button
              onClick={handleConfirm}
              disabled={acceptedRows.length === 0}
              className="gap-2"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Add {acceptedRows.length} to pantry
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
}

function ReviewScreen({
  merchant,
  purchasedAt,
  currency,
  rows,
  onUpdateRow,
  onRemoveRow,
  onTrustAll,
  onSkipLowConfidence,
}: ReviewScreenProps) {
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
            Trust all
          </Button>
          <Button size="sm" variant="ghost" onClick={onSkipLowConfidence}>
            Skip low-confidence
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
              aria-label={`Include ${row.parsedName}`}
            />
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr] gap-2 items-center">
              <Input
                value={row.parsedName}
                onChange={(e) =>
                  onUpdateRow(row.uid, { parsedName: e.target.value })
                }
                aria-label="Item name"
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
                  aria-label="Quantity"
                  className="h-8"
                />
                <Input
                  value={row.unit}
                  onChange={(e) => onUpdateRow(row.uid, { unit: e.target.value })}
                  placeholder="unit"
                  aria-label="Unit"
                  className="h-8 w-16"
                />
              </div>
              <Select
                value={row.category}
                onValueChange={(value) => onUpdateRow(row.uid, { category: value })}
              >
                <SelectTrigger className="h-8" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
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
                  ].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground tabular-nums text-right">
                ${row.lineTotal.toFixed(2)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemoveRow(row.uid)}
              aria-label={`Remove ${row.parsedName}`}
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
          No items remaining. Cancel and try a clearer photo.
        </p>
      )}
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const cls =
    confidence >= 0.8
      ? "bg-emerald-500"
      : confidence >= 0.5
        ? "bg-amber-500"
        : "bg-red-500";
  const label =
    confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low";
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full mt-3 shrink-0 ${cls}`}
      title={`${label} confidence (${Math.round(confidence * 100)}%)`}
      aria-label={`${label} confidence`}
    />
  );
}
