import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useApp } from "@/contexts/AppContext";
import type { FoodCategory } from "@/types";

const VALID_CATEGORIES: FoodCategory[] = ["protein", "carb", "dairy", "fruit", "vegetable", "snack"];

const foodRowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum(["protein", "carb", "dairy", "fruit", "vegetable", "snack"]).default("snack"),
  allergens: z.string().optional(),
  calories: z.string().optional(),
});

const recipeRowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  ingredients: z.string().min(1, "Ingredients are required"),
  instructions: z.string().optional(),
  servings: z.string().optional(),
});

interface ParsedRow {
  data: Record<string, string>;
  errors: string[];
  valid: boolean;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || "";
    });
    return row;
  });
}

export function DataImport() {
  const { addFood, addRecipe } = useApp();
  const [importType, setImportType] = useState<"foods" | "recipes">("foods");
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);

      const validated = rows.map((row) => {
        const schema = importType === "foods" ? foodRowSchema : recipeRowSchema;
        const result = schema.safeParse(row);
        return {
          data: row,
          errors: result.success ? [] : result.error.errors.map((e) => `${e.path}: ${e.message}`),
          valid: result.success,
        };
      });

      setPreview(validated);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview) return;
    const validRows = preview.filter((r) => r.valid);
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setImporting(true);
    try {
      if (importType === "foods") {
        for (const row of validRows) {
          const category = VALID_CATEGORIES.includes(row.data.category as FoodCategory)
            ? (row.data.category as FoodCategory)
            : "snack";
          await addFood({
            name: row.data.name,
            category,
            is_safe: true,
            is_try_bite: false,
            allergens: row.data.allergens ? row.data.allergens.split(";").map((a) => a.trim()) : undefined,
          });
        }
      } else {
        for (const row of validRows) {
          await addRecipe({
            name: row.data.name,
            food_ids: [],
            instructions: row.data.instructions || "",
            servings: row.data.servings || "4",
            additionalIngredients: row.data.ingredients,
          });
        }
      }
      toast.success(`Imported ${validRows.length} ${importType}`);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const errorCount = preview?.filter((r) => !r.valid).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Data</CardTitle>
        <CardDescription>
          Import foods or recipes from a CSV file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={importType} onValueChange={(v) => { setImportType(v as "foods" | "recipes"); setPreview(null); }}>
          <TabsList>
            <TabsTrigger value="foods">Foods</TabsTrigger>
            <TabsTrigger value="recipes">Recipes</TabsTrigger>
          </TabsList>

          <TabsContent value="foods" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              CSV columns: <code>name</code>, <code>category</code> (protein/carb/dairy/fruit/vegetable/snack), <code>allergens</code> (semicolon-separated), <code>calories</code>
            </p>
          </TabsContent>

          <TabsContent value="recipes" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              CSV columns: <code>name</code>, <code>ingredients</code>, <code>instructions</code>, <code>servings</code>
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-2" />
            Select CSV File
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {preview && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                {validCount} valid
              </Badge>
              {errorCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errorCount} errors
                </Badge>
              )}
            </div>

            <div className="max-h-48 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((row, i) => (
                    <tr key={i} className={row.valid ? "" : "bg-destructive/5"}>
                      <td className="p-2">
                        {row.valid ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        )}
                      </td>
                      <td className="p-2">{row.data.name || "—"}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {row.valid
                          ? importType === "foods" ? row.data.category : `${row.data.servings || "4"} servings`
                          : row.errors.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 20 && (
                <p className="text-xs text-muted-foreground p-2 text-center">
                  Showing 20 of {preview.length} rows
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={importing || validCount === 0}>
                {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import {validCount} {importType}
              </Button>
              <Button variant="outline" onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
