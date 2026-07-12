import {
  ArrowRightCircle,
  Copy,
  DollarSign,
  Network,
  Shield,
  Smartphone,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import {
  RedirectResults,
  DuplicateResults,
  SecurityResults,
  LinkStructureResults,
  MobileResults,
  BudgetResults,
} from '@/components/admin/SEOResultsDisplay';
import type {
  RedirectAnalysisResults,
  DuplicateAnalysisResults,
  SecurityAnalysisResults,
  LinkStructureResults as LinkStructureResultsType,
  MobileAnalysisResults,
  PerformanceBudgetResults,
} from '@/types/seo-types';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { logger } from '@/lib/logger';

/**
 * The six "leaf" SEO analysis tabs (redirect chains, duplicate content,
 * security headers, link structure, mobile-first, performance budget) extracted
 * from the 5.6k-line SEOManager (US-553 AC1). Each is a trigger + inline
 * edge-function handler + its typed results display; state lives in the parent
 * and is passed down as props, so behavior is unchanged.
 */

export interface SeoRedirectsTabProps {
  results: RedirectAnalysisResults | null;
  setResults: (value: RedirectAnalysisResults | null) => void;
}

export function SeoRedirectsTab({ results, setResults }: SeoRedirectsTabProps) {
  return (
    <TabsContent value="redirects" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightCircle className="h-5 w-5" />
            Redirect Chain Detector
          </CardTitle>
          <CardDescription>Detect redirect chains, loops, and performance issues</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="redirect-urls">URLs to Check (one per line)</Label>
            <textarea
              id="redirect-urls"
              className="w-full min-h-[100px] p-2 border rounded-md"
              placeholder={`${window.location.origin}/\n${window.location.origin}/about\n${window.location.origin}/contact`}
              defaultValue={`${window.location.origin}/`}
            />
          </div>

          <Button
            className="w-full"
            onClick={async () => {
              const urlsInput = document.getElementById('redirect-urls') as HTMLTextAreaElement;
              const urls = urlsInput?.value.split('\n').filter((u) => u.trim());

              if (!urls || urls.length === 0) {
                setResults({
                  error: 'Please enter at least one URL',
                  summary: {
                    totalUrls: 0,
                    urlsWithRedirects: 0,
                    urlsWithChains: 0,
                    urlsWithLoops: 0,
                    avgChainLength: 0,
                    totalIssues: 0,
                  },
                });
                return;
              }

              try {
                const { data } = await invokeEdgeFunction('detect-redirect-chains', {
                  body: { urls, maxRedirects: 10 },
                });

                if (data?.success) {
                  setResults(data.data);
                  logger.debug('Full redirect analysis:', data.data);
                } else {
                  throw new Error(data?.error || 'Failed to analyze redirects');
                }
              } catch (error: unknown) {
                setResults({
                  error: error.message || 'Failed to analyze redirects',
                  summary: {
                    totalUrls: 0,
                    urlsWithRedirects: 0,
                    urlsWithChains: 0,
                    urlsWithLoops: 0,
                    avgChainLength: 0,
                    totalIssues: 0,
                  },
                });
              }
            }}
          >
            <ArrowRightCircle className="h-4 w-4 mr-2" />
            Analyze Redirects
          </Button>

          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Follows redirect chains, detects loops, and measures redirect performance impact.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">Detects:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ Redirect chains (A→B→C→D)</li>
              <li>✅ Redirect loops</li>
              <li>✅ HTTPS/HTTP protocol downgrades</li>
              <li>✅ Slow redirect chains</li>
              <li>✅ Mixed 301/302 redirects</li>
            </ul>
          </div>

          <RedirectResults results={results} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export interface SeoDuplicateContentTabProps {
  results: DuplicateAnalysisResults | null;
  setResults: (value: DuplicateAnalysisResults | null) => void;
}

export function SeoDuplicateContentTab({ results, setResults }: SeoDuplicateContentTabProps) {
  return (
    <TabsContent value="duplicate-content" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Duplicate Content Detector
          </CardTitle>
          <CardDescription>Find duplicate, similar, and thin content across pages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="duplicate-urls">URLs to Compare (one per line, minimum 2)</Label>
            <textarea
              id="duplicate-urls"
              className="w-full min-h-[120px] p-2 border rounded-md"
              placeholder={`${window.location.origin}/page1\n${window.location.origin}/page2\n${window.location.origin}/page3`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="similarity-threshold">Similarity Threshold (%)</Label>
            <Input id="similarity-threshold" type="number" defaultValue="85" min="50" max="100" />
          </div>

          <Button
            className="w-full"
            onClick={async () => {
              const urlsInput = document.getElementById('duplicate-urls') as HTMLTextAreaElement;
              const thresholdInput = document.getElementById(
                'similarity-threshold'
              ) as HTMLInputElement;

              const urls = urlsInput?.value.split('\n').filter((u) => u.trim());
              const similarityThreshold = parseInt(thresholdInput?.value || '85') / 100;

              if (!urls || urls.length < 2) {
                setResults({
                  error: 'Please enter at least 2 URLs',
                  summary: {
                    totalPages: 0,
                    exactDuplicates: 0,
                    nearDuplicates: 0,
                    similarPages: 0,
                    thinContent: 0,
                    avgWordCount: 0,
                    totalIssues: 0,
                  },
                });
                return;
              }

              try {
                const { data } = await invokeEdgeFunction('detect-duplicate-content', {
                  body: { urls, similarityThreshold, thinContentThreshold: 300 },
                });

                if (data?.success) {
                  setResults(data.data);
                  logger.debug('Full duplicate content analysis:', data.data);
                } else {
                  throw new Error(data?.error || 'Failed to analyze content');
                }
              } catch (error: unknown) {
                setResults({
                  error: error.message || 'Failed to analyze content',
                  summary: {
                    totalPages: 0,
                    exactDuplicates: 0,
                    nearDuplicates: 0,
                    similarPages: 0,
                    thinContent: 0,
                    avgWordCount: 0,
                    totalIssues: 0,
                  },
                });
              }
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Detect Duplicates
          </Button>

          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Compares content across multiple pages to find exact duplicates, near-duplicates, and
              thin content.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">Analysis:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ Exact duplicate detection (100% match)</li>
              <li>✅ Near-duplicate detection (95%+ similar)</li>
              <li>✅ Similar content detection (configurable threshold)</li>
              <li>✅ Thin content detection (&lt;300 words)</li>
              <li>✅ Content similarity scoring</li>
            </ul>
          </div>

          <DuplicateResults results={results} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export interface SeoSecurityTabProps {
  results: SecurityAnalysisResults | null;
  setResults: (value: SecurityAnalysisResults | null) => void;
}

export function SeoSecurityTab({ results, setResults }: SeoSecurityTabProps) {
  return (
    <TabsContent value="security" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Headers Checker
          </CardTitle>
          <CardDescription>Check HTTPS implementation and security headers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="security-url">URL to Check</Label>
            <Input
              id="security-url"
              type="url"
              placeholder={`${window.location.origin}/`}
              defaultValue={`${window.location.origin}/`}
            />
          </div>

          <Button
            className="w-full"
            onClick={async () => {
              const urlInput = document.getElementById('security-url') as HTMLInputElement;
              const url = urlInput?.value || `${window.location.origin}/`;

              try {
                const { data } = await invokeEdgeFunction('check-security-headers', {
                  body: { url },
                });

                if (data?.success) {
                  setResults(data.data);
                  logger.debug('Full security analysis:', data.data);
                } else {
                  throw new Error(data?.error || 'Failed to check security');
                }
              } catch (error: unknown) {
                setResults({
                  error: error.message || 'Failed to check security',
                  grade: 'F',
                  overallScore: 0,
                  protocol: 'unknown',
                  isHttps: false,
                  criticalIssues: 0,
                  highIssues: 0,
                  mediumIssues: 0,
                  lowIssues: 0,
                  checks: [],
                });
              }
            }}
          >
            <Shield className="h-4 w-4 mr-2" />
            Check Security
          </Button>

          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Validates HTTPS implementation and important security headers like HSTS, CSP, and
              X-Frame-Options.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">Security Checks:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ HTTPS implementation</li>
              <li>✅ Strict-Transport-Security (HSTS)</li>
              <li>✅ Content-Security-Policy (CSP)</li>
              <li>✅ X-Frame-Options</li>
              <li>✅ X-Content-Type-Options</li>
              <li>✅ Referrer-Policy</li>
              <li>✅ Permissions-Policy</li>
              <li>✅ Server information disclosure</li>
            </ul>
          </div>

          <SecurityResults results={results} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export interface SeoLinkStructureTabProps {
  results: LinkStructureResultsType | null;
  setResults: (value: LinkStructureResultsType | null) => void;
}

export function SeoLinkStructureTab({ results, setResults }: SeoLinkStructureTabProps) {
  return (
    <TabsContent value="link-structure" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Internal Link Analysis
          </CardTitle>
          <CardDescription>
            Analyze link structure, PageRank scores, and find orphaned pages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-url">Start URL (optional if using crawl ID)</Label>
            <Input
              id="link-url"
              type="url"
              placeholder={`${window.location.origin}/`}
              defaultValue={`${window.location.origin}/`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-max-pages">Maximum Pages to Analyze</Label>
            <Input id="link-max-pages" type="number" defaultValue="100" min="10" max="500" />
          </div>

          <Button
            className="w-full"
            onClick={async () => {
              const urlInput = document.getElementById('link-url') as HTMLInputElement;
              const maxPagesInput = document.getElementById('link-max-pages') as HTMLInputElement;

              const startUrl = urlInput?.value || `${window.location.origin}/`;
              const maxPages = parseInt(maxPagesInput?.value || '100');

              try {
                const { data } = await invokeEdgeFunction('analyze-internal-links', {
                  body: { startUrl, maxPages },
                });

                if (data?.success) {
                  setResults(data.data);
                  logger.debug('Full link analysis:', data.data);
                } else {
                  throw new Error(data?.error || 'Failed to analyze links');
                }
              } catch (error: unknown) {
                setResults({
                  error: error.message || 'Failed to analyze links',
                  summary: {
                    totalPages: 0,
                    totalLinks: 0,
                    orphanedPages: 0,
                    hubPages: 0,
                    authorityPages: 0,
                    avgInboundLinks: 0,
                    avgOutboundLinks: 0,
                    maxDepth: 0,
                    avgDepth: 0,
                  },
                });
              }
            }}
          >
            <Network className="h-4 w-4 mr-2" />
            Analyze Links
          </Button>

          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Analyzes internal linking structure, calculates PageRank-style scores, and identifies
              orphaned pages.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">Analysis Includes:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ PageRank-style link scoring</li>
              <li>✅ Orphaned page detection</li>
              <li>✅ Hub page identification (many outbound links)</li>
              <li>✅ Authority page identification (many inbound links)</li>
              <li>✅ Link depth from homepage</li>
              <li>✅ Internal link graph visualization data</li>
            </ul>
          </div>

          <LinkStructureResults results={results} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export interface SeoMobileCheckTabProps {
  results: MobileAnalysisResults | null;
  setResults: (value: MobileAnalysisResults | null) => void;
}

export function SeoMobileCheckTab({ results, setResults }: SeoMobileCheckTabProps) {
  return (
    <TabsContent value="mobile-check" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Mobile-First Checker
          </CardTitle>
          <CardDescription>
            Comprehensive mobile usability and responsive design analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mobile-url">Page URL to Check</Label>
            <Input
              id="mobile-url"
              type="url"
              placeholder={`${window.location.origin}/`}
              defaultValue={`${window.location.origin}/`}
            />
          </div>

          <Button
            className="w-full"
            onClick={async () => {
              const urlInput = document.getElementById('mobile-url') as HTMLInputElement;
              const url = urlInput?.value || `${window.location.origin}/`;

              try {
                const { data } = await invokeEdgeFunction('check-mobile-first', {
                  body: { url },
                });

                if (data?.success) {
                  setResults(data.data);
                  logger.debug('Full mobile analysis:', data.data);
                } else {
                  throw new Error(data?.error || 'Failed to check mobile usability');
                }
              } catch (error: unknown) {
                setResults({
                  error: error.message || 'Failed to check mobile usability',
                  grade: 'F',
                  overallScore: 0,
                  highIssues: 0,
                  mediumIssues: 0,
                  lowIssues: 0,
                  checks: [],
                });
              }
            }}
          >
            <Smartphone className="h-4 w-4 mr-2" />
            Check Mobile
          </Button>

          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Comprehensive mobile usability testing beyond viewport meta tags.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">Mobile Checks:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ Viewport meta tag configuration</li>
              <li>✅ Text readability (font sizes)</li>
              <li>✅ Responsive design (media queries)</li>
              <li>✅ Touch target sizes</li>
              <li>✅ Responsive images (srcset, sizes)</li>
              <li>✅ Fixed width elements</li>
              <li>✅ Mobile navigation patterns</li>
              <li>✅ Form input optimization</li>
            </ul>
          </div>

          <MobileResults results={results} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export interface SeoBudgetTabProps {
  results: PerformanceBudgetResults | null;
  setResults: (value: PerformanceBudgetResults | null) => void;
}

export function SeoBudgetTab({ results, setResults }: SeoBudgetTabProps) {
  return (
    <TabsContent value="budget" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Performance Budget Monitor
          </CardTitle>
          <CardDescription>
            Track page size, resource counts, and performance budget compliance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="budget-url">Page URL to Monitor</Label>
            <Input
              id="budget-url"
              type="url"
              placeholder={`${window.location.origin}/`}
              defaultValue={`${window.location.origin}/`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max-page-size">Max Page Size (MB)</Label>
              <Input
                id="max-page-size"
                type="number"
                defaultValue="3"
                min="1"
                max="10"
                step="0.5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-requests">Max Requests</Label>
              <Input id="max-requests" type="number" defaultValue="50" min="10" max="200" />
            </div>
          </div>

          <Button
            className="w-full"
            onClick={async () => {
              const urlInput = document.getElementById('budget-url') as HTMLInputElement;
              const pageSizeInput = document.getElementById('max-page-size') as HTMLInputElement;
              const requestsInput = document.getElementById('max-requests') as HTMLInputElement;

              const url = urlInput?.value || `${window.location.origin}/`;
              const maxPageSize = parseFloat(pageSizeInput?.value || '3') * 1024 * 1024;
              const maxRequests = parseInt(requestsInput?.value || '50');

              const budget = {
                maxPageSize,
                maxJsSize: 1024 * 1024,
                maxCssSize: 200 * 1024,
                maxImageSize: 1.5 * 1024 * 1024,
                maxFonts: 4,
                maxRequests,
                maxThirdParty: 10,
              };

              try {
                const { data } = await invokeEdgeFunction('monitor-performance-budget', {
                  body: { url, budget },
                });

                if (data?.success) {
                  setResults(data.data);
                } else {
                  throw new Error(data?.error || 'Failed to monitor performance');
                }
              } catch (error: unknown) {
                setResults({
                  error: error.message || 'Failed to monitor performance',
                  passedBudget: false,
                  score: 0,
                  checks: [],
                });
              }
            }}
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Check Budget
          </Button>

          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Monitors page weight, resource counts, and alerts when budgets are exceeded.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">Tracks:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ Total page size</li>
              <li>✅ JavaScript bundle size</li>
              <li>✅ CSS file sizes</li>
              <li>✅ Image total size</li>
              <li>✅ Font count</li>
              <li>✅ Total HTTP requests</li>
              <li>✅ Third-party resources</li>
            </ul>
          </div>

          <BudgetResults results={results} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
