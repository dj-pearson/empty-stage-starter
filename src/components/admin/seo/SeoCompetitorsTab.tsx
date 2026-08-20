import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { SEOScore } from '@/lib/seoScore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';
import {
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  Shield,
  Smartphone,
  Trophy,
  XCircle,
} from 'lucide-react';

/**
 * US-553: the competitors tab, lifted verbatim out of SEOManager.
 *
 * Presentational and props-down, like its siblings in this directory. It owns
 * no state: the URL field, the result set and the in-flight flag all still
 * live in SEOManager, so the extraction cannot change behaviour, only where
 * the JSX is written.
 *
 * getScoreColor and getStatusIcon are passed in rather than imported. The
 * first is already shared from lib/seoScore, but the second is defined inside
 * SEOManager and returns an icon element, so threading both keeps this file
 * from reaching back into its parent.
 */
export interface SeoCompetitorsTabProps {
  competitorUrl: string;
  setCompetitorUrl: Dispatch<SetStateAction<string>>;
  competitorResults: Record<string, unknown>[];
  /** This site's own score, compared against each competitor's. */
  seoScore: SEOScore;
  isAnalyzingCompetitor: boolean;
  analyzeCompetitor: () => void | Promise<void>;
  removeCompetitor: (url: string) => void | Promise<void>;
  getScoreColor: (score: number) => string;
  getStatusIcon: (status: string) => ReactNode;
}

export function SeoCompetitorsTab({
  competitorUrl,
  setCompetitorUrl,
  competitorResults,
  seoScore,
  isAnalyzingCompetitor,
  analyzeCompetitor,
  removeCompetitor,
  getScoreColor,
  getStatusIcon,
}: SeoCompetitorsTabProps) {
  return (
<TabsContent value="competitors" className="space-y-4">
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Trophy className="h-5 w-5" />
        Competitor Analysis
      </CardTitle>
      <CardDescription>
        Analyze competitor websites and compare SEO performance
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <div className="flex gap-2">
        <Input
          placeholder="Enter competitor URL (e.g., https://competitor.com)"
          value={competitorUrl}
          onChange={(e) => setCompetitorUrl(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && analyzeCompetitor()}
        />
        <Button onClick={analyzeCompetitor} disabled={isAnalyzingCompetitor}>
          {isAnalyzingCompetitor ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-2" />
              Analyze
            </>
          )}
        </Button>
      </div>

      {competitorResults.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No competitors analyzed yet</h3>
          <p className="text-muted-foreground">
            Enter a competitor URL above to analyze their SEO performance
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {competitorResults.map((competitor, idx) => (
            <Card key={idx} className="border-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-4 w-4" />
                      <span className="font-medium">{competitor.url}</span>
                      <Badge variant={competitor.status === 200 ? "default" : "destructive"}>
                        {competitor.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Analyzed: {new Date(competitor.analyzedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className={`text-3xl font-bold ${getScoreColor(competitor.score)}`}>
                        {competitor.score}
                      </div>
                      <p className="text-xs text-muted-foreground">SEO Score</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCompetitor(competitor.url)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  {/* Technical SEO */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Technical
                    </h4>
                    <div className="space-y-1">
                      {competitor.analysis.technical.map((item: Record<string, unknown>, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {getStatusIcon(item.status)}
                          <span className="truncate">{item.item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* On-Page SEO */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      On-Page
                    </h4>
                    <div className="space-y-1">
                      {competitor.analysis.onPage.map((item: Record<string, unknown>, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {getStatusIcon(item.status)}
                          <span className="truncate">{item.item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mobile */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Mobile
                    </h4>
                    <div className="space-y-1">
                      {competitor.analysis.mobile.map((item: Record<string, unknown>, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {getStatusIcon(item.status)}
                          <span className="truncate">{item.item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Content */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Content
                    </h4>
                    <div className="space-y-1">
                      {competitor.analysis.content.map((item: Record<string, unknown>, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {getStatusIcon(item.status)}
                          <span className="truncate">{item.item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Comparison vs Your Site */}
                {seoScore.overall > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-semibold mb-2">Comparison vs Your Site</h4>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">Your Score:</span>
                        <Badge variant={seoScore.overall >= competitor.score ? "default" : "secondary"}>
                          {seoScore.overall}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">Competitor Score:</span>
                        <Badge variant={competitor.score >= seoScore.overall ? "default" : "secondary"}>
                          {competitor.score}
                        </Badge>
                      </div>
                    </div>
                    {competitor.score > seoScore.overall && (
                      <p className="text-sm text-yellow-600 mt-2">
                        ⚠ Competitor is ahead by {competitor.score - seoScore.overall} points. Run AI Auto-Heal for improvement suggestions.
                      </p>
                    )}
                    {seoScore.overall > competitor.score && (
                      <p className="text-sm text-green-600 mt-2">
                        ✓ You're ahead by {seoScore.overall - competitor.score} points. Keep optimizing!
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
</TabsContent>
  );
}
