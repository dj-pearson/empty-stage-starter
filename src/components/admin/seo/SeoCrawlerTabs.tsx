import { useState } from 'react';
import { Globe, Image, Info, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import { CrawlResults, ImageResults } from '@/components/admin/SEOResultsDisplay';
import type { CrawlResultsSummary, ImageResultsSummary } from '@/types/seo-types';
import { invokeEdgeFunction } from '@/lib/edge-functions';

/**
 * The site-crawler and image-analysis SEO tabs extracted from the ~4.5k-line
 * SEOManager (US-553 AC1). Each is a trigger + inline edge-function handler + its
 * typed results display; state lives in the parent and is passed down as props,
 * so behavior is unchanged.
 */

/**
 * US-553: owns its own results. SEOManager only held them to pass straight
 * back down, and Radix keeps every TabsContent mounted, so nothing resets.
 */
export function SeoSiteCrawlerTab() {
  const [results, setResults] = useState<CrawlResultsSummary | null>(null);

  return (
    <TabsContent value="site-crawler" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Technical SEO Site Crawler
          </CardTitle>
          <CardDescription>
            Crawl your entire site and analyze SEO issues (like Screaming Frog)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="crawler-url">Start URL</Label>
            <Input
              id="crawler-url"
              type="url"
              placeholder={`${window.location.origin}/`}
              defaultValue={`${window.location.origin}/`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-pages">Maximum Pages to Crawl</Label>
            <Input
              id="max-pages"
              type="number"
              defaultValue="50"
              min="1"
              max="500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="follow-external"
              className="rounded"
            />
            <Label htmlFor="follow-external" className="text-sm cursor-pointer">
              Follow external links
            </Label>
          </div>

          <Button
            className="w-full"
            onClick={async () => {
              const urlInput = document.getElementById('crawler-url') as HTMLInputElement;
              const maxPagesInput = document.getElementById('max-pages') as HTMLInputElement;
              const followExternalInput = document.getElementById('follow-external') as HTMLInputElement;

              const startUrl = urlInput?.value || `${window.location.origin}/`;
              const maxPages = parseInt(maxPagesInput?.value || '50');
              const followExternal = followExternalInput?.checked || false;

              try {
                const { data } = await invokeEdgeFunction('crawl-site', {
                  body: { startUrl, maxPages, followExternal }
                });

                if (data?.success) {
                  setResults(data.data);
                } else {
                  throw new Error(data?.error || 'Failed to crawl site');
                }
              } catch (error: unknown) {
                setResults({
                  error: error.message || 'Failed to crawl site',
                  summary: { totalPages: 0, pagesWithIssues: 0 }
                });
              }
            }}
          >
            <Search className="h-4 w-4 mr-2" />
            Start Crawl
          </Button>

          <div className="rounded-lg border p-4 bg-muted/50">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Crawls your entire site, finds SEO issues, maps internal links, and detects orphaned pages.
              No external API required!
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <h4 className="font-semibold mb-2">Features:</h4>
            <ul className="space-y-1 ml-4">
              <li>✅ Complete site crawling with link following</li>
              <li>✅ SEO issue detection (50+ checks per page)</li>
              <li>✅ Internal link graph mapping</li>
              <li>✅ Orphaned page detection</li>
              <li>✅ Content analysis (word count, headings)</li>
              <li>✅ Load time measurement</li>
            </ul>
          </div>

          <CrawlResults results={results} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}

/** US-553: owns its own results, as SeoSiteCrawlerTab does. */
export function SeoImageAnalysisTab() {
  const [results, setResults] = useState<ImageResultsSummary | null>(null);

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
                  setResults(data.data);
                } else {
                  throw new Error(data?.error || 'Failed to analyze images');
                }
              } catch (error: unknown) {
                setResults({
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

          <ImageResults results={results} />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
