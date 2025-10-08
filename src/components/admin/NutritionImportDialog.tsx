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
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
Chicken Nuggets,Protein,5 pieces,20 nuggets,4,"chicken breast, breadcrumbs, oil",270,14,18,14,wheat;soy
Pepperoni Pizza,Carb,1 slice,8 slices,8,"wheat crust, tomato sauce, cheese, pepperoni",285,12,32,12,wheat;dairy
Greek Yogurt,Dairy,1 cup,32 oz,4,"milk, cultures",100,17,6,0.4,dairy
Banana,Fruit,1 medium,,,banana,105,1.3,27,0.4,
Broccoli,Veg,1 cup,,,broccoli,55,3.7,11,0.6,
Almonds,Snack,1 oz,16 oz,16,almonds,164,6,6,14,tree nuts`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nutrition-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Template downloaded",
      description: "Use this CSV template to import nutrition data",
    });
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
    const validCategories = ["protein", "carb", "dairy", "fruit", "veg", "snack"];
    const newErrors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim());
      if (values.length < headers.length) continue;

      const row: any = {};
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

      // Capitalize category properly
      row.category = category.charAt(0).toUpperCase() + category.slice(1);
      if (category === "veg") row.category = "Veg";

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
          toast({
            title: "No valid data",
            description: "No valid nutrition items found in CSV",
            variant: "destructive",
          });
        } else {
          toast({
            title: "CSV parsed",
            description: `Found ${parsedRows.length} valid nutrition items`,
          });
        }
      } catch (error) {
        toast({
          title: "Parse error",
          description: error instanceof Error ? error.message : "Failed to parse CSV",
          variant: "destructive",
        });
        setErrors([error instanceof Error ? error.message : "Unknown error"]);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (preview.length === 0) {
      toast({
        title: "Nothing to import",
        description: "No nutrition items to import",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const nutritionData = preview.map(row => ({
        // id is auto-generated by database, don't include it
        name: row.name,
        category: row.category,
        serving_size: row.serving_size || null,
        package_quantity: row.package_quantity || null,
        servings_per_container: row.servings_per_container ? parseFloat(row.servings_per_container) : null,
        ingredients: row.ingredients || null,
        calories: row.calories ? parseInt(row.calories) : null,
        protein_g: row.protein_g ? parseFloat(row.protein_g) : null,
        carbs_g: row.carbs_g ? parseFloat(row.carbs_g) : null,
        fat_g: row.fat_g ? parseFloat(row.fat_g) : null,
        allergens: row.allergens 
          ? row.allergens.split(";").map((a: string) => a.trim()).filter(Boolean)
          : null,
        created_by: user?.id,
      }));

      const { error } = await supabase
        .from("nutrition")
        .insert(nutritionData);

      if (error) {
        throw error;
      }

      toast({
        title: "Import successful",
        description: `Imported ${nutritionData.length} nutrition items`,
      });

      setOpen(false);
      setPreview([]);
      setErrors([]);
      onImportComplete();
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import nutrition data",
        variant: "destructive",
      });
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
            Upload a CSV file to bulk import nutrition information. Download the template to see the required format.
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
