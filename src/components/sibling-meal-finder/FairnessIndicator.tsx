import { Scale } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Kid } from '@/types';
import type { SolverHistoryEntry } from '@/lib/siblingConstraintSolver';
import { computeFairnessBoosts } from '@/lib/siblingConstraintSolver';
import '@/i18n/appLocale';

interface Props {
  kids: Kid[];
  history: SolverHistoryEntry[];
}

/**
 * One inline line naming the kid whose preferences have been losing recently.
 * Renders nothing if the history is too thin to be meaningful.
 */
export function FairnessIndicator({ kids, history }: Props) {
  const { t } = useTranslation();
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
    <p
      className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-foreground"
      data-testid="fairness-indicator"
    >
      <Scale className="h-4 w-4 shrink-0 mt-0.5 text-warning" aria-hidden="true" />
      <span>
        <span className="font-medium">
          {t('siblingMealFinder.fairness.title', {
            name: losingKid.name,
            defaultValue: '{{name}} gets first pick tonight',
          })}
        </span>{' '}
        <span className="text-muted-foreground">
          {t('siblingMealFinder.fairness.body', {
            defaultValue: "Their favorites lost out the last few meals, so dishes they like rank higher.",
          })}
        </span>
      </span>
    </p>
  );
}
