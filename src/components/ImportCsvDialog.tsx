import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFoods } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, Download, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Food } from "@/types";
import { parseFoodsCsv, FOOD_CSV_CATEGORIES } from "@/lib/parseFoodsCsv";
import "@/i18n/appLocale";

interface ImportCsvDialogProps {
  /**
   * Controlled mode. When `open` is passed the dialog renders no trigger of
   * its own and the caller opens it (from a menu item, say). Without it the
   * dialog keeps its own "Import CSV" button, as before.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const PREVIEW_LIMIT = 50;

export function ImportCsvDialog({ open: openProp, onOpenChange }: ImportCsvDialogProps = {}) {
  const { t } = useTranslation();
  const { addFoods, foods } = useFoods();
  const controlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = controlled ? openProp : openState;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Omit<Food, "id">[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const setOpen = (next: boolean) => {
    if (!controlled) setOpenState(next);
    onOpenChange?.(next);
    if (!next) {
      setPreview([]);
      setErrors([]);
    }
  };

  const downloadTemplate = () => {
    // Blank is_safe / is_try_bite is the honest default (US-803): the parent
    // fills them in for the foods they know about.
    const template = `name,category,is_safe,is_try_bite,allergens,aisle,quantity,unit
Chicken Nuggets,protein,,,"",Frozen,1,packages
"Mac, Cheese",carb,,,milk;wheat,Pasta,2,boxes
Apple Slices,fruit,,,"",Produce,6,count
Broccoli,vegetable,,,"",Produce,1,lbs
Hummus,protein,,,sesame,Deli,1,tub`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "food-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("pantry.csv.templateDownloaded", "Template downloaded"));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again (after fixing it) fires onChange.
    event.target.value = "";
    if (!file) return;

    setErrors([]);
    setPreview([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = typeof e.target?.result === "string" ? e.target.result : "";
      const result = parseFoodsCsv(text);
      setPreview(result.foods);
      setErrors(result.errors);
      if (result.foods.length === 0) {
        toast.error(t("pantry.csv.noneValid", "No foods in this file could be imported"));
      }
    };
    reader.onerror = () => {
      setErrors([t("pantry.csv.readFailed", "Couldn't read that file.")]);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (preview.length === 0) {
      toast.error(t("pantry.csv.nothingToImport", "No foods to import"));
      return;
    }

    const toImport = preview.filter(
      (food) => !foods.some((f) => f.name.trim().toLowerCase() === food.name.trim().toLowerCase())
    );
    const skipped = preview.length - toImport.length;

    if (toImport.length === 0) {
      toast.info(
        t("pantry.csv.allDuplicates", {
          count: skipped,
          defaultValue: "All {{count}} are already in your pantry",
        })
      );
      return;
    }

    setImporting(true);
    try {
      const added = await addFoods(toImport);
      if (added) {
        toast.success(
          skipped > 0
            ? t("pantry.csv.importedSkipped", {
                count: toImport.length,
                skipped,
                defaultValue: "Imported {{count}} foods, skipped {{skipped}} already in your pantry",
              })
            : t("pantry.csv.imported", { count: toImport.length, defaultValue: "Imported {{count}} foods" })
        );
        setOpen(false);
      }
      // If blocked by plan limit, the upgrade modal handles messaging.
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            {t("pantry.csv.trigger", "Import CSV")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("pantry.csv.title", "Import foods from a CSV")}</DialogTitle>
          <DialogDescription>
            {t(
              "pantry.csv.description",
              "Upload a spreadsheet saved as CSV. Download the template to see the columns."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={downloadTemplate} variant="outline" className="min-h-11 flex-1">
              <Download className="h-4 w-4 mr-2" />
              {t("pantry.csv.downloadTemplate", "Download template")}
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="hidden"
              data-testid="csv-file-input"
            />
            <Button onClick={() => fileInputRef.current?.click()} className="min-h-11 flex-1">
              <Upload className="h-4 w-4 mr-2" />
              {t("pantry.csv.upload", "Choose CSV file")}
            </Button>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs space-y-1">
              <p>{t("pantry.csv.requiredColumns", "Required column: name")}</p>
              <p>
                {t(
                  "pantry.csv.optionalColumns",
                  "Optional: category, is_safe, is_try_bite, allergens (separated by ;), aisle, quantity, unit. Other columns are ignored."
                )}
              </p>
              <p>
                {t("pantry.csv.validCategories", {
                  defaultValue: "Categories: {{list}}",
                  list: FOOD_CSV_CATEGORIES.join(", "),
                })}
              </p>
              <p>
                {t(
                  "pantry.csv.safetyNote",
                  "Leave is_safe blank unless your child already eats the food; you can mark foods safe later."
                )}
              </p>
            </AlertDescription>
          </Alert>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="text-sm font-medium">
                  {t("pantry.csv.errorsTitle", {
                    count: errors.length,
                    defaultValue: "{{count}} rows need a look",
                  })}
                </p>
                <ul className="mt-1 text-xs space-y-1" data-testid="csv-errors">
                  {errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {preview.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">
                {t("pantry.csv.previewTitle", { count: preview.length, defaultValue: "Preview ({{count}} foods)" })}
              </h4>
              <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">{t("pantry.csv.colName", "Name")}</th>
                      <th className="text-left p-2">{t("pantry.csv.colCategory", "Category")}</th>
                      <th className="text-left p-2">{t("pantry.csv.colQuantity", "Qty")}</th>
                      <th className="text-left p-2">{t("pantry.csv.colSafe", "Safe")}</th>
                      <th className="text-left p-2">{t("pantry.csv.colTryBite", "Try bite")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, PREVIEW_LIMIT).map((food, i) => (
                      <tr key={`${food.name}-${i}`} className="border-t">
                        <td className="p-2">{food.name}</td>
                        <td className="p-2">{food.category}</td>
                        <td className="p-2 tabular-nums">
                          {food.quantity !== undefined ? `${food.quantity}${food.unit ? ` ${food.unit}` : ""}` : ""}
                        </td>
                        <td className="p-2">
                          {food.is_safe && (
                            <Check className="h-4 w-4" aria-label={t("pantry.csv.yes", "Yes")} />
                          )}
                        </td>
                        <td className="p-2">
                          {food.is_try_bite && (
                            <Check className="h-4 w-4" aria-label={t("pantry.csv.yes", "Yes")} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > PREVIEW_LIMIT && (
                  <div className="p-2 text-xs text-muted-foreground text-center">
                    {t("pantry.csv.andMore", {
                      count: preview.length - PREVIEW_LIMIT,
                      defaultValue: "and {{count}} more",
                    })}
                  </div>
                )}
              </div>
              <Button onClick={handleImport} disabled={importing} className="w-full mt-4 min-h-11">
                {t("pantry.csv.importButton", { count: preview.length, defaultValue: "Import {{count}} foods" })}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
