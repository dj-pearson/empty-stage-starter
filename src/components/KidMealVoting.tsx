import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Trophy,
  Star,
  ArrowLeft,
  RotateCcw,
  PartyPopper,
  ThumbsUp
} from "lucide-react";
import { MealVotingCard, VoteType } from "@/components/MealVotingCard";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Kid, Recipe } from "@/types";

interface MealToVote {
  id: string;
  planEntryId?: string;
  recipeId?: string;
  mealName: string;
  mealSlot: string;
  mealDate: string;
  imageUrl?: string;
  prepTime?: string;
  cookTime?: string;
  servings?: number;
  difficulty?: string;
  description?: string;
  existingVote?: VoteType;
}

interface KidMealVotingProps {
  kid: Kid;
  meals: MealToVote[];
  onComplete?: () => void;
  onBack?: () => void;
}

export function KidMealVoting({
  kid,
  meals,
  onComplete,
  onBack,
}: KidMealVotingProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [votes, setVotes] = useState<Map<string, VoteType>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [achievements, setAchievements] = useState<any[]>([]);

  const currentMeal = meals[currentIndex];
  const progress = ((currentIndex) / meals.length) * 100;
  const remainingCount = meals.length - currentIndex;

  // Load existing votes
  useEffect(() => {
    loadExistingVotes();
  }, []);

  const loadExistingVotes = async () => {
    try {
      // @ts-ignore - meal_votes table exists but types not yet regenerated
      const { data, error } = await supabase
        .from('meal_votes')
        .select('*')
        .eq('kid_id', kid.id)
        .in('meal_date', meals.map(m => m.mealDate));

      if (error) throw error;

      const existingVotes = new Map<string, VoteType>();
      // @ts-ignore - meal_votes columns exist but types not yet regenerated
      data?.forEach(vote => {
        const key = `${vote.meal_date}-${vote.meal_slot}`;
        existingVotes.set(key, vote.vote);
      });

      setVotes(existingVotes);
    } catch (error) {
      console.error('Error loading votes:', error);
    }
  };

  const handleVote = async (vote: VoteType) => {
    if (!vote || !currentMeal) return;

    const key = `${currentMeal.mealDate}-${currentMeal.mealSlot}`;
    const newVotes = new Map(votes);
    newVotes.set(key, vote);
    setVotes(newVotes);

    // Save vote to database
    await saveVote(currentMeal, vote);

    // Move to next card after a short delay
    setTimeout(() => {
      if (currentIndex < meals.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // All done!
        handleCompletion();
      }
    }, 300);
  };

  const saveVote = async (meal: MealToVote, vote: VoteType) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // @ts-ignore - household_id column exists but types not yet regenerated
      const { data: profile } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile) return;

      const voteEmoji = vote === 'love_it' ? '😍' : vote === 'okay' ? '🙂' : '😭';

      // @ts-ignore - meal_votes table and columns exist but types not yet regenerated
      const { error } = await supabase
        .from('meal_votes')
        .upsert({
          kid_id: kid.id,
          household_id: profile.household_id,
          plan_entry_id: meal.planEntryId,
          recipe_id: meal.recipeId,
          meal_date: meal.mealDate,
          meal_slot: meal.mealSlot,
          vote,
          vote_emoji: voteEmoji,
        });

      if (error) throw error;

      // Check for new achievements
      await checkAchievements();

    } catch (error) {
      console.error('Error saving vote:', error);
      toast.error('Failed to save vote');
    }
  };

  const checkAchievements = async () => {
    try {
      // @ts-ignore - voting_achievements table exists but types not yet regenerated
      const { data, error } = await supabase
        .from('voting_achievements')
        .select('*')
        .eq('kid_id', kid.id)
        .gte('unlocked_at', new Date(Date.now() - 5000).toISOString()); // Last 5 seconds

      if (error) throw error;

      if (data && data.length > 0) {
        setAchievements(data);
        // Show achievement toast
        // @ts-ignore - achievement columns exist but types not yet regenerated
        data.forEach(achievement => {
          toast.success(
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <div>
                <p className="font-semibold">{achievement.achievement_name}</p>
                <p className="text-xs text-muted-foreground">{achievement.achievement_description}</p>
                <p className="text-xs text-amber-600 font-semibold">+{achievement.points_earned} points</p>
              </div>
            </div>,
            { duration: 5000 }
          );
        });
      }
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  };

  const handleCompletion = () => {
    setShowCompletion(true);
  };

  const handleUndo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (showCompletion) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] p-8 text-center">
        <div className="mb-6">
          <PartyPopper className="h-24 w-24 text-primary mx-auto mb-4" />
          <h2 className="text-4xl font-bold mb-2">
            Great Job, {kid.name}!
          </h2>
          <p className="text-xl text-muted-foreground mb-6">
            You voted on all {meals.length} meals!
          </p>

          {/* Vote Summary */}
          <div className="flex justify-center gap-4 mb-8">
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
              <div className="text-3xl mb-1">😍</div>
              <div className="text-2xl font-bold">
                {Array.from(votes.values()).filter(v => v === 'love_it').length}
              </div>
              <div className="text-xs text-muted-foreground">Love It</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
              <div className="text-3xl mb-1">🙂</div>
              <div className="text-2xl font-bold">
                {Array.from(votes.values()).filter(v => v === 'okay').length}
              </div>
              <div className="text-xs text-muted-foreground">It's Okay</div>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
              <div className="text-3xl mb-1">😭</div>
              <div className="text-2xl font-bold">
                {Array.from(votes.values()).filter(v => v === 'no_way').length}
              </div>
              <div className="text-xs text-muted-foreground">No Way</div>
            </div>
          </div>

          {/* Achievements */}
          {achievements.length > 0 && (
            <div className="mb-8">
              <h3 className="font-semibold mb-3 flex items-center justify-center gap-2">
                <Star className="h-5 w-5 text-amber-500" />
                New Achievements!
              </h3>
              <div className="flex flex-wrap justify-center gap-2">
                {achievements.map(achievement => (
                  <Badge key={achievement.id} variant="secondary" className="text-sm py-1.5 px-3">
                    <Trophy className="h-3 w-3 mr-1 text-amber-500" />
                    {achievement.achievement_name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Encouragement */}
          <div className="flex items-center justify-center gap-2 mb-8 text-muted-foreground">
            <ThumbsUp className="h-5 w-5" />
            <p>Your parents will see your votes when planning meals!</p>
          </div>
        </div>

        <div className="flex gap-3">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          {onComplete && (
            <Button onClick={onComplete}>
              Done
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!currentMeal) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-2">No meals to vote on!</h3>
          <p className="text-muted-foreground mb-4">
            Ask your parents to add some meals to the planner
          </p>
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h2 className="font-semibold">Vote on Meals</h2>
            <p className="text-sm text-muted-foreground">
              {remainingCount} {remainingCount === 1 ? 'meal' : 'meals'} left
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={currentIndex === 0}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Undo
        </Button>
      </div>

      {/* Progress */}
      <div className="px-4 pt-4">
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {currentIndex} of {meals.length} voted
        </p>
      </div>

      {/* Voting Cards Stack */}
      <div className="flex-1 relative overflow-hidden">
        {/* Show current and next card for stack effect */}
        {meals.slice(currentIndex, currentIndex + 2).map((meal, index) => (
          <div
            key={`${meal.id}-${currentIndex + index}`}
            className="absolute inset-0"
            style={{
              zIndex: meals.length - index,
              transform: `scale(${1 - index * 0.05}) translateY(${index * 10}px)`,
              opacity: index === 0 ? 1 : 0.5,
            }}
          >
            {index === 0 && (
              <MealVotingCard
                mealName={meal.mealName}
                mealSlot={meal.mealSlot}
                mealDate={meal.mealDate}
                imageUrl={meal.imageUrl}
                prepTime={meal.prepTime}
                cookTime={meal.cookTime}
                servings={meal.servings}
                difficulty={meal.difficulty}
                description={meal.description}
                onVote={handleVote}
              />
            )}
          </div>
        ))}
      </div>

      {/* Vote Buttons (for non-swipe devices) */}
      <div className="p-4 border-t bg-background">
        <div className="flex justify-between gap-3 max-w-md mx-auto">
          <Button
            variant="outline"
            size="lg"
            onClick={() => handleVote('no_way')}
            className="flex-1 h-16"
          >
            <div className="text-center">
              <div className="text-2xl mb-1">😭</div>
              <div className="text-xs">No Way</div>
            </div>
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => handleVote('okay')}
            className="flex-1 h-16"
          >
            <div className="text-center">
              <div className="text-2xl mb-1">🙂</div>
              <div className="text-xs">It's Okay</div>
            </div>
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => handleVote('love_it')}
            className="flex-1 h-16"
          >
            <div className="text-center">
              <div className="text-2xl mb-1">😍</div>
              <div className="text-xs">Love It!</div>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
