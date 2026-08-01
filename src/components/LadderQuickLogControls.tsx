/**
 * US-600: one-tap exposure logging, inline on a plan entry (web).
 *
 * The counterpart of the iOS `LadderQuickLogControls`. The existing detailed
 * dialog asks for stage, outcome, bites, amount, mood before, mood after,
 * prep and notes — the right tool for a calm Sunday review and the wrong one
 * for 6pm on a Tuesday, which is when the exposure actually happens. Because
 * the plan entry already knows the rung, the log collapses to three buttons.
 *
 * Deliberately no "try again" affordance: the ladder decides when a food
 * comes back, and the answer after a refusal is never "right now".
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RUNG_META } from '@/lib/exposureLadder';
import type { LadderRow, QuickLogArgs, QuickLogResult } from '@/hooks/useFoodLadder';

const RESULTS: QuickLogResult[] = ['accepted', 'held', 'refused'];

interface Props {
  row: LadderRow;
  foodName: string;
  planEntryId?: string | null;
  mealSlot?: string | null;
  onLog: (args: QuickLogArgs) => Promise<boolean>;
  /** Renders the rung above the controls. Off where the caller shows it. */
  showRung?: boolean;
}

export function LadderQuickLogControls({
  row,
  foodName,
  planEntryId,
  mealSlot,
  onLog,
  showRung = true,
}: Props) {
  const { t } = useTranslation();
  const [logging, setLogging] = useState(false);
  const meta = RUNG_META[row.currentRung];
  const rungLabel = t(`foodLadder.rungs.${row.currentRung}`, meta.label);

  const handle = async (result: QuickLogResult) => {
    setLogging(true);
    try {
      const ok = await onLog({ row, result, planEntryId, mealSlot });
      toast[ok ? 'success' : 'error'](
        t(ok ? 'foodLadder.quickLog.saved' : 'foodLadder.quickLog.failed')
      );
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {showRung ? (
        <p className="text-xs text-muted-foreground">
          <span aria-hidden="true">{meta.emoji} </span>
          {rungLabel}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {RESULTS.map((result) => (
          <Button
            key={result}
            size="sm"
            // "Not today" stays neutral rather than destructive. A child
            // declining a food is information, not an error state, and
            // styling it as a failure is the pressure this feature removes.
            variant={result === 'accepted' ? 'default' : 'outline'}
            disabled={logging}
            onClick={() => handle(result)}
            aria-label={t(`foodLadder.quickLog.${result}`) + ` — ${foodName}`}
            title={t('foodLadder.quickLog.srHint', { rung: rungLabel })}
          >
            {t(`foodLadder.quickLog.${result}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
