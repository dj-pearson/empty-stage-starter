import { Scale } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Kid } from '@/types';
import type { SolverHistoryEntry } from '@/lib/siblingConstraintSolver';
import { computeFairnessBoosts } from '@/lib/siblingConstraintSolver';
import { useMemo } from 'react';

interface Props {
  kids: Kid[];
  history: SolverHistoryEntry[];
}

/**
 * Small banner that calls out which kid's preferences have been "losing"
 * recently. Renders nothing if the history is too thin to be meaningful.
 */
export function FairnessIndicator({ kids, history }: Props) {
  const boosts = useMemo(
    () =>
      computeFairnessBoosts(
        kids.map((k) => k.id),
        history
      ),
    [kids, history]
  );

  const losingKid = useMemo(() => {
    const sorted = Object.entries(boosts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return null;
    const [id, boost] = sorted[0];
    if (boost < 0.05) return null;
    return kids.find((k) => k.id === id) ?? null;
  }, [boosts, kids]);

  if (!losingKid) return null;

  return (
    <Card className="border-amber-200/40 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/40">
      <CardContent className="flex items-start gap-3 py-3">
        <Scale
          className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="text-sm">
          <p className="font-medium">{losingKid.name}'s turn to win.</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Their preferences have lost out the past few meals - we'll boost recipes that suit them.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
