import { Globe, Code, FileText, Info, RefreshCw, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';

/**
 * The robots.txt / sitemap.xml / llms.txt editor tabs, extracted from the
 * 5.6k-line SEOManager (US-553 AC1). Purely presentational — all state lives in
 * the parent and is passed down as props, so behavior is unchanged.
 */
export interface SeoFilesTabsProps {
  robotsTxt: string;
  setRobotsTxt: (value: string) => void;
  sitemapXml: string;
  setSitemapXml: (value: string) => void;
  llmsTxt: string;
  setLlmsTxt: (value: string) => void;
  isRegeneratingSitemap: boolean;
  regenerateSitemap: () => void;
  onCopy: (content: string, label: string) => void;
  onDownload: (content: string, filename: string) => void;
}

export function SeoFilesTabs({
  robotsTxt,
  setRobotsTxt,
  sitemapXml,
  setSitemapXml,
  llmsTxt,
  setLlmsTxt,
  isRegeneratingSitemap,
  regenerateSitemap,
  onCopy,
  onDownload,
}: SeoFilesTabsProps) {
  return (
    <>
      {/* robots.txt Tab */}
      <TabsContent value="robots">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              robots.txt
            </CardTitle>
            <CardDescription>
              Control search engine crawling. Place this file in your /public directory.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={robotsTxt}
              onChange={(e) => setRobotsTxt(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={() => onCopy(robotsTxt, 'robots.txt')} variant="outline">
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </Button>
              <Button onClick={() => onDownload(robotsTxt, 'robots.txt')} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* sitemap.xml Tab */}
      <TabsContent value="sitemap">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              sitemap.xml
            </CardTitle>
            <CardDescription>
              Help search engines discover your pages. Regenerate to include all published blog
              posts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium">
                  Click Regenerate to include latest blog posts
                </span>
              </div>
              <Button onClick={regenerateSitemap} disabled={isRegeneratingSitemap} size="sm">
                {isRegeneratingSitemap ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate Sitemap
                  </>
                )}
              </Button>
            </div>
            <Textarea
              value={sitemapXml}
              onChange={(e) => setSitemapXml(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={() => onCopy(sitemapXml, 'sitemap.xml')} variant="outline">
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </Button>
              <Button onClick={() => onDownload(sitemapXml, 'sitemap.xml')} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Note:</strong> After regenerating, download the sitemap.xml file and
                manually replace the one in your public folder, or set up the dynamic sitemap edge
                function for automatic updates.
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* llms.txt Tab */}
      <TabsContent value="llms">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              llms.txt
            </CardTitle>
            <CardDescription>
              Provide information about your site for Large Language Models and AI assistants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={llmsTxt}
              onChange={(e) => setLlmsTxt(e.target.value)}
              rows={20}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={() => onCopy(llmsTxt, 'llms.txt')} variant="outline">
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </Button>
              <Button onClick={() => onDownload(llmsTxt, 'llms.txt')} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </>
  );
}
