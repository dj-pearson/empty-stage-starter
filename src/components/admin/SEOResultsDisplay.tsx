import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle, XCircle, Info } from "lucide-react";
import type {
  CrawlResultsSummary,
  ImageResultsSummary,
  RedirectAnalysisResults,
  DuplicateAnalysisResults,
  SecurityAnalysisResults,
  LinkStructureResults,
  MobileAnalysisResults,
  PerformanceBudgetResults,
} from "@/types/seo-types";

export const CrawlResults = ({ results }: { results: CrawlResultsSummary }) => {
  if (!results) return null;
  
  const summary = results.summary;
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Crawl Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Pages</p>
            <p className="text-2xl font-bold">{summary.totalPages}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pages with Issues</p>
            <p className="text-2xl font-bold text-destructive">{summary.pagesWithIssues}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Orphaned Pages</p>
            <p className="text-2xl font-bold text-orange-500">{summary.orphanedPages}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Load Time</p>
            <p className="text-2xl font-bold">{summary.avgLoadTime}ms</p>
          </div>
        </div>
        
        <div>
          <p className="text-sm font-semibold mb-2">Issues Breakdown</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Badge variant="destructive">Critical: {summary.issueBreakdown.critical}</Badge>
            <Badge variant="destructive" className="bg-orange-500">High: {summary.issueBreakdown.high}</Badge>
            <Badge variant="secondary">Medium: {summary.issueBreakdown.medium}</Badge>
            <Badge variant="outline">Low: {summary.issueBreakdown.low}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const ImageResults = ({ results }: { results: ImageResultsSummary }) => {
  if (!results) return null;
  
  const summary = results.summary;
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Image Analysis Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Images</p>
            <p className="text-2xl font-bold">{summary.totalImages}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Without Alt Text</p>
            <p className="text-2xl font-bold text-destructive">{summary.imagesWithoutAlt}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Oversized</p>
            <p className="text-2xl font-bold text-orange-500">{summary.oversizedImages}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Size</p>
            <p className="text-2xl font-bold">{Math.round(summary.totalSize / 1024)}KB</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Average Size</p>
            <p className="text-2xl font-bold">{Math.round(summary.avgSize / 1024)}KB</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Lazy Loaded</p>
            <p className="text-2xl font-bold text-green-500">{summary.lazyLoadedImages}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const RedirectResults = ({ results }: { results: RedirectAnalysisResults }) => {
  if (!results) return null;
  
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Redirect Analysis Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Redirects</p>
            <p className="text-2xl font-bold">{results.totalRedirects}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Chains Found</p>
            <p className="text-2xl font-bold text-orange-500">{results.chains}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Max Chain Length</p>
            <p className="text-2xl font-bold text-destructive">{results.maxChainLength}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">404 Errors</p>
            <p className="text-2xl font-bold text-destructive">{results.total404s}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Chain Length</p>
            <p className="text-2xl font-bold">{results.avgChainLength?.toFixed(1) || '0'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Issues</p>
            <p className="text-2xl font-bold text-orange-500">{results.totalIssues}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const DuplicateResults = ({ results }: { results: DuplicateAnalysisResults }) => {
  if (!results) return null;
  
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Duplicate Content Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Pages</p>
            <p className="text-2xl font-bold">{results.totalPages}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Exact Duplicates</p>
            <p className="text-2xl font-bold text-destructive">{results.exactDuplicates}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Near Duplicates</p>
            <p className="text-2xl font-bold text-orange-500">{results.nearDuplicates}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Similar Pages</p>
            <p className="text-2xl font-bold text-yellow-500">{results.similarPages}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Thin Content</p>
            <p className="text-2xl font-bold text-orange-500">{results.thinContent}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Word Count</p>
            <p className="text-2xl font-bold">{results.avgWordCount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const SecurityResults = ({ results }: { results: SecurityAnalysisResults }) => {
  if (!results) return null;
  
  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-500";
    if (score >= 70) return "text-yellow-500";
    return "text-destructive";
  };
  
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Security Analysis Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Security Score</p>
            <p className={`text-4xl font-bold ${getScoreColor(results.securityScore)}`}>
              {results.securityScore}/100
            </p>
          </div>
          <div className="flex-1 max-w-md mx-4">
            <Progress value={results.securityScore} className="h-3" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Protocol</p>
            <p className="text-lg font-semibold">{results.protocol}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">HTTPS</p>
            <p className="text-lg font-semibold">
              {results.isHttps ? <CheckCircle className="inline text-green-500" /> : <XCircle className="inline text-destructive" />}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Critical Issues</p>
            <p className="text-lg font-semibold text-destructive">{results.criticalIssues}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Checks</p>
            <p className="text-lg font-semibold">{results.checks?.length || 0}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const LinkStructureResults = ({ results }: { results: LinkStructureResults }) => {
  if (!results) return null;
  
  const summary = results.summary;
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Link Structure Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Pages</p>
            <p className="text-2xl font-bold">{summary.totalPages}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Internal Links</p>
            <p className="text-2xl font-bold">{summary.totalInternalLinks}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Orphaned Pages</p>
            <p className="text-2xl font-bold text-destructive">{summary.orphanedPages}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">No Outgoing</p>
            <p className="text-2xl font-bold text-orange-500">{summary.pagesWithNoOutgoingLinks}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">No Incoming</p>
            <p className="text-2xl font-bold text-orange-500">{summary.pagesWithNoIncomingLinks}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg PageRank</p>
            <p className="text-2xl font-bold">{summary.avgPageRank?.toFixed(4) || '0'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const MobileResults = ({ results }: { results: MobileAnalysisResults }) => {
  if (!results) return null;
  
  const summary = results.summary;
  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-500";
    if (score >= 70) return "text-yellow-500";
    return "text-destructive";
  };
  
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Mobile-First Analysis Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Mobile Score</p>
            <p className={`text-4xl font-bold ${getScoreColor(summary.mobileScore)}`}>
              {summary.mobileScore}/100
            </p>
          </div>
          <div className="flex-1 max-w-md mx-4">
            <Progress value={summary.mobileScore} className="h-3" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Viewport:</p>
            {summary.hasViewport ? <CheckCircle className="text-green-500" /> : <XCircle className="text-destructive" />}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Touch-Friendly:</p>
            {summary.isTouchFriendly ? <CheckCircle className="text-green-500" /> : <XCircle className="text-destructive" />}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Responsive Images:</p>
            {summary.hasResponsiveImages ? <CheckCircle className="text-green-500" /> : <XCircle className="text-destructive" />}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Mobile Fonts:</p>
            {summary.hasMobileFonts ? <CheckCircle className="text-green-500" /> : <XCircle className="text-destructive" />}
          </div>
        </div>
        
        <div>
          <p className="text-sm font-semibold">Total Issues: {summary.issues?.length || 0}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export const BudgetResults = ({ results }: { results: PerformanceBudgetResults }) => {
  if (!results) return null;
  
  const totalSizeMB = (results.totalPageSize / (1024 * 1024)).toFixed(2);
  
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Performance Budget Results
          <Badge variant={results.passedBudget ? "default" : "destructive"}>
            {results.passedBudget ? "PASSED ✓" : "EXCEEDED ✗"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Performance Score</p>
            <p className={`text-4xl font-bold ${results.passedBudget ? "text-green-500" : "text-destructive"}`}>
              {results.score}/100
            </p>
          </div>
          <div className="flex-1 max-w-md mx-4">
            <Progress value={results.score} className="h-3" />
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Size</p>
            <p className="text-2xl font-bold">{totalSizeMB}MB</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Requests</p>
            <p className="text-2xl font-bold">{results.totalRequests}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Third-Party</p>
            <p className="text-2xl font-bold text-orange-500">{results.thirdPartyResources}</p>
          </div>
        </div>
        
        {results.violations && results.violations.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Budget Violations: {results.violations.length}</p>
            <div className="space-y-1">
              {results.violations.map((v, i: number) => (
                <div key={i} className="flex items-start gap-2 text-sm p-2 bg-destructive/10 rounded">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <strong>{v.metric}:</strong> {v.message}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
