import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { UsageStats } from '@/hooks/useUsageStats';
import { FREE_PLAN_COUNT_LIMITS } from '@/lib/planInclusions';
import { formatPlanDate } from '@/lib/subscription-helpers';
import '@/i18n/appLocale';

export type CancelResult = { success: boolean; error?: string };

export interface CancelSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  /** current_period_end: the last day of paid access. */
  periodEnd: string | null;
  trialing: boolean;
  trialEnd?: string | null;
  stats: UsageStats | null;
  onConfirm: () => Promise<CancelResult | void>;
}

/**
 * Confirm a Stripe cancellation, saying exactly what changes and what does
 * not. The dialog stays open until the request settles, so a failure is shown
 * here rather than in a toast behind a dialog that has already gone.
 */
export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  planName,
  periodEnd,
  trialing,
  trialEnd,
  stats,
  onConfirm,
}: CancelSubscriptionDialogProps) {
  const { t, i18n } = useTranslation();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (open) setFailure(null);
  }, [open]);

  const date = (iso: string | null | undefined) => (iso ? formatPlanDate(iso, i18n.language) || null : null);
  const endDate = date(periodEnd);
  const trialDate = date(trialEnd ?? periodEnd);

  const body = trialing
    ? trialDate
      ? t('billing.cancel.bodyTrial', { defaultValue: "You won't be charged. Your trial ends {{date}}.", date: trialDate })
      : t('billing.cancel.bodyTrialNoDate', { defaultValue: "You won't be charged. Your trial ends at the end of this period." })
    : endDate
      ? t('billing.cancel.body', { defaultValue: '{{plan}} stays active until {{date}}, then you move to Free.', plan: planName, date: endDate })
      : t('billing.cancel.bodyNoDate', { defaultValue: '{{plan}} stays active until the end of this billing period, then you move to Free.', plan: planName });

  const consequences: string[] = [];
  if (stats) {
    const kids = stats.usage.children.current;
    if (kids > FREE_PLAN_COUNT_LIMITS.children) {
      consequences.push(
        t('billing.cancel.overChildren', {
          defaultValue: 'You have {{count}} child profiles; Free allows {{limit}}. You can still see them all, but not add more.',
          count: kids,
          limit: FREE_PLAN_COUNT_LIMITS.children,
        }),
      );
    }
    const pantry = stats.usage.pantry_foods.current;
    if (pantry > FREE_PLAN_COUNT_LIMITS.pantry_foods) {
      consequences.push(
        t('billing.cancel.overPantry', {
          defaultValue: 'You have {{count}} pantry foods; Free allows {{limit}}. New foods wait until you are under it.',
          count: pantry,
          limit: FREE_PLAN_COUNT_LIMITS.pantry_foods,
        }),
      );
    }
  }
  consequences.push(t('billing.cancel.aiCoach', { defaultValue: 'AI coach questions stop.' }));
  consequences.push(t('billing.cancel.kept', { defaultValue: 'Your kids, foods and history are kept.' }));

  const confirm = async (event: MouseEvent<HTMLButtonElement>) => {
    // Radix closes on Action click; hold it open until the server answers.
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFailure(null);
    try {
      const result = await onConfirm();
      if (result && !result.success) {
        setFailure(result.error || t('billing.cancel.failed', { defaultValue: "Couldn't cancel. Your plan hasn't changed; try again." }));
        return;
      }
      onOpenChange(false);
    } catch {
      setFailure(t('billing.cancel.failed', { defaultValue: "Couldn't cancel. Your plan hasn't changed; try again." }));
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!pending ? onOpenChange(next) : undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('billing.cancel.title', { defaultValue: 'Cancel {{plan}}?', plan: planName })}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {consequences.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {failure && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span>{failure}</span>
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('billing.cancel.keep', { defaultValue: 'Keep {{plan}}', plan: planName })}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirm}
            disabled={pending}
            aria-busy={pending ? 'true' : undefined}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
            <span>{t('billing.cancel.confirm', { defaultValue: 'Cancel plan' })}</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
