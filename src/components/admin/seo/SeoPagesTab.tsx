import type { Dispatch, SetStateAction } from 'react';
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
import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  ExternalLink,
  Eye,
  RefreshCw,
  Search,
} from 'lucide-react';

/**
 * US-553: the pages tab, lifted verbatim out of SEOManager.
 *
 * Presentational and props-down like its siblings: the page list, the blog
 * analysis results and the in-flight flag all still live in SEOManager, so
 * this changes where the JSX is written and nothing else.
 */
export interface PageAnalysisRow {
  url: string;
  title: string;
  metaDescription: string;
  wordCount: number;
  issues: number;
  score: number;
}

export interface SeoPagesTabProps {
  pageAnalysis: PageAnalysisRow[];
  blogPostsAnalysisResults: Record<string, unknown> | null;
  isAnalyzingBlogPosts: boolean;
  analyzeBlogPostsSEO: () => void | Promise<void>;
  /** A row's "audit this page" action hands the URL to the audit tab. */
  setAuditUrl: Dispatch<SetStateAction<string>>;
  runComprehensiveAudit: () => void | Promise<void>;
}

export function SeoPagesTab({
  pageAnalysis,
  blogPostsAnalysisResults,
  isAnalyzingBlogPosts,
  analyzeBlogPostsSEO,
  setAuditUrl,
  runComprehensiveAudit,
}: SeoPagesTabProps) {
  return (
<TabsContent value="pages" className="space-y-4">
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Page Analysis
          </CardTitle>
          <CardDescription>SEO performance of individual pages</CardDescription>
        </div>
        <Button onClick={analyzeBlogPostsSEO} variant="outline" size="sm" disabled={isAnalyzingBlogPosts}>
          {isAnalyzingBlogPosts ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <BarChart3 className="h-4 w-4 mr-2" />
              Analyze All Blog Posts
            </>
          )}
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      {pageAnalysis.length === 0 ? (
        <>
          <div className="text-center py-12">
            <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No page analysis data yet</h3>
            <p className="text-muted-foreground mb-4">
              Analyze your blog posts to see individual SEO scores
            </p>
            <Button onClick={analyzeBlogPostsSEO} disabled={isAnalyzingBlogPosts}>
              {isAnalyzingBlogPosts ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analyze Blog Posts
                </>
              )}
            </Button>
          </div>
          {blogPostsAnalysisResults && (
            <div className="mt-4">
              {blogPostsAnalysisResults.success ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-green-900 mb-1">Analysis Complete</h4>
                      <p className="text-sm text-green-800">{blogPostsAnalysisResults.message}</p>
                      {blogPostsAnalysisResults.analyzed > 0 && (
                        <div className="mt-2">
                          <Badge variant="default">{blogPostsAnalysisResults.analyzed} blog posts analyzed</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-red-900 mb-1">Analysis Failed</h4>
                      <p className="text-sm text-red-800">{blogPostsAnalysisResults.error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page URL</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Word Count</TableHead>
              <TableHead>Issues</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageAnalysis.map((page, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {page.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TableCell>
                <TableCell className="font-medium">{page.title}</TableCell>
                <TableCell>
                  <Badge variant={page.score >= 90 ? "default" : page.score >= 70 ? "secondary" : "destructive"}>
                    {page.score}
                  </Badge>
                </TableCell>
                <TableCell>{page.wordCount.toLocaleString()}</TableCell>
                <TableCell>
                  {page.issues > 0 ? (
                    <Badge variant="destructive">{page.issues} issues</Badge>
                  ) : (
                    <Badge variant="default">No issues</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAuditUrl(page.url);
                      runComprehensiveAudit();
                    }}
                  >
                    <Search className="h-3 w-3 mr-1" />
                    Audit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
</TabsContent>
  );
}
