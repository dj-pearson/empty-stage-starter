import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, AlertCircle, CheckCircle, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useFoods, useRecipes } from "@/contexts/AppContext";
import type { FoodCategory } from "@/types";
import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from "@/lib/foodSafetyDefault";
import {
  FOOD_CATEGORIES,
  checkCsvFile,
  normalizeFoodCategory,
  parseCsvWithHeaders,
} from "@/lib/csv";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import "@/i18n/appLocale";

type ImportType = "foods" | "recipes";

const CATEGORY_ENUM = z.enum(FOOD_CATEGORIES as [FoodCategory, ...FoodCategory[]]);

// normalizeFoodCategory lower-cases, trims and maps plurals ("Fruits"), and
// returns undefined for blank or unknown text, so .default("snack") actually
// runs. Before, a blank or "Fruits" cell failed the enum and the row was
// rejected, and the snack fallback further down never ran.
const foodRowSchema = z.object({
  name: z.string().trim().min(1),
  category: z.preprocess(normalizeFoodCategory, CATEGORY_ENUM.default("snack")),
  allergens: z.string().optional(),
  calories: z.string().optional(),
});

const recipeRowSchema = z.object({
  name: z.string().trim().min(1),
  ingredients: z.string().trim().min(1),
  instructions: z.string().optional(),
  servings: z.string().optional(),
});

interface ParsedRow {
  rowNumber: number;
  data: Record<string, string>;
  category?: FoodCategory;
  /** Field names that failed validation. */
  errorFields: string[];
  valid: boolean;
  duplicate: boolean;
}

interface ImportReport {
  imported: number;
  total: number;
  failedRows: number[];
}

const PREVIEW_ROWS = 20;

const normalizeName = (value: string) => value.trim().toLocaleLowerCase();

/**
 * Settings > Your data > Import (settings pass B). Reads a spreadsheet's CSV
 * with a real RFC 4180 parser (src/lib/csv.ts), flags rows that duplicate a
 * food already in the household, and reports what landed by row number.
 */
export function DataImport() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { foods, addFoods } = useFoods();
  const { recipes, addRecipe } = useRecipes();
  const [importType, setImportType] = useState<ImportType>("foods");
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const existingNames = useMemo(() => {
    const source = importType === "foods" ? foods : recipes;
    return new Set(source.map((item) => normalizeName(item.name ?? "")));
  }, [importType, foods, recipes]);

  const clear = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const fieldLabel = (field: string) => {
    switch (field) {
      case "name":
        return t("settings.account.import.fields.name", { defaultValue: "name" });
      case "ingredients":
        return t("settings.account.import.fields.ingredients", { defaultValue: "ingredients" });
      default:
        return field;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setReport(null);
    setFileError(null);
    if (!file) return;

    const problem = checkCsvFile(file);
    if (problem) {
      setFileError(
        problem === "too-large"
          ? t("settings.account.import.tooLarge", {
              defaultValue: "That file is over 2 MB. Split it into smaller files and import each one.",
            })
          : t("settings.account.import.notCsv", {
              defaultValue: "Choose a .csv file. In Excel or Numbers, use Save As or Export and pick CSV.",
            })
      );
      clear();
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setFileError(
        t("settings.account.import.readFailed", { defaultValue: "That file couldn't be read." })
      );
    };
    reader.onload = (event) => {
      const text = typeof event.target?.result === "string" ? event.target.result : "";
      const { rows } = parseCsvWithHeaders(text);
      if (rows.length === 0) {
        setFileError(
          t("settings.account.import.empty", {
            defaultValue: "No rows found. The first line should be the column names.",
          })
        );
        setPreview(null);
        return;
      }

      const seen = new Set<string>();
      const validated = rows.map((row): ParsedRow => {
        const key = normalizeName(row.values.name ?? "");
        const duplicate = key !== "" && (existingNames.has(key) || seen.has(key));
        if (key) seen.add(key);
        if (importType === "foods") {
          const result = foodRowSchema.safeParse(row.values);
          return {
            rowNumber: row.rowNumber,
            data: row.values,
            category: result.success ? result.data.category : undefined,
            errorFields: result.success ? [] : result.error.issues.map((i) => String(i.path[0] ?? "")),
            valid: result.success,
            duplicate,
          };
        }
        const result = recipeRowSchema.safeParse(row.values);
        return {
          rowNumber: row.rowNumber,
          data: row.values,
          errorFields: result.success ? [] : result.error.issues.map((i) => String(i.path[0] ?? "")),
          valid: result.success,
          duplicate,
        };
      });

      setPreview(validated);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview) return;
    const validRows = preview.filter((r) => r.valid);
    const invalidRows = preview.filter((r) => !r.valid).map((r) => r.rowNumber);
    if (validRows.length === 0) return;

    setImporting(true);
    try {
      if (importType === "foods") {
        const newFoods = validRows.map((row) => ({
          name: row.data.name.trim(),
          category: row.category ?? "snack",
          // US-803: the CSV has no is_safe column, so defaulting to
          // true asserts something the file never said.
          is_safe: ACQUIRED_FOOD_IS_SAFE,
          is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
          allergens: row.data.allergens
            ? row.data.allergens
                .split(";")
                .map((a) => a.trim())
                .filter(Boolean)
            : undefined,
        }));
        const added = await addFoods(newFoods);
        if (!added) {
          // Plan limit blocked the import; the upgrade modal handles messaging.
          return;
        }
        setReport({ imported: validRows.length, total: preview.length, failedRows: invalidRows });
      } else {
        const failed = [...invalidRows];
        let imported = 0;
        for (const row of validRows) {
          try {
            await addRecipe({
              name: row.data.name.trim(),
              food_ids: [],
              instructions: row.data.instructions || "",
              servings: row.data.servings || "4",
              additionalIngredients: row.data.ingredients,
            });
            imported += 1;
          } catch {
            failed.push(row.rowNumber);
          }
        }
        setReport({ imported, total: preview.length, failedRows: failed.sort((a, b) => a - b) });
      }
      clear();
    } catch {
      toast.error(t("settings.account.import.failed", { defaultValue: "Import failed. Nothing was added." }));
    } finally {
      setImporting(false);
    }
  };

  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const errorCount = preview?.filter((r) => !r.valid).length ?? 0;
  const duplicateCount = preview?.filter((r) => r.duplicate).length ?? 0;
  const typeLabel =
    importType === "foods"
      ? t("settings.account.import.foods", { defaultValue: "Foods" })
      : t("settings.account.import.recipes", { defaultValue: "Recipes" });

  const reportText = report
    ? report.failedRows.length === 0
      ? t("settings.account.import.reportAll", {
          defaultValue: "Imported {{imported}} of {{total}}.",
          imported: report.imported,
          total: report.total,
        })
      : t("settings.account.import.report", {
          defaultValue: "Imported {{imported}} of {{total}}; {{failed}} failed (rows {{rows}}).",
          imported: report.imported,
          total: report.total,
          failed: report.failedRows.length,
          rows: report.failedRows.join(", "),
        })
    : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t("settings.account.import.title", { defaultValue: "Import from a spreadsheet" })}
        </CardTitle>
        <CardDescription>
          {t("settings.account.import.description", {
            defaultValue: "Add foods or recipes from a CSV file. You'll see every row before anything is added.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs
          value={importType}
          onValueChange={(v) => {
            if (v === "foods" || v === "recipes") setImportType(v);
            setReport(null);
            setFileError(null);
            clear();
          }}
        >
          <TabsList>
            <TabsTrigger value="foods">{t("settings.account.import.foods", { defaultValue: "Foods" })}</TabsTrigger>
            <TabsTrigger value="recipes">
              {t("settings.account.import.recipes", { defaultValue: "Recipes" })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="foods" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("settings.account.import.foodColumns", {
                defaultValue:
                  "Columns: name, category (protein, carb, dairy, fruit, vegetable or snack; blank means snack), allergens (separated by ;), calories.",
              })}
            </p>
          </TabsContent>

          <TabsContent value="recipes" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("settings.account.import.recipeColumns", {
                defaultValue: "Columns: name, ingredients, instructions, servings.",
              })}
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-3">
          <Button
            id="data-import"
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
            {t("settings.account.import.choose", { defaultValue: "Choose CSV file" })}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleFileSelect}
          />
        </div>

        <p aria-live="polite" className="text-sm">
          {fileError ? (
            <span className="text-destructive">{fileError}</span>
          ) : (
            reportText
          )}
        </p>

        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle className="h-3 w-3" aria-hidden="true" />
                {t("settings.account.import.validCount", {
                  defaultValue: "{{n}} ready",
                  n: validCount,
                })}
              </Badge>
              {errorCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                  {t("settings.account.import.errorCount", {
                    defaultValue: "{{n}} with problems",
                    n: errorCount,
                  })}
                </Badge>
              )}
              {duplicateCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  {t("settings.account.import.duplicateCount", {
                    defaultValue: "{{n}} already in your list",
                    n: duplicateCount,
                  })}
                </Badge>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {t("settings.account.import.caption", {
                    defaultValue: "Preview of the rows in your file",
                  })}
                </caption>
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th scope="col" className="p-2 text-left">
                      {t("settings.account.import.colRow", { defaultValue: "Row" })}
                    </th>
                    <th scope="col" className="p-2 text-left">
                      {t("settings.account.import.colStatus", { defaultValue: "Status" })}
                    </th>
                    <th scope="col" className="p-2 text-left">
                      {t("settings.account.import.colName", { defaultValue: "Name" })}
                    </th>
                    <th scope="col" className="p-2 text-left">
                      {t("settings.account.import.colDetails", { defaultValue: "Details" })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, PREVIEW_ROWS).map((row) => (
                    <tr key={row.rowNumber} className={row.valid ? "" : "bg-destructive/5"}>
                      <td className="p-2 tabular-nums text-muted-foreground">{row.rowNumber}</td>
                      <td className="p-2">
                        {row.valid ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-success" aria-hidden="true" />
                            <span className="sr-only">
                              {t("settings.account.import.statusReady", { defaultValue: "Ready" })}
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                            <span className="sr-only">
                              {t("settings.account.import.statusProblem", { defaultValue: "Problem" })}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="p-2">{row.data.name || "-"}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {row.valid
                          ? importType === "foods"
                            ? row.category
                            : t("settings.account.import.servings", {
                                defaultValue: "{{servings}} servings",
                                servings: row.data.servings || "4",
                              })
                          : t("settings.account.import.missing", {
                              defaultValue: "Missing {{fields}}",
                              fields: row.errorFields.map(fieldLabel).join(", "),
                            })}
                        {row.duplicate && (
                          <span className="ml-1">
                            {t("settings.account.import.duplicate", {
                              defaultValue: "(already in your list)",
                            })}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > PREVIEW_ROWS && (
                <p className="p-2 text-center text-xs text-muted-foreground">
                  {t("settings.account.import.showing", {
                    defaultValue: "Showing {{shown}} of {{total}} rows",
                    shown: PREVIEW_ROWS,
                    total: preview.length,
                  })}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void handleImport()}
                disabled={importing || validCount === 0}
                aria-busy={importing || undefined}
              >
                {importing && (
                  <Loader2
                    className={reducedMotion ? "h-4 w-4 mr-2" : "h-4 w-4 mr-2 animate-spin"}
                    aria-hidden="true"
                  />
                )}
                {t("settings.account.import.importButton", {
                  defaultValue: "Import {{n}} {{type}}",
                  n: validCount,
                  type: typeLabel.toLocaleLowerCase(),
                })}
              </Button>
              <Button type="button" variant="outline" onClick={clear} disabled={importing}>
                {t("settings.account.import.cancel", { defaultValue: "Cancel" })}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
