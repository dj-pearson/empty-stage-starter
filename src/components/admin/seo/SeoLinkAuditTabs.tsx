import type { Dispatch, SetStateAction } from 'react';
import {
  Link2,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  XCircle,
  Search,
  Info,
  Image,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { ImageResults } from '@/components/admin/SEOResultsDisplay';
import type { ImageResultsSummary } from '@/types/seo-types';
import { invokeEdgeFunction } from '@/lib/edge-functions';

/**
 * Backlink tracking, broken-link checking and image SEO tabs extracted from the
 * monolithic SEOManager (US-553 AC1). Each is a trigger + inline edge-function
 * handler + its results display; state lives in the parent and is passed down as
 * props, so behavior is unchanged (behavior-preserving verbatim move).
 */

export interface SeoBacklinksTabProps {
  backlinksResults: Record<string, unknown>[];
  setBacklinksResults: Dispatch<SetStateAction<Record<string, unknown>[]>>;
  isAddingBacklink: boolean;
  setIsAddingBacklink: Dispatch<SetStateAction<boolean>>;
}

export function SeoBacklinksTab({
  backlinksResults,
  setBacklinksResults,
  isAddingBacklink,
  setIsAddingBacklink,
}: SeoBacklinksTabProps) {
  return (
    <TabsContent value="backlinks" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Backlink Tracking
          </CardTitle>
          <CardDescription>
            Monitor inbound links and track link quality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Backlink source URL"
              id="backlink-source"
            />
            <Input
              placeholder="Your URL (target)"
              defaultValue={window.location.origin}
              id="backlink-target"
            />
            <Button
              disabled={isAddingBacklink}
              onClick={async () => {
                const sourceUrl = (document.getElementById('backlink-source') as HTMLInputElement)?.value;
                const targetUrl = (document.getElementById('backlink-target') as HTMLInputElement)?.value || window.location.origin;

                if (!sourceUrl) {
                  setBacklinksResults([{
                    success: false,
                    error: 'Please enter a backlink source URL',
                    timestamp: new Date().toISOString()
                  }]);
                  return;
                }

                setIsAddingBacklink(true);

                try {
                  const { data, error } = await invokeEdgeFunction('sync-backlinks', {
                    body: {
                      targetDomain: new URL(targetUrl).hostname,
                      source: 'manual',
                      manualBacklinks: [{
                        sourceUrl: sourceUrl,
                        targetUrl: targetUrl,
                        anchorText: '',
                        linkType: 'dofollow',
                        notes: 'Added manually'
                      }]
                    }
                  });

                  if (error) throw error;

                  if (data?.success) {
                    setBacklinksResults([{
                      success: true,
                      message: 'Backlink added successfully!',
                      sourceUrl,
                      targetUrl,
                      timestamp: new Date().toISOString()
                    }, ...backlinksResults]);
                    (document.getElementById('backlink-source') as HTMLInputElement).value = '';
                  } else {
                    throw new Error(data?.error || 'Failed to add backlink');
                  }
                } catch (error: unknown) {
                  setBacklinksResults([{
                    success: false,
                    error: error.message || 'Failed to add backlink',
                    timestamp: new Date().toISOString()
                  }]);
                } finally {
                  setIsAddingBacklink(false);
                }
              }}
            >
              {isAddingBacklink ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Add Backlink
                </>
              )}
            </Button>
          </div>

          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Track backlinks manually or integrate with Ahrefs/Moz APIs for automated discovery.
              Configure API keys in environment variables for automatic backlink syncing.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">Backlink Tracking Features:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ Track link quality (Domain Authority, Spam Score)</li>
              <li>✅ Monitor new and lost backlinks</li>
              <li>✅ Detect toxic links automatically</li>
              <li>✅ Historical metrics tracking</li>
              <li>✅ Manual or automated via APIs (Ahrefs, Moz)</li>
            </ul>
          </div>

          {backlinksResults && backlinksResults.length > 0 && (
            <div className="mt-4 space-y-2">
              <h5 className="font-semibold text-sm">Recent Backlink Actions:</h5>
              {backlinksResults.slice(0, 5).map((result: Record<string, unknown>, idx: number) => (
                <div key={idx}>
                  {result.success ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-green-900">{result.message}</p>
                          <p className="text-xs text-green-800 mt-1">
                            Source: {result.sourceUrl} → Target: {result.targetUrl}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(result.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-red-900">Failed to add backlink</p>
                          <p className="text-xs text-red-800 mt-1">{result.error}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(result.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export interface SeoBrokenLinksTabProps {
  brokenLinksResults: Record<string, unknown> | null;
  setBrokenLinksResults: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  isScanningBrokenLinks: boolean;
  setIsScanningBrokenLinks: Dispatch<SetStateAction<boolean>>;
}

export function SeoBrokenLinksTab({
  brokenLinksResults,
  setBrokenLinksResults,
  isScanningBrokenLinks,
  setIsScanningBrokenLinks,
}: SeoBrokenLinksTabProps) {
  return (
    <TabsContent value="broken-links" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            Broken Link Checker
          </CardTitle>
          <CardDescription>
            Find and fix broken links across your site
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="URL to scan for broken links"
              defaultValue={window.location.origin}
              id="broken-links-url"
            />
            <Button
              onClick={async () => {
                const url = (document.getElementById('broken-links-url') as HTMLInputElement)?.value || window.location.origin;
                setIsScanningBrokenLinks(true);
                setBrokenLinksResults(null);

                try {
                  const { data, error } = await invokeEdgeFunction('check-broken-links', {
                    body: {
                      url: url,
                      checkExternal: true,
                      maxLinks: 100
                    }
                  });

                  if (error) throw error;

                  if (data?.success) {
                    setBrokenLinksResults(data.data);
                  } else {
                    throw new Error(data?.error || 'Failed to scan for broken links');
                  }
                } catch (error: unknown) {
                  setBrokenLinksResults({ error: error.message || 'Failed to scan for broken links' });
                } finally {
                  setIsScanningBrokenLinks(false);
                }
              }}
              disabled={isScanningBrokenLinks}
            >
              {isScanningBrokenLinks ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Scan Page
                </>
              )}
            </Button>
          </div>

          {brokenLinksResults && !brokenLinksResults.error && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Scan Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 rounded-lg border bg-card">
                    <div className="text-2xl font-bold">{brokenLinksResults.totalLinksChecked || 0}</div>
                    <div className="text-sm text-muted-foreground">Links Checked</div>
                  </div>
                  <div className="text-center p-4 rounded-lg border bg-card">
                    <div className="text-2xl font-bold text-destructive">{brokenLinksResults.brokenLinksFound || 0}</div>
                    <div className="text-sm text-muted-foreground">Broken Links</div>
                  </div>
                  <div className="text-center p-4 rounded-lg border bg-card">
                    <div className="text-2xl font-bold text-yellow-600">{brokenLinksResults.redirectsFound || 0}</div>
                    <div className="text-sm text-muted-foreground">Redirects</div>
                  </div>
                  <div className="text-center p-4 rounded-lg border bg-card">
                    <div className="text-2xl font-bold text-green-600">{brokenLinksResults.workingLinks || 0}</div>
                    <div className="text-sm text-muted-foreground">Working</div>
                  </div>
                </div>

                {brokenLinksResults.brokenLinks && brokenLinksResults.brokenLinks.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      Broken Links Found
                    </h4>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {brokenLinksResults.brokenLinks.map((link: Record<string, unknown>, index: number) => (
                        <div key={index} className="p-3 rounded-lg border bg-card space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-mono text-destructive break-all">{link.url}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Status: {link.statusCode} • Type: {link.linkType}
                                {link.impact && <span className="ml-2">Impact: <Badge variant={link.impact === 'critical' ? 'destructive' : 'secondary'}>{link.impact}</Badge></span>}
                              </div>
                            </div>
                          </div>
                          {link.foundOn && (
                            <div className="text-xs text-muted-foreground">
                              Found on: {link.foundOn}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {brokenLinksResults.brokenLinksFound === 0 && (
                  <div className="flex items-center gap-2 p-4 rounded-lg border bg-green-50 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">No broken links found! All links are working correctly.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {brokenLinksResults?.error && (
            <div className="flex items-center gap-2 p-4 rounded-lg border bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>{brokenLinksResults.error}</span>
            </div>
          )}

          <div className="rounded-lg border p-4 bg-muted-50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Scans all links on a page including internal links, external links, images, CSS, and JavaScript files.
              Broken links are prioritized by impact (critical, high, medium, low).
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">What Gets Checked:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ Internal links (pages, posts)</li>
              <li>✅ External links (outbound)</li>
              <li>✅ Images (src attributes)</li>
              <li>✅ Stylesheets (CSS files)</li>
              <li>✅ Scripts (JavaScript files)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

export interface SeoImageAnalysisTabProps {
  imageResults: ImageResultsSummary | null;
  setImageResults: Dispatch<SetStateAction<ImageResultsSummary | null>>;
}

export function SeoImageAnalysisTab({ imageResults, setImageResults }: SeoImageAnalysisTabProps) {
  return (
    <TabsContent value="image-analysis" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Image SEO Analyzer
          </CardTitle>
          <CardDescription>
            Scan all images for SEO issues and optimization opportunities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image-url">Page URL to Analyze</Label>
            <Input
              id="image-url"
              type="url"
              placeholder={`${window.location.origin}/`}
              defaultValue={`${window.location.origin}/`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-file-size">Max File Size (KB)</Label>
            <Input
              id="max-file-size"
              type="number"
              defaultValue="200"
              min="50"
              max="2000"
            />
          </div>

          <Button
            className="w-full"
            onClick={async () => {
              const urlInput = document.getElementById('image-url') as HTMLInputElement;
              const maxSizeInput = document.getElementById('max-file-size') as HTMLInputElement;

              const url = urlInput?.value || `${window.location.origin}/`;
              const maxFileSize = parseInt(maxSizeInput?.value || '200') * 1024;

              try {
                const { data } = await invokeEdgeFunction('analyze-images', {
                  body: { url, maxFileSize }
                });

                if (data?.success) {
                  setImageResults(data.data);
                } else {
                  throw new Error(data?.error || 'Failed to analyze images');
                }
              } catch (error: unknown) {
                setImageResults({
                  error: error.message || 'Failed to analyze images',
                  summary: { totalImages: 0, issues: [] }
                });
              }
            }}
          >
            <Image className="h-4 w-4 mr-2" />
            Analyze Images
          </Button>

          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Scans all images on the page and checks for alt text, file sizes, formats, and dimensions.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">Checks:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ Missing or empty alt text</li>
              <li>✅ Missing width/height attributes</li>
              <li>✅ Oversized images</li>
              <li>✅ Unoptimized formats (recommends WebP)</li>
              <li>✅ Lazy loading implementation</li>
            </ul>
          </div>

          <ImageResults results={imageResults} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
