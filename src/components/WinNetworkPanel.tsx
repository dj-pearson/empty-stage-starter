/**
 * Picky-Eater Win Network panel (US-296).
 *
 * Shows what other families have successfully chained TO from the same
 * source food the parent is currently looking at. K-anonymity (>=5
 * contributions) is enforced server-side - if no transition meets the
 * threshold yet, we render an "early days" hint instead of nothing so
 * the parent understands why the panel is empty.
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Network, Sparkles, Users } from 'lucide-react';
import {
  bucketPickiness,
  fetchTopChainNetworkTargets,
  type ChainNetworkTarget,
  type PickinessBucket,
} from '@/lib/chainNetwork';

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
      setTargets(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceFoodName, bucket, limit]);

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
              We need at least 5 anonymized successes from other families before showing trends
              here. Log a successful try-bite and you'll be the first to seed the network.
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
                  <div className="shrink-0 text-right">
                    <Badge variant="secondary" className="bg-muted tabular-nums">
                      {pct}%
                    </Badge>
                    <div className="mt-1 h-1.5 w-16 bg-muted rounded-full overflow-hidden">
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
