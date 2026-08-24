import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { LayoutList, RefreshCw } from 'lucide-react';
import type { CoverageBucket, CoverageReport } from '@/lib/seo/indexCoverage';

/**
 * US-653: index coverage reconciliation.
 *
 * Presentational and props-down, matching the other extracted SEO tabs.
 */
export interface SeoIndexCoverageTabProps {
  report: CoverageReport | null;
  summary: string[];
  isLoading: boolean;
  windowDays: number;
  onLoad: () => void;
}

interface BucketSpec {
  key: keyof Pick<
    CoverageReport,
    | 'prerenderBudgetSkipped'
    | 'declaredNotPrerendered'
    | 'prerenderedNotDeclared'
    | 'impressedNotDeclared'
    | 'declaredNeverImpressed'
  >;
  label: string;
  meaning: string;
}

/** Ordered by how actionable each one is, not by size. */
const BUCKETS: BucketSpec[] = [
  {
    key: 'prerenderBudgetSkipped',
    label: 'Prerender budget ran out',
    meaning:
      'The build discovered these and never rendered them. They ship as client-rendered shells. Raise PRERENDER_BUDGET_MS or narrow the discovery limits.',
  },
  {
    key: 'declaredNotPrerendered',
    label: 'In the sitemap, no static HTML',
    meaning: 'A crawler that does not run JavaScript gets an empty shell for these.',
  },
  {
    key: 'prerenderedNotDeclared',
    label: 'Prerendered, not in the sitemap',
    meaning: 'Built and shipped but never submitted. Usually a missing sitemap entry.',
  },
  {
    key: 'impressedNotDeclared',
    label: 'Ranking, not in the sitemap',
    meaning: 'Google found these on its own. Either submit them or work out why they exist.',
  },
  {
    key: 'declaredNeverImpressed',
    label: 'Submitted, never shown',
    meaning:
      'No impressions in the window. A few recent URLs is normal; a lot means a crawl or quality problem.',
  },
];

function BucketRow({ spec, value }: { spec: BucketSpec; value: CoverageBucket }) {
  return (
    <div className="border-b py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <h4 className="font-medium">{spec.label}</h4>
        <span className="tabular-nums text-lg font-semibold">{value.count.toLocaleString()}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{spec.meaning}</p>
      {value.sample.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {value.sample.map((route) => (
            <li key={route} className="font-mono text-xs text-muted-foreground">
              {route}
            </li>
          ))}
          {value.count > value.sample.length && (
            <li className="text-xs text-muted-foreground">
              and {(value.count - value.sample.length).toLocaleString()} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function SeoIndexCoverageTab({
  report,
  summary,
  isLoading,
  windowDays,
  onLoad,
}: SeoIndexCoverageTabProps) {
  return (
    <TabsContent value="index-coverage" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LayoutList className="h-5 w-5" aria-hidden="true" />
                Index coverage
              </CardTitle>
              <CardDescription>
                The sitemap says what we declare, the prerender manifest says what we built, and
                Search Console says what Google actually saw over {windowDays} days. Where those
                three disagree is where pages go missing.
              </CardDescription>
            </div>
            <Button onClick={onLoad} disabled={isLoading} variant="outline">
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {report ? 'Refresh' : 'Run report'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!report && !isLoading && (
            <p className="text-sm text-muted-foreground">
              Not run yet. It fetches the live sitemap and prerender manifest and reads the Search
              Console window, so it runs on request.
            </p>
          )}

          {report && (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {report.totals.sitemap.toLocaleString()} URLs declared ·{' '}
                {report.manifestMissing
                  ? 'prerender manifest unavailable'
                  : `${report.totals.prerendered.toLocaleString()} prerendered`}{' '}
                · {report.totals.impressed.toLocaleString()} drew impressions
              </p>

              {report.manifestMissing && (
                <p className="mb-4 rounded-lg bg-muted/40 p-4 text-sm">
                  No <code className="font-mono">/prerender-manifest.json</code>. The last deploy
                  either predates it or did not run <code className="font-mono">npm run build</code>
                  , so the two prerender rows below are blank rather than zero.
                </p>
              )}

              {summary.length > 0 && (
                <ul className="mb-4 space-y-2">
                  {summary.map((line) => (
                    <li key={line} className="text-sm">
                      {line}
                    </li>
                  ))}
                </ul>
              )}

              <div>
                {BUCKETS.map((spec) => (
                  <BucketRow key={spec.key} spec={spec} value={report[spec.key]} />
                ))}
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                What this cannot tell you is crawl frequency or crawl budget spend. That needs
                Googlebot hits from Cloudflare Logpush, which is an infrastructure decision and is
                not wired up.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
