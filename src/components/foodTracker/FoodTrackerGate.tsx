/**
 * What Food Tracker shows before there is a child to track.
 *
 * Three states that used to collapse into one: the kids load has not settled
 * (a skeleton, never "No children yet", which flashed for every parent on a
 * cold load), the load failed (Retry, and no add-child button, because adding
 * a child the parent already has is the wrong fix for a dropped connection),
 * and a settled, error-free, empty list (the only place "Add child" belongs).
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, UserPlus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useKids } from '@/contexts/AppContext';
import '@/i18n/appLocale';

export function FoodTrackerSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4" data-testid="food-tracker-skeleton">
      <span className="sr-only">{label}</span>
      <div className="flex gap-2" aria-hidden="true">
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-28 rounded-full" />
      </div>
      <Skeleton className="h-5 w-56" aria-hidden="true" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border p-4" aria-hidden="true">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-3 gap-1.5">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FoodTrackerGate({ onAddChild, children }: { onAddChild: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const { kids, kidsHydrated, kidsLoadError, refreshKids } = useKids();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await refreshKids();
    } finally {
      setRetrying(false);
    }
  };

  const errorAlert = kidsLoadError ? (
    <Alert variant="destructive">
      <h2 className="mb-1 text-base font-semibold leading-none">
        {t('foodTracker.gate.loadErrorTitle', { defaultValue: "Couldn't load your children" })}
      </h2>
      <AlertDescription className="space-y-3">
        <p>{t('foodTracker.gate.loadErrorBody', { defaultValue: 'Check your connection and try again.' })}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void retry()} disabled={retrying}>
          <RefreshCw
            className={retrying ? 'mr-2 h-4 w-4 motion-safe:animate-spin' : 'mr-2 h-4 w-4'}
            aria-hidden="true"
          />
          {t('foodTracker.gate.retry', { defaultValue: 'Retry' })}
        </Button>
      </AlertDescription>
    </Alert>
  ) : null;

  // A failed load with nothing cached: Retry is the only honest action.
  if (errorAlert && kids.length === 0) return errorAlert;

  if (!kidsHydrated) {
    return <FoodTrackerSkeleton label={t('foodTracker.gate.loadingLabel', { defaultValue: 'Loading your children' })} />;
  }

  if (kids.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <h2 className="text-lg font-semibold">
          {t('foodTracker.gate.noKidsTitle', { defaultValue: 'No children yet' })}
        </h2>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
          {t('foodTracker.gate.noKidsBody', {
            defaultValue: 'Add a child to start tracking the foods they are learning to eat.',
          })}
        </p>
        <Button type="button" className="mt-6" onClick={onAddChild}>
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('foodTracker.gate.addFirstChild', { defaultValue: 'Add child' })}
        </Button>
      </section>
    );
  }

  // A failed refresh over a cached list: keep what the parent can see, and
  // say it may be stale.
  return (
    <>
      {errorAlert ? <div className="mb-4">{errorAlert}</div> : null}
      {children}
    </>
  );
}
