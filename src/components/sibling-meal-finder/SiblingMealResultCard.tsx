import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, ChefHat, Clock, ImageIcon, Repeat, Sparkles, UtensilsCrossed } from 'lucide-react';
import type { SolverResult } from '@/lib/siblingConstraintSolver';

interface Props {
  result: SolverResult;
  onUse: (result: SolverResult) => void;
  onCook: (result: SolverResult) => void;
  isAccepted?: boolean;
}

const TIER_META: Record<
  SolverResult['resolutionType'],
  { label: string; description: string; badgeClass: string; icon: typeof Check }
> = {
  full_match: {
    label: 'Works for everyone',
    description: 'Recipe satisfies every selected sibling as written.',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    icon: Check,
  },
  with_swaps: {
    label: 'Works with swaps',
    description: 'One small substitution from your pantry makes it fit.',
    badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
    icon: Repeat,
  },
  split_plate: {
    label: 'Split plate',
    description: 'Same dish, with per-kid plate modifications.',
    badgeClass: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
    icon: UtensilsCrossed,
  },
};

export function SiblingMealResultCard({ result, onUse, onCook, isAccepted }: Props) {
  const meta = TIER_META[result.resolutionType];
  const TierIcon = meta.icon;

  return (
    <Card
      className={`overflow-hidden transition-shadow hover:shadow-md ${
        isAccepted ? 'ring-2 ring-primary' : ''
      }`}
    >
      <CardContent className="p-4 flex flex-col md:flex-row gap-4">
        <div className="hidden md:flex h-24 w-24 rounded-md bg-muted shrink-0 items-center justify-center overflow-hidden">
          {result.imageUrl ? (
            <img
              src={result.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageIcon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge variant="outline" className={meta.badgeClass}>
              <TierIcon className="h-3 w-3 mr-1" aria-hidden="true" />
              {meta.label}
            </Badge>
            <Badge variant="secondary" className="bg-muted">
              {Math.round(result.satisfactionScore)} / 100
            </Badge>
            {result.prepMinutes > 0 && (
              <Badge variant="outline" className="border-muted">
                <Clock className="h-3 w-3 mr-1" aria-hidden="true" />
                {result.prepMinutes} min
              </Badge>
            )}
          </div>

          <h3 className="text-lg font-semibold truncate">{result.recipeName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>

          {result.fairnessNote && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {result.fairnessNote}
            </p>
          )}

          {/* Per-kid breakdown */}
          <ul className="mt-3 space-y-1.5" aria-label="Per-kid satisfaction breakdown">
            {result.perKidSatisfaction.map((ks) => {
              const pct = Math.round(ks.score * 100);
              const tone =
                pct >= 85 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500';
              const summary = [
                ks.favoriteHits.length > 0
                  ? `loves ${ks.favoriteHits.slice(0, 2).join(', ')}`
                  : null,
                ks.softViolations.length > 0
                  ? `dislikes ${ks.softViolations.map((v) => v.foodName).join(', ')}`
                  : null,
                ks.hardViolations.length > 0
                  ? `can't have ${ks.hardViolations.map((v) => v.foodName).join(', ')}`
                  : null,
              ]
                .filter(Boolean)
                .join(' - ');

              return (
                <li key={ks.kidId} className="text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{ks.kidName}</span>
                    <span className="text-muted-foreground tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${tone}`}
                      style={{ width: `${pct}%` }}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${ks.kidName} satisfaction`}
                    />
                  </div>
                  {summary && <p className="text-muted-foreground mt-0.5">{summary}</p>}
                </li>
              );
            })}
          </ul>

          {/* Swap suggestions */}
          {result.swaps.length > 0 && (
            <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/40 p-2.5">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">
                Suggested swaps
              </p>
              <ul className="text-xs space-y-0.5">
                {result.swaps.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.kidName}:</span> swap {s.swapOutFoodName}{' '}
                    {'->'} {s.swapInFoodName}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Split-plate plan */}
          {result.splitPlates.length > 0 && (
            <div className="mt-3 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200/50 dark:border-orange-900/40 p-2.5">
              <p className="text-xs font-semibold text-orange-900 dark:text-orange-200 mb-1">
                Split plate plan
              </p>
              <ul className="text-xs space-y-1">
                {result.splitPlates.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">{p.kidName}:</span>
                    <ul className="ml-3 list-disc list-inside">
                      {p.modifications.map((m, j) => (
                        <li key={j}>{m}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => onUse(result)}
              variant={isAccepted ? 'outline' : 'default'}
              aria-label={`Use ${result.recipeName} for tonight`}
            >
              {isAccepted ? (
                <>
                  <Check className="h-4 w-4 mr-1" aria-hidden="true" />
                  Saved
                </>
              ) : (
                'Use this meal'
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCook(result)}
              aria-label={`Open cooking guide for ${result.recipeName}`}
            >
              <ChefHat className="h-4 w-4 mr-1" aria-hidden="true" />
              Cook now
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
