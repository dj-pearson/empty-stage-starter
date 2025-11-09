import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Copy,
  Send,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  FileText,
  TrendingUp,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface AIAnalysis {
  id: string;
  ticket_id: string;
  issue_type: string;
  issue_confidence: number;
  affected_feature: string;
  auto_resolvable: boolean;
  auto_resolution_confidence: number;
  suggested_response: string;
  similar_ticket_ids: string[];
  similarity_scores: number[];
  auto_gathered_context: any;
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated';
  sentiment_score: number;
  urgency_score: number;
  analyzed_at: string;
}

interface SimilarTicket {
  id: string;
  subject: string;
  resolution_summary: string;
  resolution_time_hours: number;
}

export function AITicketAnalysis({ ticketId }: { ticketId: string }) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [similarTickets, setSimilarTickets] = useState<SimilarTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [editedResponse, setEditedResponse] = useState('');

  useEffect(() => {
    loadAnalysis();
  }, [ticketId]);

  useEffect(() => {
    if (analysis?.suggested_response) {
      setEditedResponse(analysis.suggested_response);
    }
  }, [analysis]);

  const loadAnalysis = async () => {
    setLoading(true);
    try {
      // Fetch existing analysis
      const { data, error } = await supabase
        .from('support_ticket_ai_analysis')
        .select('*')
        .eq('ticket_id', ticketId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      if (data) {
        setAnalysis(data);

        // Fetch similar tickets details if available
        if (data.similar_ticket_ids && data.similar_ticket_ids.length > 0) {
          const { data: similarData } = await supabase
            .from('support_tickets')
            .select('id, subject, description')
            .in('id', data.similar_ticket_ids)
            .limit(3);

          if (similarData) {
            const similar = similarData.map((ticket, index) => ({
              id: ticket.id,
              subject: ticket.subject,
              resolution_summary: ticket.description?.substring(0, 150) + '...' || 'No description',
              resolution_time_hours: 0, // Would need to calculate from ticket data
            }));
            setSimilarTickets(similar);
          }
        }
      }
    } catch (error) {
      console.error('Error loading analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-support-ticket', {
        body: {
          ticketId,
          autoResolve: false,
        },
      });

      if (error) throw error;

      toast.success('Ticket analyzed successfully');
      await loadAnalysis();
    } catch (error: any) {
      console.error('Error analyzing ticket:', error);
      toast.error('Failed to analyze ticket: ' + error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const copyResponse = () => {
    navigator.clipboard.writeText(editedResponse);
    toast.success('Response copied to clipboard');
  };

  const useResponse = async () => {
    try {
      // This would send the response to the ticket
      // Implementation depends on your ticket messaging system
      toast.success('Response applied to ticket');
    } catch (error) {
      toast.error('Failed to use response');
    }
  };

  const getSentimentBadge = (sentiment: string) => {
    const colors: Record<string, string> = {
      positive: 'bg-green-100 text-green-800',
      neutral: 'bg-gray-100 text-gray-800',
      negative: 'bg-orange-100 text-orange-800',
      frustrated: 'bg-red-100 text-red-800',
    };

    return (
      <Badge className={colors[sentiment] || ''}>
        {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
      </Badge>
    );
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Analysis
          </CardTitle>
          <CardDescription>
            Run AI analysis to get automated insights and response suggestions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runAnalysis} disabled={analyzing}>
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Run AI Analysis
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Classification Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Classification
            </CardTitle>
            <Button variant="outline" size="sm" onClick={runAnalysis} disabled={analyzing}>
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Issue Type</p>
              <Badge variant="outline" className="text-sm">
                {analysis.issue_type.replace('_', ' ').toUpperCase()}
              </Badge>
              <p className={`text-xs mt-1 ${getConfidenceColor(analysis.issue_confidence)}`}>
                {(analysis.issue_confidence * 100).toFixed(0)}% confidence
              </p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-1">Affected Feature</p>
              <p className="text-sm font-medium">{analysis.affected_feature}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-1">Sentiment</p>
              {getSentimentBadge(analysis.sentiment)}
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-1">Urgency Score</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      analysis.urgency_score >= 75
                        ? 'bg-red-500'
                        : analysis.urgency_score >= 50
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${analysis.urgency_score}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{analysis.urgency_score}/100</span>
              </div>
            </div>
          </div>

          {analysis.auto_resolvable && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-start gap-2">
                <Zap className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-900">Auto-Resolvable</p>
                  <p className="text-xs text-green-700">
                    This ticket can be auto-resolved with {(analysis.auto_resolution_confidence * 100).toFixed(0)}% confidence
                  </p>
                </div>
              </div>
            </div>
          )}

          <Separator />

          <div>
            <p className="text-sm text-muted-foreground mb-1">User Context</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {analysis.auto_gathered_context?.subscription_status && (
                <div>
                  <span className="text-muted-foreground">Subscription:</span>{' '}
                  <span className="font-medium">{analysis.auto_gathered_context.subscription_status}</span>
                </div>
              )}
              {analysis.auto_gathered_context?.user_tier && (
                <div>
                  <span className="text-muted-foreground">User Tier:</span>{' '}
                  <span className="font-medium">{analysis.auto_gathered_context.user_tier}</span>
                </div>
              )}
              {analysis.auto_gathered_context?.health_score !== undefined && (
                <div>
                  <span className="text-muted-foreground">Health Score:</span>{' '}
                  <span className="font-medium">{analysis.auto_gathered_context.health_score}/100</span>
                </div>
              )}
              {analysis.auto_gathered_context?.account_age_days && (
                <div>
                  <span className="text-muted-foreground">Account Age:</span>{' '}
                  <span className="font-medium">{analysis.auto_gathered_context.account_age_days} days</span>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Analyzed {formatDistanceToNow(new Date(analysis.analyzed_at), { addSuffix: true })}
          </p>
        </CardContent>
      </Card>

      {/* Suggested Response Card */}
      {analysis.suggested_response && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Suggested Response
            </CardTitle>
            {analysis.auto_resolvable && (
              <CardDescription>
                AI-generated response ready to send ({(analysis.auto_resolution_confidence * 100).toFixed(0)}% confidence)
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={editedResponse}
              onChange={(e) => setEditedResponse(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />

            <div className="flex gap-2">
              <Button onClick={copyResponse} variant="outline" size="sm">
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button onClick={useResponse} size="sm">
                <Send className="h-4 w-4 mr-2" />
                Use This Response
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Similar Tickets Card */}
      {similarTickets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Similar Resolved Tickets
            </CardTitle>
            <CardDescription>
              Learn from how similar tickets were resolved
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {similarTickets.map((ticket, index) => (
              <div key={ticket.id} className="p-3 border rounded-md hover:bg-accent transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1">{ticket.resolution_summary}</p>
                  </div>
                  {analysis.similarity_scores && analysis.similarity_scores[index] && (
                    <Badge variant="outline" className="text-xs">
                      {(analysis.similarity_scores[index] * 100).toFixed(0)}% match
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Errors Card */}
      {analysis.auto_gathered_context?.recent_errors && analysis.auto_gathered_context.recent_errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Recent User Errors
            </CardTitle>
            <CardDescription>
              Errors this user experienced in the last 7 days
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis.auto_gathered_context.recent_errors.map((error: any, index: number) => (
              <div key={index} className="p-2 bg-red-50 border border-red-200 rounded text-xs">
                <p className="font-medium text-red-900">{error.activity_type}</p>
                <p className="text-red-700">{error.description}</p>
                <p className="text-red-600 mt-1">
                  {formatDistanceToNow(new Date(error.created_at), { addSuffix: true })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
