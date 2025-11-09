import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  Zap,
  Brain,
  Star,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDistanceToNow } from "date-fns";

interface PerformanceMetrics {
  metric_date: string;
  total_tickets: number;
  auto_resolvable_tickets: number;
  auto_resolved_tickets: number;
  ai_assisted_tickets: number;
  resolved_tickets: number;
  avg_resolution_hours: number;
  avg_csat_rating: number;
  avg_csat_ai_assisted: number;
  avg_csat_auto_resolved: number;
  issue_breakdown: Array<{
    issue_type: string;
    ticket_count: number;
    avg_confidence: number;
    resolved_count: number;
    avg_resolution_hours: number;
  }>;
}

export function SupportPerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    loadMetrics();
  }, [period]);

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_performance_metrics')
        .select('*')
        .order('metric_date', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      setMetrics(data);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !metrics) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  const autoResolutionRate = metrics.total_tickets > 0
    ? (metrics.auto_resolved_tickets / metrics.total_tickets) * 100
    : 0;

  const aiAssistedRate = metrics.total_tickets > 0
    ? (metrics.ai_assisted_tickets / metrics.total_tickets) * 100
    : 0;

  const resolutionRate = metrics.total_tickets > 0
    ? (metrics.resolved_tickets / metrics.total_tickets) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Total Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total_tickets}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Auto-Resolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.auto_resolved_tickets}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={autoResolutionRate >= 30 ? "default" : "secondary"} className="text-xs">
                {autoResolutionRate.toFixed(0)}%
              </Badge>
              {autoResolutionRate >= 30 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-500" />
              AI-Assisted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.ai_assisted_tickets}</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {aiAssistedRate.toFixed(0)}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Avg Resolution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.avg_resolution_hours?.toFixed(1) || 0}h</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.avg_resolution_hours < 6 ? 'Excellent' : metrics.avg_resolution_hours < 12 ? 'Good' : 'Needs improvement'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* CSAT Ratings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Customer Satisfaction (CSAT)
          </CardTitle>
          <CardDescription>Average ratings across different resolution methods</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Overall CSAT</p>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-bold">{metrics.avg_csat_rating?.toFixed(1) || 'N/A'}</div>
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
              </div>
              <div className="mt-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-yellow-500 h-2 rounded-full"
                    style={{ width: `${(metrics.avg_csat_rating / 5) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-purple-50">
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                <Brain className="h-3 w-3" />
                AI-Assisted
              </p>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-bold">{metrics.avg_csat_ai_assisted?.toFixed(1) || 'N/A'}</div>
                <Star className="h-5 w-5 text-purple-500 fill-purple-500" />
              </div>
              <div className="mt-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full"
                    style={{ width: `${(metrics.avg_csat_ai_assisted / 5) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg bg-green-50">
              <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Auto-Resolved
              </p>
              <div className="flex items-center gap-2">
                <div className="text-3xl font-bold">{metrics.avg_csat_auto_resolved?.toFixed(1) || 'N/A'}</div>
                <Star className="h-5 w-5 text-green-500 fill-green-500" />
              </div>
              <div className="mt-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${(metrics.avg_csat_auto_resolved / 5) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Issue Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Issues by Type
          </CardTitle>
          <CardDescription>Breakdown of tickets by issue classification</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {metrics.issue_breakdown?.slice(0, 5).map((issue) => {
              const resolutionRate = (issue.resolved_count / issue.ticket_count) * 100;

              return (
                <div key={issue.issue_type} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {issue.issue_type.replace('_', ' ')}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {issue.ticket_count} tickets
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {issue.avg_resolution_hours?.toFixed(1)}h avg
                      </span>
                      <Badge
                        variant={resolutionRate >= 80 ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {resolutionRate.toFixed(0)}% resolved
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${resolutionRate}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {(issue.avg_confidence * 100).toFixed(0)}% ✓
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Performance Summary */}
      <Card>
        <CardHeader>
          <CardTitle>AI Performance Impact</CardTitle>
          <CardDescription>How AI automation is improving support efficiency</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <p className="text-sm font-semibold">Time Saved</p>
              </div>
              <p className="text-2xl font-bold">
                {(metrics.auto_resolved_tickets * 10).toFixed(0)} minutes
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Assuming 10 min saved per auto-resolved ticket
              </p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <p className="text-sm font-semibold">Resolution Rate</p>
              </div>
              <p className="text-2xl font-bold">{resolutionRate.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.resolved_tickets} of {metrics.total_tickets} tickets resolved
              </p>
            </div>
          </div>

          {autoResolutionRate >= 30 && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-900">Excellent Automation Rate!</p>
                  <p className="text-xs text-green-700 mt-1">
                    Your auto-resolution rate of {autoResolutionRate.toFixed(0)}% is above the target of 30%.
                    This is saving significant support time.
                  </p>
                </div>
              </div>
            </div>
          )}

          {autoResolutionRate < 30 && metrics.total_tickets > 10 && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow-900">Automation Opportunity</p>
                  <p className="text-xs text-yellow-700 mt-1">
                    Current auto-resolution rate is {autoResolutionRate.toFixed(0)}%. Target is 30-40%.
                    Consider adding more response templates and knowledge base articles.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
