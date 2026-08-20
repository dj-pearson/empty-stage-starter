import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Gauge, Info, RefreshCw, Zap } from 'lucide-react';
import { useState } from 'react';
import { invokeEdgeFunction } from '@/lib/edge-functions';

/**
 * US-553: the performance tab, lifted verbatim out of SEOManager.
 *
 * Presentational and props-down like its siblings; all state stays in
 * SEOManager, so this moves where the JSX lives and nothing else.
 */
/**
 * US-553: this tab owns its own results. Nothing outside it ever read them --
 * SEOManager only held the state to hand it straight back down -- and Radix
 * keeps every TabsContent mounted, so moving it here does not make it reset
 * when the user switches tabs.
 */
export function SeoPerformanceTab() {
  const [coreWebVitalsResults, setCoreWebVitalsResults] = useState<Record<string, unknown> | null>(
    null,
  );
  const [isCheckingWebVitals, setIsCheckingWebVitals] = useState(false);

  return (
<TabsContent value="performance" className="space-y-4">
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Gauge className="h-5 w-5" />
        Core Web Vitals
      </CardTitle>
      <CardDescription>
        Monitor page performance and Google's Core Web Vitals (LCP, FID, CLS)
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Enter URL to test (leave empty for homepage)"
          defaultValue={window.location.origin}
          id="cwv-url"
        />
        <Button
          disabled={isCheckingWebVitals}
          onClick={async () => {
            const url = (document.getElementById('cwv-url') as HTMLInputElement)?.value || window.location.origin;

            setIsCheckingWebVitals(true);
            setCoreWebVitalsResults(null);

            try {
              const { data, error } = await invokeEdgeFunction('gsc-fetch-core-web-vitals', {
                body: { siteUrl: url }
              });

              if (error) throw error;

              if (data?.success) {
                setCoreWebVitalsResults({
                  success: true,
                  data: data.data
                });
              } else {
                throw new Error(data?.error || 'Failed to check Core Web Vitals');
              }
            } catch (error: unknown) {
              setCoreWebVitalsResults({
                success: false,
                error: error.message || 'Failed to check Core Web Vitals'
              });
            } finally {
              setIsCheckingWebVitals(false);
            }
          }}
        >
          {isCheckingWebVitals ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Check Performance
            </>
          )}
        </Button>
      </div>

      <div className="rounded-lg border p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground">
          <Info className="h-4 w-4 inline mr-2" />
          Uses your existing Google Search Console connection to fetch real user data from Chrome UX Report.
          Add a PageSpeed API key for more detailed metrics.
        </p>
      </div>

      <div className="text-sm text-muted-foreground mt-4">
        <h4 className="font-semibold mb-2">What are Core Web Vitals?</h4>
        <ul className="space-y-1 ml-4">
          <li>• <strong>LCP</strong>: Largest Contentful Paint - Loading speed (Good: ≤2.5s)</li>
          <li>• <strong>FID/INP</strong>: First Input Delay/Interaction - Interactivity (Good: ≤100ms)</li>
          <li>• <strong>CLS</strong>: Cumulative Layout Shift - Visual stability (Good: ≤0.1)</li>
        </ul>
      </div>

      {coreWebVitalsResults && (
        <div className="mt-4">
          {coreWebVitalsResults.success ? (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3 mb-4">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-green-900 mb-1">Core Web Vitals Check Complete</h4>
                    <p className="text-sm text-green-800">Data Source: {coreWebVitalsResults.data.dataSource || 'N/A'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card rounded p-3">
                    <div className="text-sm text-muted-foreground">Performance Score</div>
                    <div className="text-2xl font-bold">{coreWebVitalsResults.data.metrics?.mobile_performance_score || 'N/A'}</div>
                  </div>
                  <div className="bg-card rounded p-3">
                    <div className="text-sm text-muted-foreground">LCP</div>
                    <div className="text-2xl font-bold">
                      {coreWebVitalsResults.data.metrics?.mobile_lcp ? `${coreWebVitalsResults.data.metrics.mobile_lcp}s` : 'N/A'}
                    </div>
                    {coreWebVitalsResults.data.metrics?.lcp_status && (
                      <Badge variant={coreWebVitalsResults.data.metrics.lcp_status === 'good' ? 'default' : 'destructive'}>
                        {coreWebVitalsResults.data.metrics.lcp_status}
                      </Badge>
                    )}
                  </div>
                  <div className="bg-card rounded p-3">
                    <div className="text-sm text-muted-foreground">CLS</div>
                    <div className="text-2xl font-bold">{coreWebVitalsResults.data.metrics?.mobile_cls || 'N/A'}</div>
                    {coreWebVitalsResults.data.metrics?.cls_status && (
                      <Badge variant={coreWebVitalsResults.data.metrics.cls_status === 'good' ? 'default' : 'destructive'}>
                        {coreWebVitalsResults.data.metrics.cls_status}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-red-900 mb-1">Check Failed</h4>
                  <p className="text-sm text-red-800">{coreWebVitalsResults.error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </CardContent>
  </Card>
</TabsContent>
  );
}
