import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TabsContent } from '@/components/ui/tabs';
import { RefreshCw, Split } from 'lucide-react';
import type { CannibalizationFinding } from '@/lib/seo/cannibalization';

/**
 * US-651: the cannibalization report.
 *
 * Presentational and props-down, matching the other extracted SEO tabs. The
 * query lives in useSeoCannibalization.
 */
export interface SeoCannibalizationTabProps {
  findings: CannibalizationFinding[];
  isLoading: boolean;
  loaded: boolean;
  windowDays: number;
  onLoad: () => void;
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

export function SeoCannibalizationTab({
  findings,
  isLoading,
  loaded,
  windowDays,
  onLoad,
}: SeoCannibalizationTabProps) {
  const totalSplit = findings.reduce((sum, f) => sum + f.impressionsSplit, 0);

  return (
    <TabsContent value="cannibalization" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Split className="h-5 w-5" aria-hidden="true" />
                Keyword cannibalization
              </CardTitle>
              <CardDescription>
                Queries where more than one EatPal URL drew impressions over the last {windowDays}{' '}
                days. Google has to pick one, the clicks split, and neither page accumulates the
                signal it needs.
              </CardDescription>
            </div>
            <Button onClick={onLoad} disabled={isLoading} variant="outline">
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {loaded ? 'Refresh' : 'Run report'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!loaded && !isLoading && (
            <p className="text-sm text-muted-foreground">
              Not run yet. This reads every gsc_page_performance row in the window, so it runs on
              request rather than when the panel opens.
            </p>
          )}

          {loaded && findings.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No contested queries in the window. Every query with enough impressions to matter has
              one clear owner.
            </p>
          )}

          {findings.length > 0 && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {findings.length} contested {findings.length === 1 ? 'query' : 'queries'},{' '}
                {totalSplit.toLocaleString()} impressions split away from the leading page.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Query</TableHead>
                      <TableHead className="text-right">Split</TableHead>
                      <TableHead>Competing URLs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {findings.map((f) => (
                      <TableRow key={f.query} className="align-top">
                        <TableCell className="font-medium">{f.query}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {f.impressionsSplit.toLocaleString()}
                          <span className="block text-xs text-muted-foreground">
                            of {f.totalImpressions.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ul className="space-y-1">
                            {f.urls.map((u) => (
                              <li key={u.pageUrl} className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs">{u.pageUrl}</span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {pct(u.share)} · {u.impressions.toLocaleString()} impr
                                </span>
                                {u.indexable === false && (
                                  <Badge variant="secondary" className="text-xs">
                                    noindex
                                  </Badge>
                                )}
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                A competitor marked noindex is below MAX_INDEXABLE_TIER in the pSEO gate. That is a
                tier problem, not a merge candidate: it should not be drawing these impressions at
                all.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
