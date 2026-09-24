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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PartyPopper, Cake, AlertTriangle, X } from 'lucide-react';
import { useKids, useFoods } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { analytics } from '@/lib/analytics';
import { insightTone } from '@/lib/insightTone';
import {
  buildKidGrowthSuggestions,
  isBirthdayToday,
  type KidGrowthSuggestions,
} from '@/lib/kidGrowthRules';
import type { Kid } from '@/types';
import '@/i18n/appLocale';

const DISMISS_KEY_PREFIX = 'eatpal.kid_birthday_dismissed';
const NUDGE_KEY_PREFIX = 'eatpal.kid_birthday_nudges';

/** Per signed-in user, so one parent's dismissal does not hide it for the other. */
function dismissKey(userId: string | null | undefined, kidId: string, year: number): string {
  return `${DISMISS_KEY_PREFIX}.${userId ?? 'anon'}.${kidId}.${year}`;
}
function nudgeKey(kidId: string): string {
  return `${NUDGE_KEY_PREFIX}.${kidId}`;
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

type BirthdayKid = Pick<Kid, 'id' | 'name' | 'date_of_birth' | 'allergens' | 'disliked_foods'>;

/** A kid whose birthday card should show now: today, not opted out, not dismissed. */
function isBirthdayCardDue(kid: BirthdayKid, now: Date, userId: string | null | undefined): boolean {
  if (!kid.date_of_birth) return false;
  if (!isBirthdayToday(kid.date_of_birth, now)) return false;
  if (read(nudgeKey(kid.id)) === 'false') return false;
  // Local year, matching the local calendar day isBirthdayToday checks.
  if (read(dismissKey(userId, kid.id, now.getFullYear())) === 'true') return false;
  return true;
}

/**
 * Cheap predicate for the Home insight slot: does any kid have a birthday
 * card due today? No suggestions are built.
 */
export function hasBirthdayToday(
  kids: ReadonlyArray<BirthdayKid>,
  now: Date,
  userId: string | null | undefined
): boolean {
  return kids.some((kid) => isBirthdayCardDue(kid, now, userId));
}

interface BirthdayKidContext {
  kid: BirthdayKid;
  suggestions: KidGrowthSuggestions;
}

interface KidBirthdayCardProps {
  /** Show at most this many kids' cards (the insight slot shows one). */
  maxKids?: number;
  /** Called after a card is dismissed. */
  onDismiss?: () => void;
}

export function KidBirthdayCard({ maxKids, onDismiss }: KidBirthdayCardProps = {}) {
  const { kids } = useKids();
  const { foods } = useFoods();
  const { userId } = useAuth();
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const [dismissedCount, setDismissedCount] = useState(0);

  const birthdayKids: BirthdayKidContext[] = useMemo(() => {
    // dismissedCount is read so a dismissal re-runs the localStorage checks.
    void dismissedCount;
    const out: BirthdayKidContext[] = [];
    for (const kid of kids) {
      if (!isBirthdayCardDue(kid, now, userId)) continue;
      const suggestions = buildKidGrowthSuggestions(kid, foods, { asOf: now });
      if (!suggestions) continue;
      out.push({ kid, suggestions });
    }
    return maxKids === undefined ? out : out.slice(0, maxKids);
  }, [kids, foods, now, userId, maxKids, dismissedCount]);

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
          dismissStorageKey={dismissKey(userId, kid.id, year)}
          onDismiss={() => {
            setDismissedCount((n) => n + 1);
            onDismiss?.();
          }}
        />
      ))}
    </div>
  );
}

interface SingleKidCardProps {
  kid: BirthdayKid;
  suggestions: KidGrowthSuggestions;
  dismissStorageKey: string;
  onDismiss: () => void;
}

function SingleKidCard({ kid, suggestions, dismissStorageKey, onDismiss }: SingleKidCardProps) {
  const { t } = useTranslation();
  const tone = insightTone('birthday');
  const cautionTone = insightTone('mild');

  const handleDismiss = () => {
    write(dismissStorageKey, 'true');
    analytics.trackEvent('kid_growth_event_dismissed', { kid_id: kid.id });
    onDismiss();
  };

  const handleRetryAversion = (foodId: string) => {
    analytics.trackEvent('kid_aversion_retry_started', {
      kid_id: kid.id,
      food_id: foodId,
    });
  };

  const milestoneLabel = t(`home.insights.birthday.milestones.${suggestions.ageMilestone}`, {
    defaultValue: suggestions.ageMilestone.replace('_', ' '),
  });

  return (
    <Card className={`border ${tone.surface}`}>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base text-foreground">
          <PartyPopper className={`h-4 w-4 ${tone.icon}`} aria-hidden="true" />
          {t('home.insights.birthday.title', {
            defaultValue: '{{name}} turned {{age}} today!',
            name: kid.name,
            age: suggestions.ageYears,
          })}
          <Badge variant="outline" className={`ml-1 capitalize ${tone.badge}`}>
            {milestoneLabel}
          </Badge>
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 -mt-2 -mr-2 shrink-0"
          onClick={handleDismiss}
          aria-label={t('home.insights.birthday.dismissAria', 'Dismiss birthday card')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Portion guideline: information only. The old "Apply" button wrote a
            flag that nothing read, so it promised a change that never happened. */}
        <div className="rounded-md bg-background/60 px-3 py-2">
          <p className="text-sm font-medium flex items-center gap-1.5 text-foreground">
            <Cake className={`h-3.5 w-3.5 ${tone.icon}`} aria-hidden="true" />
            {t('home.insights.birthday.portionTitle', 'Portions grow with age')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('home.insights.birthday.portionDetail', {
              defaultValue: 'About {{percent}}% of a 5-year-old\'s portion.',
              percent: (suggestions.portionScaler * 100).toFixed(0),
            })}
          </p>
        </div>

        {/* Retry candidates open food chaining seeded with the food. */}
        {suggestions.retryFoods.length > 0 && (
          <div className="rounded-md bg-background/60 px-3 py-2 space-y-2">
            <p className="text-sm font-medium text-foreground">
              {t('home.insights.birthday.retryTitle', 'Retry these foods?')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('home.insights.birthday.retryHint', {
                defaultValue:
                  'Tastes shift fast. {{name}} may now tolerate a few foods they refused before.',
                name: kid.name,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.retryFoods.map((food) => (
                <Button
                  key={food.id}
                  asChild
                  size="sm"
                  variant="outline"
                  className="min-h-11 text-xs"
                >
                  <Link
                    to={`/dashboard/food-chaining?food=${encodeURIComponent(food.id)}`}
                    onClick={() => handleRetryAversion(food.id)}
                  >
                    {food.name}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Allergen reintro prompts: informational only, never actionable here. */}
        {suggestions.allergenReintroPrompts.length > 0 && (
          <div className={`rounded-md border px-3 py-2 space-y-2 ${cautionTone.surface}`}>
            <p className="text-sm font-medium flex items-center gap-1.5 text-foreground">
              <AlertTriangle className={`h-3.5 w-3.5 ${cautionTone.icon}`} aria-hidden="true" />
              {t('home.insights.birthday.pediatricianTitle', 'Talk to your pediatrician')}
            </p>
            <ul className="space-y-1 list-disc pl-4">
              {suggestions.allergenReintroPrompts.map((prompt) => (
                <li key={prompt} className="text-xs text-muted-foreground">
                  {prompt}
                </li>
              ))}
            </ul>
            <p className="text-xs italic text-muted-foreground">
              {t('home.insights.birthday.allergenNote', {
                defaultValue: "Informational only. We never remove anything from {{name}}'s allergen list.",
                name: kid.name,
              })}
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
