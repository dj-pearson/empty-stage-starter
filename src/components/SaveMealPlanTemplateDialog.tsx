import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface SaveMealPlanTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
  kidId?: string;
  onTemplateSaved?: () => void;
}

export function SaveMealPlanTemplateDialog({
  open,
  onOpenChange,
  startDate,
  endDate,
  kidId,
  onTemplateSaved,
}: SaveMealPlanTemplateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [season, setSeason] = useState<string>("year_round");
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    setIsLoading(true);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        setIsLoading(false);
        return;
      }

      // Call Edge Function to save template - use VITE_FUNCTIONS_URL for self-hosted Supabase
      const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL ||
        (import.meta.env.VITE_SUPABASE_URL?.replace('api.', 'functions.') ?? '');
      const response = await fetch(
        `${functionsUrl}/manage-meal-plan-templates`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'saveFromWeek',
            templateData: {
              startDate,
              endDate,
              kidId,
              name: name.trim(),
              description: description.trim() || null,
              season,
              is_favorite: isFavorite,
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save template');
      }

      toast.success(
        <div>
          <p className="font-semibold">Template saved!</p>
          <p className="text-sm text-muted-foreground">
            {data.entriesCount} meals saved to "{name}"
          </p>
        </div>
      );

      // Reset form
      setName("");
      setDescription("");
      setSeason("year_round");
      setIsFavorite(false);
      onOpenChange(false);

      // Notify parent
      if (onTemplateSaved) {
        onTemplateSaved();
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            <DialogTitle>Save Week as Template</DialogTitle>
          </div>
          <DialogDescription>
            Save this week's meal plan to reuse later. Perfect for weeks that worked well!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name *</Label>
            <Input
              id="template-name"
              placeholder="e.g., Our Best Week Ever"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Give your template a memorable name
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="template-description">Description (optional)</Label>
            <Textarea
              id="template-description"
              placeholder="e.g., Emma loved these meals, minimal prep time, kid-approved!"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/500 characters
            </p>
          </div>

          {/* Season */}
          <div className="space-y-2">
            <Label htmlFor="season">Season</Label>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger id="season">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year_round">Year Round</SelectItem>
                <SelectItem value="spring">Spring 🌸</SelectItem>
                <SelectItem value="summer">Summer ☀️</SelectItem>
                <SelectItem value="fall">Fall 🍂</SelectItem>
                <SelectItem value="winter">Winter ❄️</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Helps you find the right meals for the right time of year
            </p>
          </div>

          {/* Favorite */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="favorite"
              checked={isFavorite}
              onCheckedChange={(checked) => setIsFavorite(checked as boolean)}
            />
            <Label
              htmlFor="favorite"
              className="text-sm font-normal cursor-pointer flex items-center gap-2"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              Mark as favorite
            </Label>
          </div>

          {/* Info */}
          <div className="bg-muted/50 border rounded-lg p-3">
            <p className="text-sm text-muted-foreground">
              <strong>What gets saved:</strong> All meals from{" "}
              {new Date(startDate).toLocaleDateString()} to{" "}
              {new Date(endDate).toLocaleDateString()} will be saved as a reusable
              template.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
