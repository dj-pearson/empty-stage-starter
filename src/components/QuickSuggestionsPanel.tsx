import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Sparkles, Settings } from "lucide-react";
import { MealSuggestionCard } from "@/components/MealSuggestionCard";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface QuickSuggestionsPanelProps {
  householdId: string;
  kids: any[];
  onSuggestionAccepted?: () => void;
  className?: string;
}

export function QuickSuggestionsPanel({
  householdId,
  kids,
  onSuggestionAccepted,
  className,
}: QuickSuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [mealSlotFilter, setMealSlotFilter] = useState<string>("all");
  const [count, setCount] = useState(5);

  useEffect(() => {
    loadSuggestions();
  }, [householdId]);

  const loadSuggestions = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('active_suggestions')
        .select('*')
        .eq('household_id', householdId)
        .order('confidence_score', { ascending: false })
        .limit(10);

      if (error) throw error;

      setSuggestions(data || []);
    } catch (error) {
      console.error('Error loading suggestions:', error);
      toast.error('Failed to load suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  const generateSuggestions = async () => {
    try {
      setIsGenerating(true);

      const response = await fetch(
        `${supabase.supabaseUrl}/functions/v1/generate-meal-suggestions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({
            householdId,
            mealSlot: mealSlotFilter === 'all' ? undefined : mealSlotFilter,
            count,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate suggestions');
      }

      const { suggestions: newSuggestions } = await response.json();

      toast.success(`Generated ${newSuggestions.length} meal suggestions!`);
      await loadSuggestions();
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast.error('Failed to generate suggestions');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = async (suggestion: any) => {
    try {
      // Get kid IDs to add meal for
      const kidIds = kids.map(k => k.id);

      const { error } = await supabase.rpc('accept_meal_suggestion', {
        p_suggestion_id: suggestion.id,
        p_kid_ids: kidIds,
      });

      if (error) throw error;

      // Remove from UI
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));

      onSuggestionAccepted?.();
    } catch (error) {
      console.error('Error accepting suggestion:', error);
      throw error;
    }
  };

  const handleReject = async (suggestion: any) => {
    try {
      const { error } = await supabase.rpc('reject_meal_suggestion', {
        p_suggestion_id: suggestion.id,
        p_feedback_type: 'not_interested',
      });

      if (error) throw error;

      // Remove from UI
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    } catch (error) {
      console.error('Error rejecting suggestion:', error);
      throw error;
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Quick Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-96" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Quick Suggestions
            </CardTitle>
            <CardDescription>
              AI-powered meal recommendations personalized for your family
            </CardDescription>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Options
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Suggestion Options</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Meal Type</Label>
                  <Select value={mealSlotFilter} onValueChange={setMealSlotFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Meals</SelectItem>
                      <SelectItem value="breakfast">Breakfast</SelectItem>
                      <SelectItem value="lunch">Lunch</SelectItem>
                      <SelectItem value="dinner">Dinner</SelectItem>
                      <SelectItem value="snack1">Snack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Number of Suggestions</Label>
                  <Select value={count.toString()} onValueChange={(v) => setCount(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 suggestions</SelectItem>
                      <SelectItem value="5">5 suggestions</SelectItem>
                      <SelectItem value="8">8 suggestions</SelectItem>
                      <SelectItem value="10">10 suggestions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {suggestions.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">No suggestions yet</p>
            <Button onClick={generateSuggestions} disabled={isGenerating}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Generating...' : 'Generate Suggestions'}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} available
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={generateSuggestions}
                disabled={isGenerating}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {suggestions.map((suggestion) => (
                <MealSuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onAccept={handleAccept}
                  onReject={handleReject}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
