import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, Download, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logger } from "@/lib/logger";

/**
 * US-799 AC2: the bulk import writes the canonical catalog.
 *
 * THE CSV STAYS PER SERVING. Its columns are what someone is handed by a
 * supplier or copies off a label, and the catalog stores per 100 g -- so the
 * conversion happens in catalog_upsert_from_serving (20260918000010), next to
 * parse_serving_grams, which is the thing that decides whether a serving mass
 * can be read at all. Doing the arithmetic here would be a second
 * implementation of a refusal, and the row that gets a guessed number looks
 * exactly like a row that got a right one.
 *
 * ROWS LAND UNVERIFIED. A CSV is a file someone was handed, not a check.
 * US-797 keeps unverified figures out of totals and the ladder, and an admin
 * promotes rows one at a time from NutritionManager, which is where looking at
 * a row actually happens.
 *
 * ONE ROW AT A TIME, not one insert. The RPC is per-row because it decides per
 * row whether the serving is readable, and because a hundred-row CSV with one
 * bad row should import ninety-nine.
 */
type NutritionCsvRow = {
  id?: string;
  name: string;
  category: string;
  serving_size?: string;
  package_quantity?: string;
  servings_per_container?: string;
  ingredients?: string;
  calories?: string;
  protein_g?: string;
  carbs_g?: string;
  fat_g?: string;
  allergens?: string;
};

export function NutritionImportDialog({ onImportComplete }: { onImportComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<NutritionCsvRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const downloadTemplate = () => {
    const template = `name,category,serving_size,package_quantity,servings_per_container,ingredients,calories,protein_g,carbs_g,fat_g,allergens
Chicken Nuggets,protein,5 pieces (95g),20 nuggets,4,"chicken breast, breadcrumbs, oil",270,14,18,14,wheat;soy
Pepperoni Pizza,carb,1 slice (107g),8 slices,8,"wheat crust, tomato sauce, cheese, pepperoni",285,12,32,12,wheat;dairy
Greek Yogurt,dairy,1 cup (245g),32 oz,4,"milk, cultures",100,17,6,0.4,dairy
Banana,fruit,1 medium (118g),,,banana,105,1.3,27,0.4,
Broccoli,vegetable,1 cup (91g),,,broccoli,55,3.7,11,0.6,
Almonds,snack,1 oz,16 oz,16,almonds,164,6,6,14,tree nuts`;
    // Every serving carries a weight in brackets on purpose. The template is
    // the only instruction most operators read, and a serving of "5 pieces"
    // imports as a row with a name and no nutrition -- correct, and baffling
    // if the example that taught you the format did the same thing.

    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nutrition-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("Template downloaded", { description: "Use this CSV template to import nutrition data" });
  };

  const parseCsv = (text: string): NutritionCsvRow[] => {
    const lines = text.split("\n").filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const requiredFields = ["name", "category"];
    
    const missingFields = requiredFields.filter(f => !headers.includes(f));
    if (missingFields.length > 0) {
      throw new Error(`Missing required columns: ${missingFields.join(", ")}`);
    }

    const rows: NutritionCsvRow[] = [];
    /**
     * What the CSV may say, mapped to what the catalog stores.
     *
     * default_category is lowercase and spells vegetable out; the old
     * `nutrition.category` was capitalised and accepted "Veg". Both spellings
     * stay valid in a file an operator may already have, and both land as
     * "vegetable" -- a row filed under "veg" is a row the pantry's category
     * filter cannot find.
     */
    const CATEGORY_ALIASES: Record<string, string> = {
      protein: "protein",
      carb: "carb",
      dairy: "dairy",
      fruit: "fruit",
      veg: "vegetable",
      vegetable: "vegetable",
      snack: "snack",
    };
    const validCategories = Object.keys(CATEGORY_ALIASES);
    const newErrors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim());
      if (values.length < headers.length) continue;

      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        row[header] = values[index]?.replace(/^"|"$/g, "") || "";
      });

      // Validate
      if (!row.name) {
        newErrors.push(`Row ${i + 1}: Missing name`);
        continue;
      }

      const category = row.category.toLowerCase();
      if (!validCategories.includes(category)) {
        newErrors.push(`Row ${i + 1}: Invalid category "${row.category}". Must be one of: ${validCategories.join(", ")}`);
        continue;
      }

      row.category = CATEGORY_ALIASES[category];

      rows.push(row);
    }

    setErrors(newErrors);
    return rows;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrors([]);
    setPreview([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsedRows = parseCsv(text);
        setPreview(parsedRows);
        
        if (parsedRows.length === 0) {
          toast.error("No valid data", { description: "No valid nutrition items found in CSV" });
        } else {
          toast("CSV parsed", { description: `Found ${parsedRows.length} valid nutrition items` });
        }
      } catch (error) {
        toast.error("Parse error", { description: error instanceof Error ? error.message : "Failed to parse CSV" });
        setErrors([error instanceof Error ? error.message : "Unknown error"]);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (preview.length === 0) {
      toast.error("Nothing to import", { description: "No nutrition items to import" });
      return;
    }

    setIsImporting(true);

    try {
      const failures: string[] = [];
      let imported = 0;

      for (const [index, row] of preview.entries()) {
        const num = (value?: string) => {
          if (!value) return undefined;
          const parsed = parseFloat(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        const { error } = await supabase.rpc("catalog_upsert_from_serving", {
          p_name: row.name,
          // Already mapped to the catalog's spelling by parseCsv.
          p_category: row.category,
          p_serving_size_text: row.serving_size || undefined,
          p_package_quantity_text: row.package_quantity || undefined,
          p_servings_per_container: num(row.servings_per_container),
          p_ingredients: row.ingredients || undefined,
          // Per serving. The RPC converts, and only when it can read the mass.
          p_calories: num(row.calories),
          p_protein_g: num(row.protein_g),
          p_carbs_g: num(row.carbs_g),
          p_fat_g: num(row.fat_g),
          p_allergens: row.allergens
            ? row.allergens.split(";").map((a: string) => a.trim()).filter(Boolean)
            : undefined,
          p_source: "admin",
        });

        if (error) {
          // Named, not counted. "3 rows failed" sends an operator back to a
          // hundred-line file with no idea which three.
          failures.push(`Row ${index + 2} (${row.name}): ${error.message}`);
        } else {
          imported += 1;
        }
      }

      setErrors(failures);

      if (imported === 0) {
        toast.error("Nothing imported", { description: failures[0] ?? "Every row failed." });
        return;
      }

      const unreadable = preview.filter(
        (row) => row.calories && !/\d\s*(g|kg|mg|oz|gram|ounce)/i.test(row.serving_size ?? ''),
      ).length;

      toast.success("Import complete", {
        description:
          `${imported} of ${preview.length} rows into the catalog, unverified.` +
          (unreadable > 0
            ? ` ${unreadable} had figures but no weighed serving, so they carry no nutrition.`
            : ''),
      });

      if (failures.length === 0) {
        setOpen(false);
        setPreview([]);
      }
      onImportComplete();
    } catch (error) {
      logger.error("Import error:", error);
      toast.error("Import failed", { description: error instanceof Error ? error.message : "Failed to import nutrition data" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Nutrition Data from CSV</DialogTitle>
          <DialogDescription>
            Figures are PER SERVING, and the serving needs a weight in brackets
            ("2 cookies (25g)") or the row imports with no nutrition at all.
            Rows land unverified; verify them individually to make them count.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Template Download */}
          <div className="flex gap-2">
            <Button onClick={downloadTemplate} variant="outline" className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button 
              onClick={() => fileInputRef.current?.click()} 
              className="flex-1"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload CSV
            </Button>
          </div>

          {/* Format Guide */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Required:</strong> name, category<br />
              <strong>Optional:</strong> serving_size, package_quantity, servings_per_container, ingredients, calories, protein_g, carbs_g, fat_g, allergens (semicolon-separated)<br />
              <strong>Categories:</strong> Protein, Carb, Dairy, Fruit, Veg, Snack<br />
              <strong>Package Example:</strong> package_quantity="20 nuggets", servings_per_container=4<br />
              <strong>Note:</strong> id column is ignored - UUIDs are auto-generated
            </AlertDescription>
          </Alert>

          {/* Errors */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="text-xs space-y-1">
                  {errors.map((error, i) => (
                    <div key={i}>{error}</div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Preview ({preview.length} items)</h4>
              <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Category</th>
                      <th className="text-left p-2">Calories</th>
                      <th className="text-left p-2">P/C/F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{row.name}</td>
                        <td className="p-2">{row.category}</td>
                        <td className="p-2">{row.calories || "-"}</td>
                        <td className="p-2 text-xs">
                          {row.protein_g || 0}/{row.carbs_g || 0}/{row.fat_g || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div className="p-2 text-xs text-muted-foreground text-center">
                    ... and {preview.length - 50} more
                  </div>
                )}
              </div>
              <Button 
                onClick={handleImport} 
                className="w-full mt-4"
                disabled={isImporting}
              >
                {isImporting ? "Importing..." : `Import ${preview.length} Nutrition Items`}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
