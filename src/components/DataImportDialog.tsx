import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { z } from "zod";

const foodRowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional().default("other"),
  allergens: z.string().optional().default(""),
  calories: z.string().optional().default("0"),
});

type FoodRow = z.infer<typeof foodRowSchema>;

interface ParseResult {
  valid: FoodRow[];
  errors: { row: number; message: string }[];
  total: number;
}

function parseCSV(text: string): ParseResult {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { valid: [], errors: [{ row: 0, message: "File must have a header row and at least one data row" }], total: 0 };

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const valid: FoodRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] || "";
    });

    const result = foodRowSchema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({ row: i + 1, message: result.error.errors[0]?.message || "Invalid row" });
    }
  }

  return { valid, errors, total: lines.length - 1 };
}

export function DataImportDialog() {
  const [open, setOpen] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { addFood } = useApp();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setParseResult(parseCSV(text));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parseResult?.valid.length) return;
    setImporting(true);

    try {
      for (const row of parseResult.valid) {
        await addFood({
          name: row.name,
          category: row.category || "other",
          allergens: row.allergens ? row.allergens.split(";").map((a) => a.trim()) : [],
          nutrition_info: row.calories ? { calories: Number(row.calories) } : undefined,
        } as any);
      }

      toast.success(`Successfully imported ${parseResult.valid.length} food(s)`);
      setOpen(false);
      setParseResult(null);
    } catch (error) {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setParseResult(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Foods from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file with columns: name, category, allergens, calories
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Click to select a CSV file</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
          </div>

          {parseResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <Badge variant="outline">{parseResult.total} rows</Badge>
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {parseResult.valid.length} valid
                </Badge>
                {parseResult.errors.length > 0 && (
                  <Badge variant="destructive">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {parseResult.errors.length} errors
                  </Badge>
                )}
              </div>

              {parseResult.errors.length > 0 && (
                <div className="max-h-32 overflow-auto text-sm space-y-1">
                  {parseResult.errors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-destructive">Row {err.row}: {err.message}</p>
                  ))}
                  {parseResult.errors.length > 5 && (
                    <p className="text-muted-foreground">...and {parseResult.errors.length - 5} more errors</p>
                  )}
                </div>
              )}

              {parseResult.valid.length > 0 && (
                <div className="max-h-40 overflow-auto border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Name</th>
                        <th className="p-2 text-left">Category</th>
                        <th className="p-2 text-left">Allergens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.valid.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{row.name}</td>
                          <td className="p-2">{row.category}</td>
                          <td className="p-2">{row.allergens}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={!parseResult?.valid.length || importing}>
            {importing ? "Importing..." : `Import ${parseResult?.valid.length || 0} Food(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
