// @ts-nocheck
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Zap, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { FoodCategory } from "@/types";
import { logger } from "@/lib/logger";

interface RestockSuggestion {
  food_id: string;
  food_name: string;
  current_quantity: number;
  recommended_quantity: number;
  reason: string;
  priority: 'low' | 'medium' | 'high';
  category: FoodCategory;
  aisle?: string;
}

interface SmartRestockSuggestionsProps {
  userId: string;
  kidId?: string;
  onAddItems: (items: Array<{
    name: string;
    quantity: number;
    unit: string;
    category: FoodCategory;
    aisle?: string;
    auto_generated?: boolean;
    restock_reason?: string;
    priority?: string;
  }>) => void;
}

export function SmartRestockSuggestions({ 
  userId, 
  kidId,
  onAddItems 
}: SmartRestockSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadSuggestions();
  }, [userId, kidId]);

  const loadSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('detect_restock_needs', {
        p_user_id: userId,
        p_kid_id: kidId || null
      });

      if (error) {
        logger.error('Error loading restock suggestions:', error);
      } else if (data) {
        setSuggestions(data.map((item: unknown) => ({
          ...item,
          priority: item.priority as 'low' | 'medium' | 'high'
        })));
      }
    } catch (err) {
      logger.error('Failed to load suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  const addAllToList = () => {
    const items = suggestions.map(s => ({
      name: s.food_name,
      quantity: s.recommended_quantity,
      unit: 'servings',
      category: s.category,
      aisle: s.aisle,
      auto_generated: true,
      restock_reason: s.reason,
      priority: s.priority
    }));

    onAddItems(items);
    toast.success(`Added ${items.length} items to your grocery list!`, {
      description: 'Smart restock suggestions applied'
    });
    setDismissed(true);
  };

  const addSingleItem = (suggestion: RestockSuggestion) => {
    onAddItems([{
      name: suggestion.food_name,
      quantity: suggestion.recommended_quantity,
      unit: 'servings',
      category: suggestion.category,
      aisle: suggestion.aisle,
      auto_generated: true,
      restock_reason: suggestion.reason,
      priority: suggestion.priority
    }]);
    
    toast.success(`Added ${suggestion.food_name} to list`);
    setSuggestions(prev => prev.filter(s => s.food_id !== suggestion.food_id));
  };

  if (loading) {
    return (
      <Card className="p-6 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  if (suggestions.length === 0 || dismissed) return null;

  const highPriority = suggestions.filter(s => s.priority === 'high').length;

  return (
    <Card className="p-6 bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20 animate-in slide-in-from-top">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold">Smart Restock Suggestions</h3>
            {highPriority > 0 && (
              <Badge variant="destructive" className="ml-2">
                {highPriority} Urgent
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {suggestions.length} item{suggestions.length !== 1 ? 's' : ''} need restocking based on your meal plan and shopping patterns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={addAllToList} size="sm" className="whitespace-nowrap">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Add All
          </Button>
          <Button 
            onClick={() => setDismissed(true)} 
            variant="ghost" 
            size="icon"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.food_id}
            className="flex items-center justify-between p-3 bg-background rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-medium truncate">{suggestion.food_name}</p>
                {suggestion.priority === 'high' && (
                  <Badge variant="destructive" className="text-xs shrink-0">
                    Urgent
                  </Badge>
                )}
                {suggestion.priority === 'medium' && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    Soon
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {suggestion.reason}
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <div className="text-right">
                <p className="text-sm font-medium">
                  Need: {suggestion.recommended_quantity}
                </p>
                <p className="text-xs text-muted-foreground">
                  Have: {suggestion.current_quantity}
                </p>
              </div>
              <Button 
                onClick={() => addSingleItem(suggestion)}
                variant="outline"
                size="sm"
                className="shrink-0"
              >
                <ShoppingCart className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

