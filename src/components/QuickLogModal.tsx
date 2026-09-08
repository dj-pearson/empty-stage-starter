import { useState } from 'react';
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Smile, Meh, Frown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  quickLogNeedsMealChoice,
  resolveQuickLogMealId,
  type QuickLogMeal,
} from '@/lib/quickLog';

type MealResult = 'ate' | 'tasted' | 'refused';

interface QuickLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealName?: string;
  foodName?: string;
  /**
   * Today's meals to choose between (US-812). Omit it when the caller already
   * knows which meal is being logged -- the Home page opens this from a
   * specific meal row and passes nothing here.
   *
   * The floating "Log Meal Result" action has no such context, and used to open
   * the modal anyway against a handler that toasted "Meal logged!" and wrote
   * nothing at all. Asking which meal is the difference between logging and
   * pretending to.
   */
  meals?: ReadonlyArray<QuickLogMeal>;
  onLog: (result: MealResult, notes?: string, mealId?: string) => void | Promise<void>;
}

export function QuickLogModal({
  open,
  onOpenChange,
  mealName = 'this meal',
  foodName,
  meals,
  onLog,
}: QuickLogModalProps) {
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);

  const needsMealChoice = quickLogNeedsMealChoice(meals);
  const resolvedMealId = resolveQuickLogMealId(meals, selectedMealId);
  const awaitingMealChoice = needsMealChoice && !selectedMealId;

  const handleResultClick = async (result: MealResult) => {
    if (awaitingMealChoice) return;
    setIsLoading(true);

    try {
      await onLog(result, notes || undefined, resolvedMealId ?? undefined);
      // Reset and close on success
      setNotes('');
      setSelectedMealId(null);
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to log meal:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resultButtons = [
    {
      result: 'ate' as MealResult,
      icon: Smile,
      label: 'Ate it!',
      emoji: '🎉',
      color: 'bg-green-500 hover:bg-green-600 text-white',
      description: 'Success!',
    },
    {
      result: 'tasted' as MealResult,
      icon: Meh,
      label: 'Tried a bite',
      emoji: '👍',
      color: 'bg-yellow-500 hover:bg-yellow-600 text-white',
      description: 'Good try!',
    },
    {
      result: 'refused' as MealResult,
      icon: Frown,
      label: 'Refused',
      emoji: '🤷',
      color: 'bg-orange-500 hover:bg-orange-600 text-white',
      description: "That's okay",
    },
  ];

  const quickNotes = [
    'Ate half',
    "Tried but didn't like",
    'Loved it!',
    'Asked for more',
    'Too tired',
    'Not hungry',
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            How did {mealName} go?
          </DialogTitle>
          {foodName && (
            <DialogDescription>
              Logging result for: <span className="font-semibold">{foodName}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Which meal (US-812). Only when the caller could not say. */}
        {needsMealChoice && (
          <fieldset className="space-y-2 pt-2">
            <legend className="text-sm font-medium">Which meal?</legend>
            <div className="flex flex-wrap gap-2">
              {meals?.map((meal) => (
                <button
                  key={meal.id}
                  type="button"
                  onClick={() => setSelectedMealId(meal.id)}
                  aria-pressed={selectedMealId === meal.id}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-sm transition-colors',
                    selectedMealId === meal.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary hover:bg-secondary/80'
                  )}
                >
                  {meal.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {/* Result buttons - large, touch-friendly */}
        <div className="grid gap-3 py-4">
          {resultButtons.map(({ result, icon: Icon, label, emoji, color, description }) => (
            <Button
              key={result}
              onClick={() => handleResultClick(result)}
              disabled={isLoading || awaitingMealChoice}
              className={cn(
                'h-auto py-6 flex flex-col gap-2 transition-transform active:scale-95',
                color
              )}
              size="lg"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-8 w-8" />
                <span className="text-2xl">{emoji}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold">{label}</span>
                <span className="text-sm opacity-90">{description}</span>
              </div>
            </Button>
          ))}
        </div>

        {/* Optional notes section */}
        <div className="space-y-3">
          <label htmlFor="notes" className="text-sm font-medium">
            Add a note? (optional)
          </label>

          {/* Quick note suggestions */}
          <div className="flex flex-wrap gap-2">
            {quickNotes.map((note) => (
              <button
                key={note}
                onClick={() => setNotes(note)}
                className="text-xs px-2 py-1 rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
                type="button"
              >
                {note}
              </button>
            ))}
          </div>

          <Textarea
            id="notes"
            placeholder="Any notes about this meal?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="resize-none"
            rows={2}
          />
        </div>

        {/* Encouragement message */}
        <p className="text-xs text-muted-foreground text-center italic">
          Every meal is progress, no matter the result! 💙
        </p>
      </DialogContent>
    </Dialog>
  );
}
