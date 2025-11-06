// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Award, Users } from "lucide-react";
import { logger } from "@/lib/logger";

interface AisleContributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  storeLayoutId: string | null;
  userId: string | null;
  onContribute: () => void;
}

export function AisleContributionDialog({
  open,
  onOpenChange,
  itemName,
  storeLayoutId,
  userId,
  onContribute,
}: AisleContributionDialogProps) {
  const [aisleNumber, setAisleNumber] = useState("");
  const [aisleName, setAisleName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userStats, setUserStats] = useState<any>(null);

  // Load user stats when dialog opens
  useEffect(() => {
    const loadUserStats = async () => {
      if (!userId) return;

      try {
        const { data } = await supabase
          .from('user_contribution_stats')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        setUserStats(data);
      } catch (error) {
        logger.error('Error loading user stats:', error);
      }
    };

    if (open && userId) {
      loadUserStats();
    }
  }, [open, userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userId || !storeLayoutId) {
      toast.error("Missing required information");
      return;
    }

    if (!aisleNumber && !aisleName) {
      toast.error("Please provide at least aisle number or name");
      return;
    }

    setIsSubmitting(true);
    try {
      // Check if contribution already exists
      const { data: existing } = await supabase
        .from('user_store_contributions')
        .select('*')
        .eq('user_id', userId)
        .eq('store_layout_id', storeLayoutId)
        .eq('food_item_name', itemName)
        .maybeSingle();

      if (existing) {
        // Update existing contribution
        const { error } = await supabase
          .from('user_store_contributions')
          .update({
            aisle_number: aisleNumber || existing.aisle_number,
            aisle_name: aisleName || existing.aisle_name,
            contribution_count: existing.contribution_count + 1,
            last_contributed_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new contribution
        const { error } = await supabase
          .from('user_store_contributions')
          .insert([{
            user_id: userId,
            store_layout_id: storeLayoutId,
            food_item_name: itemName,
            aisle_number: aisleNumber || null,
            aisle_name: aisleName || null,
          }]);

        if (error) throw error;
      }

      // Create food_aisle_mapping if doesn't exist
      const { error: mappingError } = await supabase
        .from('food_aisle_mappings')
        .insert([{
          store_layout_id: storeLayoutId,
          food_item_name: itemName,
          aisle_number: aisleNumber || null,
          aisle_name: aisleName || null,
          confidence_level: 'low',
          validation_count: 1,
        }])
        .select()
        .maybeSingle();

      // Ignore conflict error - mapping already exists
      if (mappingError && !mappingError.message.includes('duplicate')) {
        throw mappingError;
      }

      toast.success("Thanks for contributing! 🎉", {
        description: "You're helping other families shop more efficiently"
      });

      setAisleNumber("");
      setAisleName("");
      onContribute();
      onOpenChange(false);
    } catch (error) {
      logger.error('Error submitting contribution:', error);
      toast.error("Failed to save contribution");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Help Map This Item
          </DialogTitle>
          <DialogDescription>
            Which aisle did you find <strong>{itemName}</strong> in?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* User Stats Badge */}
          {userStats && (
            <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
              <Award className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Your Impact</p>
                <p className="text-xs text-muted-foreground">
                  {userStats.helped_families_count || 0} families helped
                </p>
              </div>
              <Badge variant="secondary">
                {userStats.total_contributions || 0} contributions
              </Badge>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="aisle-number">Aisle Number</Label>
            <Input
              id="aisle-number"
              placeholder="e.g., 3, A5, or leave blank"
              value={aisleNumber}
              onChange={(e) => setAisleNumber(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="aisle-name">Aisle Name (optional)</Label>
            <Input
              id="aisle-name"
              placeholder="e.g., Bakery, Dairy, Produce"
              value={aisleName}
              onChange={(e) => setAisleName(e.target.value)}
            />
          </div>

          {/* Community Impact */}
          <div className="p-3 bg-accent/50 rounded-lg">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>
                <strong>Community-Powered:</strong> Your contribution will help other families 
                find items faster. Multiple confirmations increase accuracy!
              </span>
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setAisleNumber("");
                setAisleName("");
                onOpenChange(false);
              }}
            >
              Skip
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || (!aisleNumber && !aisleName)}
            >
              {isSubmitting ? "Saving..." : "Contribute"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
