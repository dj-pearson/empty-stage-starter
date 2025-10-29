import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Search, ScanBarcode, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ProductSafetyCheckerProps {
  kidName: string;
  kidAllergens: string[];
}

type ProductResult = {
  name: string;
  allergens: string[];
  isSafe: boolean;
  matchingAllergens: string[];
  source: string;
};

export function ProductSafetyChecker({ kidName, kidAllergens }: ProductSafetyCheckerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ProductResult | null>(null);

  const checkPermissions = async () => {
    // Web-only for now - no native scanning implemented
    return true;
  };

  const handleScan = async () => {
    // Native scanning not yet implemented - show user message
    toast({
      title: "Scanning unavailable",
      description: "Please enter the barcode number manually or use the search feature.",
      variant: "default",
    });
    setIsScanning(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    await lookupProduct(searchQuery.trim());
  };

  const lookupProduct = async (query: string) => {
    setIsSearching(true);
    setResult(null);

    try {
      // Try barcode lookup first
      const { data: barcodeData } = await supabase.functions.invoke('lookup-barcode', {
        body: { barcode: query }
      });

      let productData = null;

      if (barcodeData?.success && barcodeData?.food) {
        productData = {
          name: barcodeData.food.name,
          allergens: barcodeData.food.allergens || [],
          source: barcodeData.food.source
        };
      } else {
        // If barcode fails, try searching nutrition database by name
        const { data: nutritionData } = await supabase
          .from('nutrition')
          .select('name, allergens')
          .ilike('name', `%${query}%`)
          .limit(1)
          .maybeSingle();

        if (nutritionData) {
          productData = {
            name: nutritionData.name,
            allergens: nutritionData.allergens || [],
            source: 'Nutrition Database'
          };
        }
      }

      if (productData) {
        // Check allergens
        const matchingAllergens = productData.allergens.filter(
          (allergen: string) => kidAllergens.some(ka => 
            ka.toLowerCase() === allergen.toLowerCase()
          )
        );

        setResult({
          name: productData.name,
          allergens: productData.allergens,
          isSafe: matchingAllergens.length === 0,
          matchingAllergens,
          source: productData.source
        });

        if (matchingAllergens.length > 0) {
          toast({
            title: "⚠️ ALLERGEN WARNING",
            description: `This product contains ${matchingAllergens.join(', ')} which ${kidName} is allergic to!`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "✅ Safe Product",
            description: `No allergen conflicts found for ${kidName}`,
          });
        }
      } else {
        toast({
          title: "Product not found",
          description: "Try searching by product name or scan the barcode",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Lookup error:', error);
      toast({
        title: "Error",
        description: "Failed to lookup product. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <>
      <style>{`
        .scanner-active {
          --background: transparent !important;
        }
      `}</style>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Product Safety Check
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Check Product Safety for {kidName}</DialogTitle>
            <DialogDescription>
              Scan a barcode or search for a product to check for allergen conflicts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Allergen Summary */}
            {kidAllergens.length > 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{kidName}'s Allergens:</strong>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {kidAllergens.map((allergen) => (
                      <Badge key={allergen} variant="destructive" className="text-xs">
                        {allergen}
                      </Badge>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertDescription>
                  No allergens recorded for {kidName}
                </AlertDescription>
              </Alert>
            )}

            {/* Search/Scan Controls */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter product name or barcode"
                  disabled={isSearching || isScanning}
                />
                <Button 
                  onClick={handleSearch} 
                  disabled={!searchQuery.trim() || isSearching || isScanning}
                  variant="outline"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              <Button 
                onClick={handleScan} 
                className="w-full" 
                variant="secondary"
                disabled={isSearching || isScanning}
              >
                <ScanBarcode className="h-4 w-4 mr-2" />
                Scan Barcode
              </Button>
            </div>

            {/* Loading State */}
            {(isSearching || isScanning) && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  {isScanning ? "Point camera at barcode..." : "Searching product..."}
                </AlertDescription>
              </Alert>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-3">
                <Alert variant={result.isSafe ? "default" : "destructive"}>
                  {result.isSafe ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  <AlertDescription>
                    <strong className="text-lg">
                      {result.isSafe ? "✅ SAFE FOR " : "⚠️ WARNING FOR "}
                      {kidName.toUpperCase()}
                    </strong>
                  </AlertDescription>
                </Alert>

                <div className="border rounded-lg p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg">{result.name}</h3>
                    <Badge variant="outline" className="mt-1 text-xs">{result.source}</Badge>
                  </div>

                  {result.allergens.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Product Allergens:</p>
                      <div className="flex flex-wrap gap-1">
                        {result.allergens.map((allergen) => (
                          <Badge 
                            key={allergen}
                            variant={result.matchingAllergens.includes(allergen) ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {allergen}
                            {result.matchingAllergens.includes(allergen) && " ⚠️"}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No allergen information available</p>
                  )}

                  {result.matchingAllergens.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Contains allergens:</strong> {result.matchingAllergens.join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
