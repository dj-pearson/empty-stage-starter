// @ts-nocheck - Database tables require migrations to be approved
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Calendar, RefreshCw, TrendingUp, Eye } from "lucide-react";
import { WeeklyReportCard } from "@/components/WeeklyReportCard";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { toast } from "sonner";
import { format } from "date-fns";

interface Report {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: string;
  meals_planned: number;
  planning_completion_rate: number;
  nutrition_score: number;
  voting_participation_rate: number;
  avg_meal_approval_score: number;
  generated_at: string;
  viewed_at?: string;
}

interface ReportHistoryProps {
  householdId: string;
  className?: string;
}

export function ReportHistory({ householdId, className }: ReportHistoryProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);

  useEffect(() => {
    loadReports();
  }, [householdId]);

  const loadReports = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('household_id', householdId)
        .order('week_start_date', { ascending: false })
        .limit(12); // Last 12 weeks (3 months)

      if (error) throw error;

      setReports(data || []);
    } catch (error) {
      console.error('Error loading reports:', error);
      toast.error('Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  };

  const generateThisWeek = async () => {
    try {
      setIsGenerating(true);

      const { data, error } = await invokeEdgeFunction<{ report: Report }>('generate-weekly-report', {
        body: { householdId },
      });

      if (error) {
        throw error;
      }

      toast.success('Weekly report generated!');
      await loadReports();

      // Show the new report
      if (data?.report?.id) {
        await viewReport(data.report.id);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate report');
    } finally {
      setIsGenerating(false);
    }
  };

  const viewReport = async (reportId: string) => {
    try {
      // Load full report
      const { data: report, error: reportError } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (reportError) throw reportError;

      // Load insights
      const { data: insightsData, error: insightsError } = await supabase
        .from('report_insights')
        .select('*')
        .eq('report_id', reportId)
        .order('priority', { ascending: false });

      if (insightsError) throw insightsError;

      setSelectedReport(report);
      setInsights(insightsData || []);
      setShowReportDialog(true);

      // Mark as viewed
      if (!report.viewed_at) {
        await supabase
          .from('weekly_reports')
          .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
          .eq('id', reportId);

        // Update local state
        setReports(prev => prev.map(r =>
          r.id === reportId
            ? { ...r, viewed_at: new Date().toISOString(), status: 'viewed' }
            : r
        ));
      }
    } catch (error) {
      console.error('Error loading report:', error);
      toast.error('Failed to load report details');
    }
  };

  if (isLoading) {
    return (
      <div className={className}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Weekly Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className={className}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Weekly Reports
              </CardTitle>
              <Button
                onClick={generateThisWeek}
                disabled={isGenerating}
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                {isGenerating ? 'Generating...' : 'Generate This Week'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">No reports yet</p>
                <Button onClick={generateThisWeek} disabled={isGenerating}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
                  Generate Your First Report
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map(report => (
                  <ReportSummaryCard
                    key={report.id}
                    report={report}
                    onView={() => viewReport(report.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Weekly Report Details</DialogTitle>
            <DialogDescription className="sr-only">View and manage your weekly nutrition reports</DialogDescription>
          </DialogHeader>
          {selectedReport && (
            <WeeklyReportCard
              report={selectedReport}
              insights={insights}
              detailed={true}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ReportSummaryCardProps {
  report: Report;
  onView: () => void;
}

function ReportSummaryCard({ report, onView }: ReportSummaryCardProps) {
  const weekStart = new Date(report.week_start_date);
  const weekEnd = new Date(report.week_end_date);

  const isNew = report.status === 'generated' && !report.viewed_at;

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={onView}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <p className="font-medium">
                {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </p>
              {isNew && (
                <Badge variant="secondary" className="bg-primary/10">
                  New
                </Badge>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Meals: </span>
                <span className="font-medium">{report.meals_planned}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Completion: </span>
                <span className="font-medium">{report.planning_completion_rate.toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Nutrition: </span>
                <span className="font-medium">{report.nutrition_score.toFixed(0)}/100</span>
              </div>
              <div>
                <span className="text-muted-foreground">Kid Approval: </span>
                <span className="font-medium">{report.avg_meal_approval_score.toFixed(0)}%</span>
              </div>
            </div>
          </div>

          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onView(); }}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
