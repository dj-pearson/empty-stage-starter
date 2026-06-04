/**
 * Picky-Eater Win Network panel (US-296).
 *
 * Shows what other families have successfully chained TO from the same
 * source food the parent is currently looking at. K-anonymity (>=5
 * contributions) is enforced server-side - if no transition meets the
 * threshold yet, we render an "early days" hint instead of nothing so
 * the parent understands why the panel is empty.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Network, Sparkles, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  bucketPickiness,
  fetchTopChainNetworkTargets,
  type ChainNetworkTarget,
  type PickinessBucket,
} from '@/lib/chainNetwork';
import {
  applyPickyWinKAnonGuard,
  COMMUNITY_WINS_MIN_SAMPLE_SIZE,
} from '@/lib/pickyWinGuard';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { analytics } from '@/lib/analytics';

interface Props {
  /** Source food name the parent has selected (e.g. "Goldfish crackers"). */
  sourceFoodName: string | null | undefined;
  /** Optional pickiness level - bucketed for the read query. */
  pickinessLevel?: string | null;
  /** Optional cap. Defaults to 5. */
  limit?: number;
  /** Hide entirely when no source is selected. */
  hideWhenEmpty?: boolean;
}

export function WinNetworkPanel({
  sourceFoodName,
  pickinessLevel,
  limit = 5,
  hideWhenEmpty,
}: Props) {
  const [targets, setTargets] = useState<ChainNetworkTarget[] | null>(null);
  const [loading, setLoading] = useState(false);

  // US-296: gate the dedicated community-wins surface behind a feature
  // flag (default OFF per AC). When ON we tighten the client-side
  // k-anonymity floor from the server's permissive 5 to the AC's 20.
  // When OFF the panel is rendered (back-compat with the existing inline
  // 5-floor) so existing users still see the data they're used to.
  const communityWinsEnabled = useFeatureFlag('picky_win_network', false);

  const bucket: PickinessBucket = useMemo(
    () => bucketPickiness(pickinessLevel ?? null),
    [pickinessLevel]
  );

  useEffect(() => {
    let cancelled = false;
    if (!sourceFoodName || !sourceFoodName.trim()) {
      setTargets(null);
      return;
    }
    setLoading(true);
    (async () => {
      const rows = await fetchTopChainNetworkTargets(
        sourceFoodName,
        bucket === 'unknown' ? undefined : bucket,
        limit
      );
      if (cancelled) return;
      // When the dedicated surface is enabled, apply the AC's stricter
      // 20-floor on top of the server's 5-floor.
      const guarded = communityWinsEnabled
        ? applyPickyWinKAnonGuard(rows, { minSampleSize: COMMUNITY_WINS_MIN_SAMPLE_SIZE })
        : rows;
      setTargets(guarded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceFoodName, bucket, limit, communityWinsEnabled]);

  // Telemetry: fire when a real row hits the screen.
  const cardShownRef = useRef<string>('');
  useEffect(() => {
    if (!targets || targets.length === 0) return;
    const fingerprint = `${sourceFoodName ?? ''}|${targets.length}`;
    if (cardShownRef.current === fingerprint) return;
    cardShownRef.current = fingerprint;
    for (const t of targets) {
      analytics.trackEvent('picky_win_card_shown', {
        target_food_key: t.targetFoodKey,
        sample_size: t.totalCount,
        success_rate: Math.round(t.successRate),
        pickiness_bucket: t.pickinessBucket,
      });
    }
  }, [targets, sourceFoodName]);

  if (!sourceFoodName) {
    if (hideWhenEmpty) return null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" aria-hidden="true" />
            Other families' wins
          </CardTitle>
          <CardDescription>
            Pick a food on the left to see what other families chained from it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" aria-hidden="true" />
          Other families' wins
        </CardTitle>
        <CardDescription>
          Anonymized successes from families starting from{' '}
          <span className="font-medium">{sourceFoodName}</span>
          {bucket !== 'unknown' && (
            <>
              {' '}
              with similar pickiness (<span className="capitalize">{bucket}</span>)
            </>
          )}
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && targets === null && (
          <div className="space-y-2" aria-live="polite" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!loading && targets && targets.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Early days for this source food.
            </p>
            <p className="mt-1">
              {communityWinsEnabled
                ? `We need at least ${COMMUNITY_WINS_MIN_SAMPLE_SIZE} anonymized successes for this aversion/age combo before showing trends. Be the first to share an outcome.`
                : `We need at least 5 anonymized successes from other families before showing trends here. Log a successful try-bite and you'll be the first to seed the network.`}
            </p>
          </div>
        )}

        {!loading && targets && targets.length > 0 && (
          <ul className="space-y-2" aria-label="Top chained foods from other families">
            {targets.map((t) => {
              const pct = Math.round(t.successRate);
              const tone =
                pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
              return (
                <li
                  key={`${t.targetFoodKey}-${t.pickinessBucket}`}
                  className="rounded-md border p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium capitalize truncate">{t.targetFoodKey}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Users className="h-3 w-3" aria-hidden="true" />
                      {t.successCount} of {t.totalCount} families succeeded
                      {t.pickinessBucket !== 'unknown' && (
                        <>
                          {' '}
                          - <span className="capitalize">{t.pickinessBucket}</span> pickiness
                        </>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="bg-muted tabular-nums">
                      {pct}%
                    </Badge>
                    <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${tone}`}
                        style={{ width: `${pct}%` }}
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${pct}% success rate`}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs gap-1 mt-1"
                      onClick={() => {
                        analytics.trackEvent('picky_win_chain_adopted', {
                          target_food_key: t.targetFoodKey,
                          sample_size: t.totalCount,
                          pickiness_bucket: t.pickinessBucket,
                        });
                        toast.success(`Saved "${t.targetFoodKey}" to your try-bite list.`);
                      }}
                      aria-label={`Try ${t.targetFoodKey} as a try-bite`}
                    >
                      Try this
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
