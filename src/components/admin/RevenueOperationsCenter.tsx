import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  CheckCircle,
  Zap,
  BarChart3,
  Calendar,
  Mail,
  RefreshCw,
  Loader2,
  ArrowRight,
  Target,
} from "lucide-react";
import { supabase } from "@/lib/supabase-platform";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

interface RevenueMetrics {
  metric_date: string;
  active_subscriptions: number;
  mrr: number;
  arr: number;
  new_subscriptions_today: number;
  churned_subscriptions_today: number;
  net_new_mrr: number;
  mrr_growth_pct: number;
  churn_rate_pct: number;
}

interface ChurnPrediction {
  id: string;
  user_id: string;
  churn_probability: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: any;
  trend: 'improving' | 'stable' | 'declining';
  last_calculated: string;
  // Joined data
  user_email?: string;
  user_name?: string;
  subscription_status?: string;
  mrr?: number;
}

interface Intervention {
  id: string;
  user_id: string;
  intervention_type: string;
  status: string;
  triggered_at: string;
  executed_at: string;
  conversion_achieved: boolean;
  revenue_impact: number;
  // Joined data
  user_email?: string;
}

interface CohortRetention {
  cohort_month: string;
  cohort_size: number;
  m0_retention_pct: number;
  m1_retention_pct: number;
  m2_retention_pct: number;
  m3_retention_pct: number;
  m6_retention_pct: number;
  avg_ltv: number;
}

export function RevenueOperationsCenter() {
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [atRiskUsers, setAtRiskUsers] = useState<ChurnPrediction[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [cohorts, setCohorts] = useState<CohortRetention[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadMetrics(),
        loadAtRiskUsers(),
        loadRecentInterventions(),
        loadCohortData(),
      ]);
    } catch (error) {
      console.error('Error loading revenue data:', error);
      toast.error('Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    // @ts-ignore - Table exists but not in generated types
    const { data, error } = await supabase
      // @ts-ignore
      .from('revenue_metrics_daily')
      .select('*')
      .order('metric_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    setMetrics(data as RevenueMetrics | null);
  };

  const loadAtRiskUsers = async () => {
    // @ts-ignore - Table exists but not in generated types
    const { data, error } = await supabase
      // @ts-ignore
      .from('revenue_churn_predictions')
      .select('*')
      .in('risk_level', ['high', 'critical'])
      .order('churn_probability', { ascending: false })
      .limit(20);

    if (error) throw error;

    const formatted = data?.map((item: any) => ({
      ...item,
      user_email: `user-${item.user_id.substring(0, 8)}`,
      user_name: 'User',
      subscription_status: 'active',
    })) || [];

    setAtRiskUsers(formatted);
  };

  const loadRecentInterventions = async () => {
    // @ts-ignore - Table exists but not in generated types
    const { data, error } = await supabase
      // @ts-ignore
      .from('revenue_interventions')
      .select('*')
      .order('triggered_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    const formatted = data?.map((item: any) => ({
      ...item,
      user_email: `user-${item.user_id?.substring(0, 8) || 'unknown'}`,
    })) || [];

    setInterventions(formatted);
  };

  const loadCohortData = async () => {
    // @ts-ignore - Table exists but not in generated types
    const { data, error } = await supabase
      // @ts-ignore
      .from('revenue_cohort_retention')
      .select('*')
      .order('cohort_month', { ascending: false })
      .limit(6);

    if (error) throw error;
    setCohorts((data || []) as CohortRetention[]);
  };

  const updateChurnPredictions = async () => {
    setUpdating(true);
    try {
      // @ts-ignore - RPC function exists but not in generated types
      const { error } = await supabase.rpc('update_all_churn_predictions');
      if (error) throw error;
      toast.success('Churn predictions updated');
      await loadAtRiskUsers();
    } catch (error) {
      console.error('Error updating predictions:', error);
      toast.error('Failed to update churn predictions');
    } finally {
      setUpdating(false);
    }
  };

  const triggerInterventions = async () => {
    setUpdating(true);
    try {
      // @ts-ignore - RPC function exists but not in generated types
      const { data, error } = await supabase.rpc('trigger_churn_interventions');
      if (error) throw error;
      toast.success(`${data || 0} interventions triggered`);
      await loadRecentInterventions();
    } catch (error) {
      console.error('Error triggering interventions:', error);
      toast.error('Failed to trigger interventions');
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              MRR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics.mrr?.toLocaleString() || 0}</div>
            <div className="flex items-center gap-2 mt-1">
              {metrics.mrr_growth_pct >= 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-green-600">+{metrics.mrr_growth_pct}% MoM</span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 text-red-500" />
                  <span className="text-xs text-red-600">{metrics.mrr_growth_pct}% MoM</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              ARR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics.arr?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Annual run rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              Active Subs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.active_subscriptions?.toLocaleString() || 0}</div>
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span className="text-green-600">+{metrics.new_subscriptions_today || 0} new</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-red-600">-{metrics.churned_subscriptions_today || 0} churned</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Churn Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.churn_rate_pct?.toFixed(1) || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.churn_rate_pct < 5 ? 'Healthy' : metrics.churn_rate_pct < 8 ? 'Monitor' : 'Action needed'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="at-risk" className="space-y-4">
        <TabsList>
          <TabsTrigger value="at-risk">At-Risk Customers</TabsTrigger>
          <TabsTrigger value="interventions">Active Interventions</TabsTrigger>
          <TabsTrigger value="cohorts">Cohort Analysis</TabsTrigger>
          <TabsTrigger value="forecast">Revenue Forecast</TabsTrigger>
        </TabsList>

        {/* At-Risk Customers Tab */}
        <TabsContent value="at-risk" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    High-Risk Customers
                  </CardTitle>
                  <CardDescription>
                    Customers with 50%+ churn probability requiring intervention
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={updateChurnPredictions} disabled={updating}>
                    {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" onClick={triggerInterventions} disabled={updating}>
                    <Zap className="h-4 w-4 mr-2" />
                    Trigger Interventions
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {atRiskUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>No high-risk customers detected!</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {atRiskUsers.map((user) => (
                      <Card key={user.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium">{user.user_email}</p>
                              <Badge
                                variant={user.risk_level === 'critical' ? 'destructive' : 'secondary'}
                                className={user.risk_level === 'critical' ? 'animate-pulse' : ''}
                              >
                                {user.risk_level.toUpperCase()}
                              </Badge>
                              {user.trend && (
                                <Badge variant="outline" className="text-xs">
                                  {user.trend === 'declining' && <TrendingDown className="h-3 w-3 mr-1 text-red-500" />}
                                  {user.trend === 'improving' && <TrendingUp className="h-3 w-3 mr-1 text-green-500" />}
                                  {user.trend}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>Churn Probability: {(user.churn_probability * 100).toFixed(0)}%</span>
                              <span>•</span>
                              <span>Status: {user.subscription_status}</span>
                            </div>
                            <div className="mt-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    user.churn_probability >= 0.7 ? 'bg-red-500' : 'bg-yellow-500'
                                  }`}
                                  style={{ width: `${user.churn_probability * 100}%` }}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              Last updated {formatDistanceToNow(new Date(user.last_calculated), { addSuffix: true })}
                            </p>
                          </div>
                          <Button variant="outline" size="sm" asChild>
                            <a href={`/admin?tab=intelligence`}>
                              View Details
                              <ArrowRight className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Churn Prevention Impact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Churn Prevention Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">MRR at Risk</p>
                  <p className="text-2xl font-bold text-red-600">
                    ${atRiskUsers.reduce((sum, u) => sum + (u.mrr || 0), 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {atRiskUsers.length} customers
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Intervention Success Rate</p>
                  <p className="text-2xl font-bold text-green-600">
                    {interventions.filter(i => i.conversion_achieved).length > 0
                      ? ((interventions.filter(i => i.conversion_achieved).length / interventions.length) * 100).toFixed(0)
                      : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on recent interventions
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Revenue Saved (30d)</p>
                  <p className="text-2xl font-bold text-blue-600">
                    ${interventions.reduce((sum, i) => sum + (i.revenue_impact || 0), 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    From successful interventions
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Interventions Tab */}
        <TabsContent value="interventions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Recent Interventions
              </CardTitle>
              <CardDescription>Automated campaigns and their outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {interventions.map((intervention) => (
                    <div key={intervention.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{intervention.user_email}</p>
                            <Badge variant={intervention.status === 'converted' ? 'default' : 'secondary'}>
                              {intervention.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground capitalize">
                            {intervention.intervention_type.replace('_', ' ')}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                            <span>
                              Triggered {formatDistanceToNow(new Date(intervention.triggered_at), { addSuffix: true })}
                            </span>
                            {intervention.executed_at && (
                              <>
                                <span>•</span>
                                <span>
                                  Executed {formatDistanceToNow(new Date(intervention.executed_at), { addSuffix: true })}
                                </span>
                              </>
                            )}
                          </div>
                          {intervention.conversion_achieved && intervention.revenue_impact > 0 && (
                            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                              <CheckCircle className="h-3 w-3 inline mr-1 text-green-600" />
                              <span className="text-green-900 font-medium">
                                Revenue saved: ${intervention.revenue_impact}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cohort Analysis Tab */}
        <TabsContent value="cohorts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Cohort Retention Analysis
              </CardTitle>
              <CardDescription>Retention rates by signup cohort</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Cohort</th>
                      <th className="text-right p-2">Size</th>
                      <th className="text-right p-2">M0</th>
                      <th className="text-right p-2">M1</th>
                      <th className="text-right p-2">M2</th>
                      <th className="text-right p-2">M3</th>
                      <th className="text-right p-2">M6</th>
                      <th className="text-right p-2">Avg LTV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map((cohort) => (
                      <tr key={cohort.cohort_month} className="border-b hover:bg-accent">
                        <td className="p-2 font-medium">{format(new Date(cohort.cohort_month), 'MMM yyyy')}</td>
                        <td className="text-right p-2">{cohort.cohort_size}</td>
                        <td className="text-right p-2">
                          <Badge variant="outline">{cohort.m0_retention_pct}%</Badge>
                        </td>
                        <td className="text-right p-2">
                          <Badge variant="outline">{cohort.m1_retention_pct}%</Badge>
                        </td>
                        <td className="text-right p-2">
                          <Badge variant="outline">{cohort.m2_retention_pct}%</Badge>
                        </td>
                        <td className="text-right p-2">
                          <Badge variant="outline">{cohort.m3_retention_pct}%</Badge>
                        </td>
                        <td className="text-right p-2">
                          <Badge variant="outline">{cohort.m6_retention_pct || 'N/A'}</Badge>
                        </td>
                        <td className="text-right p-2 font-medium">${cohort.avg_ltv?.toFixed(0) || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Separator className="my-6" />

              <div className="space-y-2">
                <p className="text-sm font-semibold">Insights:</p>
                {cohorts.length > 1 && (
                  <>
                    {cohorts[0].m1_retention_pct > cohorts[cohorts.length - 1].m1_retention_pct && (
                      <div className="flex items-start gap-2 text-sm">
                        <TrendingUp className="h-4 w-4 text-green-500 mt-0.5" />
                        <span>
                          Recent cohorts showing improved retention (+
                          {(cohorts[0].m1_retention_pct - cohorts[cohorts.length - 1].m1_retention_pct).toFixed(0)}% vs
                          oldest)
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <BarChart3 className="h-4 w-4 mt-0.5" />
                      <span>
                        Average M3 retention across all cohorts:{' '}
                        {(cohorts.reduce((sum, c) => sum + c.m3_retention_pct, 0) / cohorts.length).toFixed(0)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revenue Forecast Tab */}
        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Revenue Forecast
              </CardTitle>
              <CardDescription>Projected revenue growth scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-8 text-center text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Revenue forecasting dashboard coming soon</p>
                <p className="text-sm mt-2">
                  Will include conservative, base, and optimistic scenarios based on current growth trends
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
