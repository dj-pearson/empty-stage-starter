import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  X,
  Clock,
  ChefHat,
  ThumbsUp,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useState, memo } from "react";

interface MealSuggestion {
  id: string;
  recipe_id: string;
  recipe_name: string;
  recipe_description: string;
  recipe_image: string;
  reasoning: string;
  confidence_score: number;
  predicted_kid_approval: number;
  match_factors: string[];
  estimated_prep_time: number;
  estimated_cook_time: number;
  difficulty: string;
  status: string;
}

interface MealSuggestionCardProps {
  suggestion: MealSuggestion;
  onAccept?: (suggestion: MealSuggestion) => void;
  onReject?: (suggestion: MealSuggestion) => void;
  className?: string;
}

const factorLabels: Record<string, { label: string; icon: any }> = {
  kid_favorite: { label: "Kid Favorite", icon: ThumbsUp },
  quick: { label: "Quick Meal", icon: Clock },
  easy_to_make: { label: "Easy", icon: ChefHat },
  variety: { label: "New Variety", icon: Sparkles },
  perfect_timing: { label: "Perfect Timing", icon: TrendingUp },
  uses_pantry: { label: "Uses Pantry Items", icon: ChefHat },
};

export const MealSuggestionCard = memo(function MealSuggestionCard({
  suggestion,
  onAccept,
  onReject,
  className,
}: MealSuggestionCardProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const totalTime = suggestion.estimated_prep_time + suggestion.estimated_cook_time;

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await onAccept?.(suggestion);
      toast.success("Added to meal plan!");
    } catch (error) {
      console.error("Error accepting suggestion:", error);
      toast.error("Failed to add meal");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onReject?.(suggestion);
      toast.success("Suggestion dismissed");
    } catch (error) {
      console.error("Error rejecting suggestion:", error);
      toast.error("Failed to dismiss");
    } finally {
      setIsRejecting(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'hard':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <Card className={cn("overflow-hidden hover:shadow-lg transition-shadow", className)}>
      {/* Recipe Image */}
      {suggestion.recipe_image && (
        <div className="relative h-48 overflow-hidden">
          <img
            src={suggestion.recipe_image}
            alt={suggestion.recipe_name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 right-2 flex gap-2">
            <Badge className="bg-white/90 text-black">
              {suggestion.confidence_score.toFixed(0)}% match
            </Badge>
          </div>
        </div>
      )}

      <CardContent className="pt-4 space-y-3">
        {/* Recipe Name */}
        <div>
          <h3 className="font-semibold text-lg">{suggestion.recipe_name}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {suggestion.recipe_description}
          </p>
        </div>

        {/* AI Reasoning */}
        <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
          <p className="text-sm flex items-start gap-2">
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <span>{suggestion.reasoning}</span>
          </p>
        </div>

        {/* Match Factors */}
        {suggestion.match_factors && suggestion.match_factors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestion.match_factors.map((factor: string) => {
              const factorInfo = factorLabels[factor];
              if (!factorInfo) return null;
              const Icon = factorInfo.icon;
              return (
                <Badge
                  key={factor}
                  variant="secondary"
                  className="text-xs flex items-center gap-1"
                >
                  <Icon className="h-3 w-3" />
                  {factorInfo.label}
                </Badge>
              );
            })}
          </div>
        )}

        {/* Metrics */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{totalTime} min</span>
          </div>
          <Badge className={getDifficultyColor(suggestion.difficulty)}>
            {suggestion.difficulty}
          </Badge>
          {suggestion.predicted_kid_approval > 0 && (
            <div className="flex items-center gap-1">
              <ThumbsUp className="h-4 w-4 text-muted-foreground" />
              <span>{suggestion.predicted_kid_approval}% approval</span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 pt-0">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleReject}
          disabled={isRejecting || isAccepting}
        >
          <X className="h-4 w-4 mr-2" />
          Not Interested
        </Button>
        <Button
          className="flex-1"
          onClick={handleAccept}
          disabled={isAccepting || isRejecting}
        >
          <Check className="h-4 w-4 mr-2" />
          Add to Plan
        </Button>
      </CardFooter>
    </Card>
  );
});
