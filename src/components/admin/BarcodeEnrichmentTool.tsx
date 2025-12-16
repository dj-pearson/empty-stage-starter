import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { toast } from "sonner";
import { Loader2, Barcode, Package } from "lucide-react";
import { logger } from "@/lib/logger";

export const BarcodeEnrichmentTool = () => {
  const [isProcessingPantry, setIsProcessingPantry] = useState(false);
  const [isProcessingNutrition, setIsProcessingNutrition] = useState(false);

  const enrichBarcodes = async (table: 'foods' | 'nutrition') => {
    const setLoading = table === 'foods' ? setIsProcessingPantry : setIsProcessingNutrition;
    const tableName = table === 'foods' ? 'Pantry' : 'Nutrition Database';
    
    setLoading(true);
    
    try {
      const { data, error } = await invokeEdgeFunction('enrich-barcodes', {
        body: { table }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(
          `${tableName} Enrichment Complete`,
          { description: data.message }
        );
      } else {
        toast.error('Enrichment failed', { description: data.error });
      }
    } catch (error) {
      logger.error('Error enriching barcodes:', error);
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to enrich barcodes'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Barcode className="h-5 w-5" />
          Barcode Enrichment Tool
        </CardTitle>
        <CardDescription>
          Automatically fetch and store barcode information for existing items by searching external APIs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => enrichBarcodes('foods')}
            disabled={isProcessingPantry}
            className="flex-1"
            variant="outline"
          >
            {isProcessingPantry ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Pantry...
              </>
            ) : (
              <>
                <Package className="mr-2 h-4 w-4" />
                Enrich Pantry Foods
              </>
            )}
          </Button>

          <Button
            onClick={() => enrichBarcodes('nutrition')}
            disabled={isProcessingNutrition}
            className="flex-1"
            variant="outline"
          >
            {isProcessingNutrition ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Nutrition DB...
              </>
            ) : (
              <>
                <Barcode className="mr-2 h-4 w-4" />
                Enrich Nutrition Database
              </>
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p>• Searches Open Food Facts API by product name</p>
          <p>• Processes up to 100 items per batch</p>
          <p>• Only updates items that don't have barcodes</p>
          <p>• Adds delay between requests to avoid rate limiting</p>
        </div>
      </CardContent>
    </Card>
  );
};
