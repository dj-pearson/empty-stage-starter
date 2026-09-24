/**
 * What Insights shows before there is anything trustworthy to summarise.
 *
 * Mirrors FoodTrackerGate: a failed kids load with nothing cached offers Retry
 * and nothing else; an unsettled load is a skeleton (never "No children yet",
 * and never a section computed from an empty foods slice); a settled, empty
 * list is the only place "Add child" belongs. A failed refresh over cached
 * kids, or being offline, keeps the page and says it may be stale.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, UserPlus, WifiOff } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFoods, useKids } from '@/contexts/AppContext';
import '@/i18n/appLocale';

function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function InsightsSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4" data-testid="insights-skeleton">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border p-4" aria-hidden="true">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function InsightsGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { kids, kidsHydrated, kidsLoadError, refreshKids } = useKids();
  const { foodsHydrated } = useFoods();
  const online = useOnline();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      await refreshKids();
    } finally {
      setRetrying(false);
    }
  };

  // A failed load with nothing cached: Retry is the only honest action.
  if (kidsLoadError && kids.length === 0) {
    return (
      <Alert variant="destructive">
        <h2 className="mb-1 text-base font-semibold leading-none">
          {t('insightsPage.states.loadErrorTitle', { defaultValue: "Couldn't load your children" })}
        </h2>
        <AlertDescription className="space-y-3">
          <p>{t('insightsPage.states.loadErrorBody', { defaultValue: 'Check your connection and try again.' })}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void retry()} disabled={retrying}>
            <RefreshCw
              className={retrying ? 'mr-2 h-4 w-4 motion-safe:animate-spin' : 'mr-2 h-4 w-4'}
              aria-hidden="true"
            />
            {t('insightsPage.states.retry', { defaultValue: 'Retry' })}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!kidsHydrated || !foodsHydrated) {
    return <InsightsSkeleton label={t('insightsPage.states.loading', { defaultValue: 'Loading insights' })} />;
  }

  if (kids.length === 0) {
    return (
      <section
        aria-labelledby="insights-empty-title"
        className="rounded-xl border border-dashed border-border px-6 py-12 text-center"
      >
        <h2 id="insights-empty-title" className="text-lg font-semibold">
          {t('insightsPage.states.emptyTitle', { defaultValue: 'No children yet' })}
        </h2>
        <p className="mx-auto mt-2 max-w-prose text-sm text-muted-foreground">
          {t('insightsPage.states.emptyBody', {
            defaultValue: 'Add a child and log a few meals. Insights build from what you record.',
          })}
        </p>
        <Button asChild className="mt-6">
          <Link to="/dashboard/kids?add=1">
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t('insightsPage.states.addChild', { defaultValue: 'Add child' })}
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <>
      {kidsLoadError ? (
        <p className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground" role="status">
          <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {t('insightsPage.states.stale', {
              defaultValue: "Couldn't refresh just now, so this may be out of date.",
            })}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void retry()} disabled={retrying}>
            {t('insightsPage.states.retry', { defaultValue: 'Retry' })}
          </Button>
        </p>
      ) : null}
      {!online ? (
        <p className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground" role="status">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('insightsPage.states.offline', { defaultValue: 'Offline: showing what this device last saw.' })}
        </p>
      ) : null}
      {children}
    </>
  );
}
