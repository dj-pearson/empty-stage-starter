import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { TabsContent } from '@/components/ui/tabs';
import { FileJson, FileSpreadsheet, RefreshCw, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AuditResult } from '@/lib/seoScore';

/**
 * US-553: the audit tab, lifted verbatim out of SEOManager.
 * Presentational and props-down; all state stays in SEOManager.
 */
export interface SeoAuditTabProps {
  auditResults: AuditResult[];
  runComprehensiveAudit: () => void | Promise<void>;
  exportAuditReport: (format: 'json' | 'csv') => void | Promise<void>;
  getStatusIcon: (status: string) => ReactNode;
}

export function SeoAuditTab({
  auditResults,
  runComprehensiveAudit,
  exportAuditReport,
  getStatusIcon,
}: SeoAuditTabProps) {
  return (
<TabsContent value="audit" className="space-y-4">
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            SEO Audit Results
          </CardTitle>
          <CardDescription>
            Comprehensive analysis of {auditResults.length} SEO factors
          </CardDescription>
        </div>
        {auditResults.length > 0 && (
          <div className="flex gap-2">
            <Button onClick={() => exportAuditReport("json")} variant="outline" size="sm">
              <FileJson className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
            <Button onClick={() => exportAuditReport("csv")} variant="outline" size="sm">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        )}
      </div>
    </CardHeader>
    <CardContent>
      {auditResults.length === 0 ? (
        <div className="text-center py-12">
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No audit results yet</h3>
          <p className="text-muted-foreground mb-4">
            Click "Run Full Audit" to analyze 50+ SEO factors
          </p>
          <Button onClick={runComprehensiveAudit}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Start SEO Audit
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {["Technical SEO", "On-Page SEO", "Performance", "Mobile & Accessibility", "Security", "Content Quality"].map(
            (category) => {
              const categoryResults = auditResults.filter((r) => r.category === category);
              if (categoryResults.length === 0) return null;

              const passed = categoryResults.filter((r) => r.status === "passed").length;
              const warnings = categoryResults.filter((r) => r.status === "warning").length;
              const failed = categoryResults.filter((r) => r.status === "failed").length;

              return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg">{category}</h4>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-600">{passed} passed</span>
                      <span className="text-yellow-600">{warnings} warnings</span>
                      <span className="text-red-600">{failed} failed</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {categoryResults.map((result, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="mt-0.5">{getStatusIcon(result.status)}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{result.item}</span>
                            <Badge variant={result.impact === "high" ? "destructive" : result.impact === "medium" ? "default" : "secondary"} className="text-xs">
                              {result.impact}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                          {result.fix && (
                            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded text-sm">
                              <strong className="text-blue-700 dark:text-blue-300">How to fix:</strong>{" "}
                              <span className="text-blue-600 dark:text-blue-400">{result.fix}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Separator />
                </div>
              );
            }
          )}
        </div>
      )}
    </CardContent>
  </Card>
</TabsContent>
  );
}