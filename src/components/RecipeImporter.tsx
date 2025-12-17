import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, Loader2 } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { toast } from "sonner";

export function RecipeImporter({ onImported }: any) {
  const [url, setUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    if (!url) {
      toast.error("Please enter a recipe URL");
      return;
    }

    try {
      setIsImporting(true);

      const { data, error } = await invokeEdgeFunction<{ recipe: any }>('import-recipe', {
        body: { url },
      });

      if (error) throw error;

      toast.success("Recipe imported!");
      setUrl("");
      onImported?.(data?.recipe);
    } catch (error) {
      toast.error('Failed to import recipe');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link className="h-5 w-5" />
          Import Recipe from URL
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            placeholder="https://example.com/recipe"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleImport()}
            disabled={isImporting}
          />
          <Button onClick={handleImport} disabled={isImporting || !url}>
            {isImporting ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
