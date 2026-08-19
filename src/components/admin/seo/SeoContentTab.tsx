import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { TabsContent } from '@/components/ui/tabs';
import { AlertCircle, FileText, Info, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { invokeEdgeFunction } from '@/lib/edge-functions';

/**
 * US-553: the content tab, lifted verbatim out of SEOManager.
 * Presentational and props-down; all state stays in SEOManager.
 */
/**
 * US-553: owns its own results, for the same reason SeoPerformanceTab does --
 * nothing outside this tab ever read them.
 */
export function SeoContentTab() {
  const [contentAnalysisResults, setContentAnalysisResults] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [isAnalyzingContent, setIsAnalyzingContent] = useState(false);

  return (
<TabsContent value="content" className="space-y-4">
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <FileText className="h-5 w-5" />
        Content Analysis
      </CardTitle>
      <CardDescription>
        Analyze content quality, readability, and keyword optimization
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-2">
        <Input
          placeholder="URL to analyze"
          defaultValue={window.location.origin}
          id="content-url"
        />
        <Input
          placeholder="Target keyword (optional)"
          id="content-keyword"
        />
        <Button
          onClick={async () => {
            const url = (document.getElementById('content-url') as HTMLInputElement)?.value || window.location.origin;
            const keyword = (document.getElementById('content-keyword') as HTMLInputElement)?.value || '';

            setIsAnalyzingContent(true);
            setContentAnalysisResults(null);

            try {
              const { data, error } = await invokeEdgeFunction('analyze-content', {
                body: {
                  url: url,
                  targetKeyword: keyword || undefined,
                  contentType: 'blog_post'
                }
              });

              if (error) throw error;

              if (data?.success) {
                setContentAnalysisResults({
                  ...data.data,
                  url,
                  keyword
                });
              } else {
                throw new Error(data?.error || 'Failed to analyze content');
              }
            } catch (error: unknown) {
              setContentAnalysisResults({ error: error.message || 'Failed to analyze content' });
            } finally {
              setIsAnalyzingContent(false);
            }
          }}
          disabled={isAnalyzingContent}
        >
          {isAnalyzingContent ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Analyze Content
            </>
          )}
        </Button>
      </div>

      {contentAnalysisResults && !contentAnalysisResults.error && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Analysis Results</CardTitle>
            <CardDescription className="text-xs break-all">{contentAnalysisResults.url}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Scores */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 rounded-lg border bg-card">
                <div className="text-2xl font-bold">{contentAnalysisResults.scores?.overall || 0}</div>
                <div className="text-sm text-muted-foreground">Overall Score</div>
                <Progress value={contentAnalysisResults.scores?.overall || 0} className="mt-2" />
              </div>
              <div className="text-center p-4 rounded-lg border bg-card">
                <div className="text-2xl font-bold">{contentAnalysisResults.scores?.readability || 0}</div>
                <div className="text-sm text-muted-foreground">Readability</div>
                <Progress value={contentAnalysisResults.scores?.readability || 0} className="mt-2" />
              </div>
              <div className="text-center p-4 rounded-lg border bg-card">
                <div className="text-2xl font-bold">{contentAnalysisResults.scores?.keywordOptimization || 0}</div>
                <div className="text-sm text-muted-foreground">Keyword Optimization</div>
                <Progress value={contentAnalysisResults.scores?.keywordOptimization || 0} className="mt-2" />
              </div>
              <div className="text-center p-4 rounded-lg border bg-card">
                <div className="text-2xl font-bold">{contentAnalysisResults.scores?.structure || 0}</div>
                <div className="text-sm text-muted-foreground">Structure</div>
                <Progress value={contentAnalysisResults.scores?.structure || 0} className="mt-2" />
              </div>
            </div>

            {/* Metrics */}
            <div>
              <h4 className="font-semibold text-sm mb-3">Content Metrics</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground">Word Count</div>
                  <div className="text-lg font-semibold">{contentAnalysisResults.metrics?.wordCount || 0}</div>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground">Sentences</div>
                  <div className="text-lg font-semibold">{contentAnalysisResults.metrics?.sentenceCount || 0}</div>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground">Flesch Reading Ease</div>
                  <div className="text-lg font-semibold">{contentAnalysisResults.metrics?.fleschReadingEase || 0}</div>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground">Grade Level</div>
                  <div className="text-lg font-semibold">{contentAnalysisResults.metrics?.fleschKincaidGrade || 0}</div>
                </div>
                {contentAnalysisResults.keyword && (
                  <>
                    <div className="p-3 rounded-lg border bg-muted/30">
                      <div className="text-xs text-muted-foreground">Keyword Density</div>
                      <div className="text-lg font-semibold">{contentAnalysisResults.metrics?.keywordDensity || 0}%</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/30">
                      <div className="text-xs text-muted-foreground">Keyword Count</div>
                      <div className="text-lg font-semibold">{contentAnalysisResults.metrics?.keywordCount || 0}</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Suggestions */}
            {contentAnalysisResults.suggestions && contentAnalysisResults.suggestions.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Improvement Suggestions ({contentAnalysisResults.suggestions.length})
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {contentAnalysisResults.suggestions.map((suggestion: Record<string, unknown>, index: number) => (
                    <div key={index} className="p-3 rounded-lg border bg-card flex items-start gap-3">
                      <Badge variant={
                        suggestion.priority === 'high' ? 'destructive' :
                        suggestion.priority === 'medium' ? 'default' :
                        'secondary'
                      }>
                        {suggestion.priority || 'info'}
                      </Badge>
                      <div className="flex-1">
                        <div className="text-sm">{suggestion.message}</div>
                        {suggestion.details && (
                          <div className="text-xs text-muted-foreground mt-1">{suggestion.details}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {contentAnalysisResults?.error && (
        <div className="flex items-center gap-2 p-4 rounded-lg border bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>{contentAnalysisResults.error}</span>
        </div>
      )}

      <div className="rounded-lg border p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground">
          <Info className="h-4 w-4 inline mr-2" />
          Analyzes readability, keyword density, content structure, and provides actionable suggestions.
          No external API required - runs locally with instant results.
        </p>
      </div>

      <div className="text-sm text-muted-foreground">
        <h4 className="font-semibold mb-2">Analysis Includes:</h4>
        <ul className="space-y-1 ml-4">
          <li>✅ Readability scores (Flesch, Gunning Fog, SMOG, etc.)</li>
          <li>✅ Keyword density analysis (optimal: 1-3%)</li>
          <li>✅ Content structure (headings, paragraphs, links)</li>
          <li>✅ Image optimization check</li>
          <li>✅ Actionable improvement suggestions</li>
        </ul>
      </div>
    </CardContent>
  </Card>
</TabsContent>
  );
}