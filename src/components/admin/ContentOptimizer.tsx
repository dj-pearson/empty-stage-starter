import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sparkles,
  ArrowRight,
  Lightbulb,
  TrendingUp,
  FileText,
  Tag,
  Network,
  AlertCircle,
  CheckCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

interface OptimizationResult {
  url: string;
  optimizations: {
    titleOptimization?: {
      current: string;
      suggested: string;
      reasoning: string;
    };
    metaDescriptionOptimization?: {
      current: string;
      suggested: string;
      reasoning: string;
    };
    headingOptimizations?: Array<{
      type: string;
      current: string;
      suggested: string;
      reasoning: string;
    }>;
    lsiKeywords?: Array<{
      keyword: string;
      relevance: string;
      placement: string;
    }>;
    semanticClusters?: Array<{
      cluster: string;
      keywords: string[];
      howToUse: string;
    }>;
    contentGaps?: Array<{
      topic: string;
      priority: string;
      suggestedContent: string;
      placement: string;
    }>;
    structureImprovements?: Array<{
      type: string;
      section: string;
      suggestion: string;
      priority: string;
    }>;
    keyRewriteSuggestions?: Array<{
      section: string;
      currentText: string;
      suggestedText: string;
      improvement: string;
    }>;
    overallScore?: number;
    priorityActions?: string[];
  };
}

interface SemanticAnalysisResult {
  url: string;
  analysis: {
    lsiKeywords: Array<{
      keyword: string;
      relevance: string;
      currentMentions: number;
      suggestedMentions: number;
      context: string;
    }>;
    entities: Array<{
      entity: string;
      type: string;
      importance: string;
      currentMentions: number;
      suggestion: string;
    }>;
    topicClusters: Array<{
      cluster: string;
      keywords: string[];
      coverage: string;
      suggestion: string;
    }>;
    semanticGaps: Array<{
      missingTerm: string;
      reason: string;
      priority: string;
      howToInclude: string;
    }>;
    intentSignals: {
      primaryIntent: string;
      confidence: string;
      intentKeywords: string[];
      optimizationTips: string[];
    };
    overallSemanticScore: number;
    topRecommendations: string[];
  };
}

export function ContentOptimizer() {
  const [targetUrl, setTargetUrl] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [competitorUrls, setCompetitorUrls] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [semanticResult, setSemanticResult] = useState<SemanticAnalysisResult | null>(null);
  const [analysisTab, setAnalysisTab] = useState<"content" | "semantic">("content");

  const runContentOptimization = async () => {
    if (!targetUrl) {
      toast.error("Please enter a URL to analyze");
      return;
    }

    setIsAnalyzing(true);
    try {
      const competitorUrlArray = competitorUrls
        .split("\n")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

      const { data, error } = await supabase.functions.invoke("optimize-page-content", {
        body: {
          url: targetUrl,
          targetKeyword: targetKeyword || undefined,
          competitorUrls: competitorUrlArray,
          includeContentGapAnalysis: competitorUrlArray.length > 0,
        },
      });

      if (error) throw error;

      if (data.success) {
        setOptimizationResult(data.data);
        setAnalysisTab("content");
        toast.success("Content optimization completed!");
      } else {
        throw new Error(data.error || "Optimization failed");
      }
    } catch (error: unknown) {
      logger.error("Optimization error:", error);
      toast.error(error.message || "Failed to optimize content");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runSemanticAnalysis = async () => {
    if (!targetUrl) {
      toast.error("Please enter a URL to analyze");
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-semantic-keywords", {
        body: {
          url: targetUrl,
          targetKeyword: targetKeyword || undefined,
        },
      });

      if (error) throw error;

      if (data.success) {
        setSemanticResult(data.data);
        setAnalysisTab("semantic");
        toast.success("Semantic analysis completed!");
      } else {
        throw new Error(data.error || "Analysis failed");
      }
    } catch (error: unknown) {
      logger.error("Semantic analysis error:", error);
      toast.error(error.message || "Failed to analyze semantic keywords");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "destructive";
      case "medium":
        return "default";
      case "low":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRelevanceColor = (relevance: string) => {
    switch (relevance.toLowerCase()) {
      case "high":
        return "bg-green-100 text-green-800 border-green-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">AI Content Optimizer</h3>
        <p className="text-sm text-muted-foreground">
          Get detailed, actionable suggestions to optimize your content for SEO with AI-powered analysis
        </p>
      </div>

      {/* Input Form */}
      <Card>
        <CardHeader>
          <CardTitle>Page Analysis</CardTitle>
          <CardDescription>
            Enter a URL to analyze and get specific optimization suggestions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target-url">Page URL *</Label>
            <Input
              id="target-url"
              placeholder="https://example.com/page"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-keyword">Target Keyword (Optional)</Label>
            <Input
              id="target-keyword"
              placeholder="e.g., content marketing strategy"
              value={targetKeyword}
              onChange={(e) => setTargetKeyword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="competitor-urls">
              Competitor URLs (Optional - one per line, up to 3)
            </Label>
            <Textarea
              id="competitor-urls"
              placeholder="https://competitor1.com/page&#10;https://competitor2.com/page&#10;https://competitor3.com/page"
              value={competitorUrls}
              onChange={(e) => setCompetitorUrls(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Add competitor URLs to identify content gaps and opportunities
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={runContentOptimization} disabled={isAnalyzing} className="flex-1">
              <Sparkles className={`h-4 w-4 mr-2 ${isAnalyzing ? "animate-pulse" : ""}`} />
              {isAnalyzing ? "Analyzing..." : "Analyze Content"}
            </Button>
            <Button
              onClick={runSemanticAnalysis}
              disabled={isAnalyzing}
              variant="outline"
              className="flex-1"
            >
              <Network className={`h-4 w-4 mr-2 ${isAnalyzing ? "animate-pulse" : ""}`} />
              {isAnalyzing ? "Analyzing..." : "Semantic Analysis"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Content Optimization Results */}
      {optimizationResult && analysisTab === "content" && (
        <div className="space-y-4">
          {/* Overall Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Optimization Score</span>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold">
                    {optimizationResult.optimizations.overallScore || 0}
                  </span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={optimizationResult.optimizations.overallScore || 0} className="h-3" />
            </CardContent>
          </Card>

          {/* Priority Actions */}
          {optimizationResult.optimizations.priorityActions && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                  Top Priority Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {optimizationResult.optimizations.priorityActions.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
                      <span className="text-sm">{action}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Title Optimization */}
          {optimizationResult.optimizations.titleOptimization && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Title Optimization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Current Title</Label>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm">
                      {optimizationResult.optimizations.titleOptimization.current}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 mx-auto text-muted-foreground" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Suggested Title</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          optimizationResult.optimizations.titleOptimization?.suggested || ""
                        )
                      }
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm font-medium">
                      {optimizationResult.optimizations.titleOptimization.suggested}
                    </p>
                  </div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>Why:</strong>{" "}
                    {optimizationResult.optimizations.titleOptimization.reasoning}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Meta Description Optimization */}
          {optimizationResult.optimizations.metaDescriptionOptimization && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Meta Description Optimization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Current Description</Label>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm">
                      {optimizationResult.optimizations.metaDescriptionOptimization.current}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 mx-auto text-muted-foreground" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Suggested Description</Label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        copyToClipboard(
                          optimizationResult.optimizations.metaDescriptionOptimization?.suggested ||
                            ""
                        )
                      }
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm font-medium">
                      {optimizationResult.optimizations.metaDescriptionOptimization.suggested}
                    </p>
                  </div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-800">
                    <strong>Why:</strong>{" "}
                    {optimizationResult.optimizations.metaDescriptionOptimization.reasoning}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Heading Optimizations */}
          {optimizationResult.optimizations.headingOptimizations &&
            optimizationResult.optimizations.headingOptimizations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Heading Improvements ({optimizationResult.optimizations.headingOptimizations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {optimizationResult.optimizations.headingOptimizations.map((heading, idx) => (
                      <AccordionItem key={idx} value={`heading-${idx}`}>
                        <AccordionTrigger>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{heading.type.toUpperCase()}</Badge>
                            <span className="text-sm truncate">{heading.current}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                              <p className="text-xs text-muted-foreground mb-1">Current</p>
                              <p className="text-sm">{heading.current}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 mx-auto text-muted-foreground" />
                            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-muted-foreground">Suggested</p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(heading.suggested)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                              <p className="text-sm font-medium">{heading.suggested}</p>
                            </div>
                            <div className="p-2 bg-blue-50 border border-blue-200 rounded-md">
                              <p className="text-xs text-blue-800">{heading.reasoning}</p>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )}

          {/* LSI Keywords */}
          {optimizationResult.optimizations.lsiKeywords &&
            optimizationResult.optimizations.lsiKeywords.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    LSI Keywords ({optimizationResult.optimizations.lsiKeywords.length})
                  </CardTitle>
                  <CardDescription>
                    Latent Semantic Indexing keywords to improve topical relevance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {optimizationResult.optimizations.lsiKeywords.map((keyword, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className={getRelevanceColor(keyword.relevance)}
                      >
                        {keyword.keyword}
                      </Badge>
                    ))}
                  </div>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    {optimizationResult.optimizations.lsiKeywords.map((keyword, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-md">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{keyword.keyword}</span>
                          <Badge variant="outline" className="text-xs">
                            {keyword.relevance}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{keyword.placement}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Content Gaps */}
          {optimizationResult.optimizations.contentGaps &&
            optimizationResult.optimizations.contentGaps.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Content Gaps ({optimizationResult.optimizations.contentGaps.length})
                  </CardTitle>
                  <CardDescription>
                    Missing topics and sections compared to top-ranking competitors
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {optimizationResult.optimizations.contentGaps.map((gap, idx) => (
                      <div
                        key={idx}
                        className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-sm">{gap.topic}</h4>
                          <Badge variant={getPriorityColor(gap.priority)}>{gap.priority}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {gap.suggestedContent}
                        </p>
                        <p className="text-xs text-blue-600">
                          <strong>Placement:</strong> {gap.placement}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Key Rewrite Suggestions */}
          {optimizationResult.optimizations.keyRewriteSuggestions &&
            optimizationResult.optimizations.keyRewriteSuggestions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Specific Rewrite Suggestions ({optimizationResult.optimizations.keyRewriteSuggestions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="w-full">
                    {optimizationResult.optimizations.keyRewriteSuggestions.map((rewrite, idx) => (
                      <AccordionItem key={idx} value={`rewrite-${idx}`}>
                        <AccordionTrigger>
                          <span className="text-sm font-medium">{rewrite.section}</span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                              <p className="text-xs text-muted-foreground mb-1">Current</p>
                              <p className="text-sm">{rewrite.currentText}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 mx-auto text-muted-foreground" />
                            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-muted-foreground">Suggested</p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(rewrite.suggestedText)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                              <p className="text-sm">{rewrite.suggestedText}</p>
                            </div>
                            <div className="p-2 bg-blue-50 border border-blue-200 rounded-md">
                              <p className="text-xs text-blue-800">
                                <strong>Improvement:</strong> {rewrite.improvement}
                              </p>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )}
        </div>
      )}

      {/* Semantic Analysis Results */}
      {semanticResult && analysisTab === "semantic" && (
        <div className="space-y-4">
          {/* Semantic Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Semantic Score</span>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold">
                    {semanticResult.analysis.overallSemanticScore || 0}
                  </span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={semanticResult.analysis.overallSemanticScore || 0} className="h-3" />
            </CardContent>
          </Card>

          {/* Top Recommendations */}
          {semanticResult.analysis.topRecommendations && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Top Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {semanticResult.analysis.topRecommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
                      <span className="text-sm">{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Intent Signals */}
          {semanticResult.analysis.intentSignals && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Search Intent Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Primary Intent:</span>
                  <Badge variant="default" className="capitalize">
                    {semanticResult.analysis.intentSignals.primaryIntent}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {semanticResult.analysis.intentSignals.confidence} confidence
                  </Badge>
                </div>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2">Optimization Tips:</h4>
                  <ul className="space-y-1">
                    {semanticResult.analysis.intentSignals.optimizationTips.map((tip, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span>•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* LSI Keywords from Semantic Analysis */}
          {semanticResult.analysis.lsiKeywords && semanticResult.analysis.lsiKeywords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  LSI Keywords ({semanticResult.analysis.lsiKeywords.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {semanticResult.analysis.lsiKeywords.map((keyword, idx) => (
                    <div key={idx} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{keyword.keyword}</span>
                        <Badge variant="outline" className={getRelevanceColor(keyword.relevance)}>
                          {keyword.relevance}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                        <span>Current: {keyword.currentMentions}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span>Suggested: {keyword.suggestedMentions}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{keyword.context}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entities */}
          {semanticResult.analysis.entities && semanticResult.analysis.entities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Entities ({semanticResult.analysis.entities.length})
                </CardTitle>
                <CardDescription>
                  Important people, places, organizations, and concepts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {semanticResult.analysis.entities.map((entity, idx) => (
                    <div key={idx} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{entity.entity}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize text-xs">
                            {entity.type}
                          </Badge>
                          <Badge variant={getPriorityColor(entity.importance)}>
                            {entity.importance}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        Current mentions: {entity.currentMentions}
                      </p>
                      <p className="text-xs text-blue-600">{entity.suggestion}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Topic Clusters */}
          {semanticResult.analysis.topicClusters &&
            semanticResult.analysis.topicClusters.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    Topic Clusters ({semanticResult.analysis.topicClusters.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {semanticResult.analysis.topicClusters.map((cluster, idx) => (
                      <div key={idx} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-sm">{cluster.cluster}</h4>
                          <Badge
                            variant={
                              cluster.coverage === "covered"
                                ? "default"
                                : cluster.coverage === "partially-covered"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {cluster.coverage}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {cluster.keywords.map((kw, kidx) => (
                            <Badge key={kidx} variant="outline" className="text-xs">
                              {kw}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">{cluster.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Semantic Gaps */}
          {semanticResult.analysis.semanticGaps &&
            semanticResult.analysis.semanticGaps.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Semantic Gaps ({semanticResult.analysis.semanticGaps.length})
                  </CardTitle>
                  <CardDescription>Missing terms that should be included</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {semanticResult.analysis.semanticGaps.map((gap, idx) => (
                      <div key={idx} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{gap.missingTerm}</span>
                          <Badge variant={getPriorityColor(gap.priority)}>{gap.priority}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{gap.reason}</p>
                        <p className="text-xs text-blue-600">
                          <strong>How to include:</strong> {gap.howToInclude}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
        </div>
      )}

      {/* Empty State */}
      {!optimizationResult && !semanticResult && !isAnalyzing && (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Ready to Optimize Your Content</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Enter a URL above and click "Analyze Content" to get AI-powered optimization suggestions
              with specific before/after examples.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
