import { useState, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
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
import { FoodCategory } from "@/types";

export function ImportCsvDialog() {
  const { addFood, foods } = useApp();
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const downloadTemplate = () => {
    const template = `name,category,is_safe,is_try_bite,allergens,aisle
Chicken Nuggets,protein,true,false,"",Frozen
Mac & Cheese,carb,true,false,"",Pasta
Apple Slices,fruit,true,false,"",Produce
Broccoli,vegetable,false,true,"",Produce
Hummus,protein,false,true,sesame,Deli`;

    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "food-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded!");
  };

  const parseCsv = (text: string) => {
    const lines = text.split("\n").filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const requiredFields = ["name", "category", "is_safe", "is_try_bite"];
    
    const missingFields = requiredFields.filter(f => !headers.includes(f));
    if (missingFields.length > 0) {
      throw new Error(`Missing required columns: ${missingFields.join(", ")}`);
    }

    const foods = [];
    const validCategories: FoodCategory[] = ["protein", "carb", "dairy", "fruit", "vegetable", "snack"];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim());
      if (values.length < headers.length) continue;

      const food: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        food[header] = values[index]?.replace(/^"|"$/g, "") || "";
      });

      // Validate
      if (!food.name) {
        errors.push(`Row ${i + 1}: Missing name`);
        continue;
      }

      if (!validCategories.includes(food.category)) {
        errors.push(`Row ${i + 1}: Invalid category "${food.category}". Must be one of: ${validCategories.join(", ")}`);
        continue;
      }

      food.is_safe = food.is_safe.toLowerCase() === "true";
      food.is_try_bite = food.is_try_bite.toLowerCase() === "true";
      
      if (food.allergens) {
        food.allergens = food.allergens.split(";").map((a: string) => a.trim()).filter(Boolean);
      }

      foods.push(food);
    }

    return foods;
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
        const parsedFoods = parseCsv(text);
        setPreview(parsedFoods);
        
        if (parsedFoods.length === 0) {
          toast.error("No valid foods found in CSV");
        } else {
          toast.success(`Parsed ${parsedFoods.length} foods`);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to parse CSV");
        setErrors([error instanceof Error ? error.message : "Unknown error"]);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (preview.length === 0) {
      toast.error("No foods to import");
      return;
    }

    let imported = 0;
    let skipped = 0;

    preview.forEach(food => {
      // Check if food already exists
      const exists = foods.find(f => f.name.toLowerCase() === food.name.toLowerCase());
      if (exists) {
        skipped++;
      } else {
        addFood(food);
        imported++;
      }
    });

    toast.success(`Imported ${imported} foods${skipped > 0 ? `, skipped ${skipped} duplicates` : ""}`);
    setOpen(false);
    setPreview([]);
    setErrors([]);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Foods from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import foods. Download the template to see the required format.
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
                <strong>Required columns:</strong> name, category, is_safe, is_try_bite<br />
                <strong>Optional columns:</strong> allergens (semicolon-separated), aisle<br />
                <strong>Valid categories:</strong> protein, carb, dairy, fruit, vegetable, snack
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
                <h4 className="font-semibold mb-2">Preview ({preview.length} foods)</h4>
                <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Category</th>
                        <th className="text-left p-2">Safe</th>
                        <th className="text-left p-2">Try Bite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 50).map((food, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{food.name}</td>
                          <td className="p-2">{food.category}</td>
                          <td className="p-2">{food.is_safe ? "✓" : ""}</td>
                          <td className="p-2">{food.is_try_bite ? "✓" : ""}</td>
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
                <Button onClick={handleImport} className="w-full mt-4">
                  Import {preview.length} Foods
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
