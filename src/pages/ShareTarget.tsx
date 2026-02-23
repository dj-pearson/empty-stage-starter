import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingCart, Share2, ExternalLink } from "lucide-react";
import { GroceryScreenshotImport } from "@/components/GroceryScreenshotImport";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

/**
 * ShareTarget page handles incoming shares from other apps via:
 * 1. PWA Web Share Target API (POST with multipart/form-data — images and text)
 * 2. URL query params (GET — text and urls shared from other apps)
 *
 * The manifest.json share_target config routes shares to this page.
 */
export default function ShareTarget() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addGroceryItem } = useApp();

  const [sharedImage, setSharedImage] = useState<string | null>(null);
  const [sharedText, setSharedText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  useEffect(() => {
    processSharedData();
  }, []);

  const processSharedData = async () => {
    try {
      // Check for GET params (text/url sharing)
      const title = searchParams.get("title") || "";
      const text = searchParams.get("text") || "";
      const url = searchParams.get("url") || "";

      const combinedText = [title, text, url].filter(Boolean).join("\n");

      if (combinedText) {
        setSharedText(combinedText);
        setIsLoading(false);
        setImportDialogOpen(true);
        return;
      }

      // For POST shares (images), the service worker should intercept and cache
      // Try to retrieve cached share data from the service worker
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        try {
          const response = await fetch("/__share_target_cache", { method: "GET" });
          if (response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType?.startsWith("image/")) {
              const blob = await response.blob();
              const reader = new FileReader();
              reader.onload = (e) => {
                setSharedImage(e.target?.result as string);
                setIsLoading(false);
                setImportDialogOpen(true);
              };
              reader.readAsDataURL(blob);
              return;
            } else {
              const data = await response.json();
              if (data.text) {
                setSharedText(data.text);
                setIsLoading(false);
                setImportDialogOpen(true);
                return;
              }
            }
          }
        } catch (error) {
          logger.debug("No cached share data from service worker:", error);
        }
      }

      // No shared data found — show the import dialog anyway for manual input
      setIsLoading(false);
      setImportDialogOpen(true);
    } catch (error) {
      logger.error("Error processing shared data:", error);
      setIsLoading(false);
      setImportDialogOpen(true);
    }
  };

  const handleImport = (items: Array<{
    name: string;
    quantity: number;
    unit: string;
    category: "protein" | "carb" | "dairy" | "fruit" | "vegetable" | "snack";
    notes?: string;
  }>) => {
    items.forEach((item) => {
      addGroceryItem({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        notes: item.notes,
        added_via: "share",
      });
    });
    navigate("/dashboard/grocery");
  };

  const handleClose = () => {
    setImportDialogOpen(false);
    navigate("/dashboard/grocery");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="p-8 max-w-sm mx-auto text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Processing shared content...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="p-8 max-w-sm mx-auto text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Share2 className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold">Import to Grocery List</h1>
        <p className="text-sm text-muted-foreground">
          {sharedImage
            ? "Parsing your shared image for grocery items..."
            : sharedText
            ? "Parsing your shared text for grocery items..."
            : "Share a screenshot or text to add items to your grocery list."}
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => setImportDialogOpen(true)}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            Open Import
          </Button>
          <Button variant="outline" onClick={() => navigate("/dashboard/grocery")}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Go to Grocery List
          </Button>
        </div>
      </Card>

      <GroceryScreenshotImport
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
          else setImportDialogOpen(true);
        }}
        onImport={handleImport}
        initialImage={sharedImage}
        initialText={sharedText}
      />
    </div>
  );
}
