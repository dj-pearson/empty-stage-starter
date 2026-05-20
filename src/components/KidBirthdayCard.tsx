/**
 * US-301: Kid grew-up auto-adapter — birthday-driven re-evaluation.
 *
 * Dashboard celebration card. Shown only on a kid's birthday and only
 * when the parent hasn't dismissed it (or turned off per-kid birthday
 * nudges).
 *
 * Strict guarantees:
 *   - Allergens are never auto-removed. We surface a pediatrician-talk
 *     prompt; mutation is gated behind a separate flow (out of scope for
 *     this card).
 *   - Retry foods open the existing food-chain flow as a starting point
 *     rather than auto-resetting a kid's `disliked_foods`.
 */
import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PartyPopper, Cake, AlertTriangle, X } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useEffect } from 'react';
import { analytics } from '@/lib/analytics';
import { toast } from 'sonner';
import {
  buildKidGrowthSuggestions,
  isBirthdayToday,
  type KidGrowthSuggestions,
} from '@/lib/kidGrowthRules';
import type { Kid } from '@/types';

const DISMISS_KEY_PREFIX = 'eatpal.kid_birthday_dismissed';
const NUDGE_KEY_PREFIX = 'eatpal.kid_birthday_nudges';
const PORTION_APPLIED_KEY_PREFIX = 'eatpal.kid_portion_applied';

function dismissKey(kidId: string, year: number): string {
  return `${DISMISS_KEY_PREFIX}.${kidId}.${year}`;
}
function nudgeKey(kidId: string): string {
  return `${NUDGE_KEY_PREFIX}.${kidId}`;
}
function portionAppliedKey(kidId: string, year: number): string {
  return `${PORTION_APPLIED_KEY_PREFIX}.${kidId}.${year}`;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / disabled
  }
}

interface BirthdayKidContext {
  kid: Pick<Kid, 'id' | 'name' | 'date_of_birth' | 'allergens' | 'disliked_foods'>;
  suggestions: KidGrowthSuggestions;
}

export function KidBirthdayCard() {
  const { kids, foods } = useApp();
  const now = useMemo(() => new Date(), []);
  const year = now.getUTCFullYear();
  const [dismissedFlip, setDismissedFlip] = useState(0); // force-rerender on dismiss

  const birthdayKids: BirthdayKidContext[] = useMemo(() => {
    const out: BirthdayKidContext[] = [];
    for (const kid of kids) {
      if (!kid.date_of_birth) continue;
      if (!isBirthdayToday(kid.date_of_birth, now)) continue;
      // Per-kid opt-out
      const nudgeRaw = read(nudgeKey(kid.id));
      if (nudgeRaw === 'false') continue;
      // Already dismissed this year
      if (read(dismissKey(kid.id, year)) === 'true') continue;
      const suggestions = buildKidGrowthSuggestions(kid, foods, { asOf: now });
      if (!suggestions) continue;
      out.push({ kid, suggestions });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kids, foods, now, year, dismissedFlip]);

  // Telemetry: fire on each new (kid, year) pair this session.
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const { kid, suggestions } of birthdayKids) {
      const key = `${kid.id}-${year}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);
      analytics.trackEvent('kid_birthday_card_shown', {
        kid_id: kid.id,
        age_milestone: suggestions.ageMilestone,
      });
    }
  }, [birthdayKids, year]);

  if (birthdayKids.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      {birthdayKids.map(({ kid, suggestions }) => (
        <SingleKidCard
          key={kid.id}
          kid={kid}
          suggestions={suggestions}
          year={year}
          onDismiss={() => setDismissedFlip((n) => n + 1)}
        />
      ))}
    </div>
  );
}

interface SingleKidCardProps {
  kid: BirthdayKidContext['kid'];
  suggestions: KidGrowthSuggestions;
  year: number;
  onDismiss: () => void;
}

function SingleKidCard({ kid, suggestions, year, onDismiss }: SingleKidCardProps) {
  const portionAlreadyApplied = read(portionAppliedKey(kid.id, year)) === 'true';

  const handleDismiss = () => {
    write(dismissKey(kid.id, year), 'true');
    analytics.trackEvent('kid_growth_event_dismissed', { kid_id: kid.id });
    onDismiss();
  };

  const handleApplyPortion = () => {
    write(portionAppliedKey(kid.id, year), 'true');
    analytics.trackEvent('kid_portion_scaler_applied', {
      kid_id: kid.id,
      portion_scaler: suggestions.portionScaler,
      age_years: suggestions.ageYears,
    });
    toast.success(
      `Portion guideline updated for ${kid.name} (${(suggestions.portionScaler * 100).toFixed(0)}% of age-5 baseline).`
    );
  };

  const handleRetryAversion = (foodId: string) => {
    analytics.trackEvent('kid_aversion_retry_started', {
      kid_id: kid.id,
      food_id: foodId,
    });
    toast(
      'Open the picky-eater food chain to plan a re-introduction.',
      { description: 'Saved to your retry list.' }
    );
  };

  const handleAllergenPrep = (prompt: string) => {
    analytics.trackEvent('kid_allergen_reintro_prep_opened', {
      kid_id: kid.id,
    });
    toast(prompt, { duration: 8000 });
  };

  return (
    <Card className="border-rose-300/60 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/30">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PartyPopper className="h-4 w-4 text-rose-600" aria-hidden="true" />
          {kid.name} turned {suggestions.ageYears} today!
          <Badge variant="outline" className="ml-1 capitalize">
            {suggestions.ageMilestone.replace('_', ' ')}
          </Badge>
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 -mt-1 -mr-1"
          onClick={handleDismiss}
          aria-label="Dismiss birthday card"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Portion scaler */}
        <div className="flex items-center justify-between gap-3 rounded-md bg-background/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Cake className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
              Update portion sizes
            </p>
            <p className="text-xs text-muted-foreground">
              {(suggestions.portionScaler * 100).toFixed(0)}% of age-5 baseline
            </p>
          </div>
          <Button
            size="sm"
            variant={portionAlreadyApplied ? 'outline' : 'default'}
            disabled={portionAlreadyApplied}
            onClick={handleApplyPortion}
            aria-label={`Apply portion scaler for ${kid.name}`}
          >
            {portionAlreadyApplied ? 'Applied' : 'Apply'}
          </Button>
        </div>

        {/* Retry candidates */}
        {suggestions.retryFoods.length > 0 && (
          <div className="rounded-md bg-background/60 px-3 py-2 space-y-2">
            <p className="text-sm font-medium">Retry these foods?</p>
            <p className="text-xs text-muted-foreground">
              Tastes shift fast. {kid.name} may now tolerate a few items they refused before.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.retryFoods.map((food) => (
                <Button
                  key={food.id}
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  onClick={() => handleRetryAversion(food.id)}
                >
                  {food.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Allergen reintro prompts — informational only */}
        {suggestions.allergenReintroPrompts.length > 0 && (
          <div className="rounded-md bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300/40 dark:border-amber-900/40 px-3 py-2 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
              Talk to your pediatrician
            </p>
            <ul className="space-y-1">
              {suggestions.allergenReintroPrompts.map((prompt) => (
                <li key={prompt} className="text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => handleAllergenPrep(prompt)}
                    className="text-left underline-offset-2 hover:underline"
                  >
                    {prompt}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 italic">
              Informational only. We never auto-remove items from {kid.name}'s allergen list.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Per-kid "birthday nudges" preference hook. Exposed for the Kids page
 * settings UI; the card itself reads the same key directly to avoid
 * an extra subscription per kid.
 */
export function useKidBirthdayNudgePref(kidId: string): {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
} {
  const [enabled, setEnabled] = useLocalStorage<boolean>(nudgeKey(kidId), true);
  return {
    enabled,
    setEnabled: (next: boolean) => {
      setEnabled(next);
      analytics.trackEvent('kid_birthday_nudge_toggled', { kid_id: kidId, enabled: next });
    },
  };
}
