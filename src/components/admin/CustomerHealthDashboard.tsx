/**
 * Customer Health Dashboard Admin Component
 *
 * Displays customer health scores, at-risk customers, and engagement metrics
 * for proactive customer success management.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Trophy,
  Heart,
  Activity,
} from 'lucide-react';
import {
  customerHealth,
  HealthScore,
  HealthSummary,
  HealthTier,
  TIER_INFO,
} from '@/lib/customer-health';
import { cn } from '@/lib/utils';

/**
 * Tier icons
 */
const TIER_ICONS: Record<HealthTier, React.ReactNode> = {
  champion: <Trophy className="h-4 w-4" />,
  healthy: <Heart className="h-4 w-4" />,
  neutral: <Minus className="h-4 w-4" />,
  at_risk: <AlertTriangle className="h-4 w-4" />,
  churning: <TrendingDown className="h-4 w-4" />,
};

/**
 * Trend icons
 */
function TrendIcon({ trend }: { trend: string }) {
  switch (trend) {
    case 'improving':
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    case 'declining':
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
}

export function CustomerHealthDashboard() {
  const [summary, setSummary] = useState<HealthSummary[]>([]);
  const [atRiskCustomers, setAtRiskCustomers] = useState<HealthScore[]>([]);
  const [champions, setChampions] = useState<HealthScore[]>([]);
  const [decliningCustomers, setDecliningCustomers] = useState<HealthScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [summaryData, atRiskData, championsData, decliningData] = await Promise.all([
        customerHealth.getHealthSummary(),
        customerHealth.getAtRiskCustomers(20),
        customerHealth.getChampions(10),
        customerHealth.getDecliningCustomers(20),
      ]);

      setSummary(summaryData);
      setAtRiskCustomers(atRiskData);
      setChampions(championsData);
      setDecliningCustomers(decliningData);
    } catch (_error) {
      toast.error('Failed to load health data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecalculateAll = async () => {
    setIsRecalculating(true);
    try {
      const result = await customerHealth.recalculateAllScores();
      toast.success(`Recalculated ${result.processed} scores (${result.errors} errors)`);
      loadData();
    } catch (_error) {
      toast.error('Failed to recalculate scores');
    } finally {
      setIsRecalculating(false);
    }
  };

  const totalUsers = summary.reduce((sum, s) => sum + s.userCount, 0);
  const avgScore = summary.length > 0
    ? Math.round(summary.reduce((sum, s) => sum + s.avgScore * s.userCount, 0) / totalUsers)
    : 0;

  const healthyPercentage = summary.length > 0
    ? Math.round(
        ((summary.find(s => s.tier === 'champion')?.userCount || 0) +
         (summary.find(s => s.tier === 'healthy')?.userCount || 0)) /
        totalUsers * 100
      )
    : 0;

  const atRiskPercentage = summary.length > 0
    ? Math.round(
        ((summary.find(s => s.tier === 'at_risk')?.userCount || 0) +
         (summary.find(s => s.tier === 'churning')?.userCount || 0)) /
        totalUsers * 100
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Customer Health</h2>
          <p className="text-muted-foreground">Monitor engagement and identify at-risk customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={handleRecalculateAll} disabled={isRecalculating}>
            <Activity className={cn("h-4 w-4 mr-2", isRecalculating && "animate-spin")} />
            Recalculate All
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Health Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgScore}</div>
            <Progress value={avgScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalUsers.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Across all tiers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Healthy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{healthyPercentage}%</div>
            <p className="text-sm text-muted-foreground">Champions + Healthy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">At Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{atRiskPercentage}%</div>
            <p className="text-sm text-muted-foreground">At Risk + Churning</p>
          </CardContent>
        </Card>
      </div>

      {/* Tier Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Health Tier Distribution</CardTitle>
          <CardDescription>Customer breakdown by engagement level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            {(['champion', 'healthy', 'neutral', 'at_risk', 'churning'] as HealthTier[]).map((tier) => {
              const tierData = summary.find(s => s.tier === tier);
              const tierInfo = TIER_INFO[tier];
              const percentage = totalUsers > 0 ? Math.round((tierData?.userCount || 0) / totalUsers * 100) : 0;

              return (
                <Card key={tier} className="relative overflow-hidden">
                  <div className={cn("absolute inset-0 opacity-10", tierInfo.bgColor)} />
                  <CardContent className="pt-6 relative">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("p-2 rounded-full", tierInfo.bgColor, tierInfo.color)}>
                        {TIER_ICONS[tier]}
                      </div>
                      <div>
                        <p className="font-semibold">{tierInfo.label}</p>
                        <p className="text-xs text-muted-foreground">{tierInfo.description}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-bold">{tierData?.userCount || 0}</div>
                      <p className="text-sm text-muted-foreground">{percentage}% of users</p>
                      <Progress value={percentage} className="mt-2 h-2" />
                    </div>
                    {tierData && (
                      <div className="mt-4 text-xs text-muted-foreground space-y-1">
                        <p>Avg Score: {tierData.avgScore}</p>
                        <p>Avg Days Active: {tierData.avgDaysActive}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Customer Lists */}
      <Tabs defaultValue="at_risk">
        <TabsList>
          <TabsTrigger value="at_risk" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            At Risk ({atRiskCustomers.length})
          </TabsTrigger>
          <TabsTrigger value="declining" className="gap-2">
            <TrendingDown className="h-4 w-4" />
            Declining ({decliningCustomers.length})
          </TabsTrigger>
          <TabsTrigger value="champions" className="gap-2">
            <Trophy className="h-4 w-4" />
            Champions ({champions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="at_risk">
          <Card>
            <CardHeader>
              <CardTitle>At-Risk Customers</CardTitle>
              <CardDescription>Customers with low engagement who may churn</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerTable customers={atRiskCustomers} isLoading={isLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="declining">
          <Card>
            <CardHeader>
              <CardTitle>Declining Engagement</CardTitle>
              <CardDescription>Customers with decreasing activity</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerTable customers={decliningCustomers} isLoading={isLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="champions">
          <Card>
            <CardHeader>
              <CardTitle>Champions</CardTitle>
              <CardDescription>Your most engaged power users</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerTable customers={champions} isLoading={isLoading} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Customer table component
 */
function CustomerTable({
  customers,
  isLoading,
}: {
  customers: HealthScore[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No customers found
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User ID</TableHead>
            <TableHead>Health Score</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Engagement</TableHead>
            <TableHead>Days Active</TableHead>
            <TableHead>Features Used</TableHead>
            <TableHead>Trend</TableHead>
            <TableHead>Last Activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => {
            const tierInfo = TIER_INFO[customer.healthTier];
            return (
              <TableRow key={customer.userId}>
                <TableCell className="font-mono text-sm">
                  {customer.userId.slice(0, 8)}...
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{customer.healthScore}</span>
                    <Progress value={customer.healthScore} className="w-16 h-2" />
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={cn(tierInfo.bgColor, tierInfo.color)}>
                    {TIER_ICONS[customer.healthTier]}
                    <span className="ml-1">{tierInfo.label}</span>
                  </Badge>
                </TableCell>
                <TableCell>{customer.engagementScore}</TableCell>
                <TableCell>{customer.daysActiveLast30}/30</TableCell>
                <TableCell>{customer.featuresUsedCount}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <TrendIcon trend={customer.scoreTrend} />
                    <span className="text-sm">
                      {customer.scoreChange30d > 0 ? '+' : ''}
                      {customer.scoreChange30d}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {customer.lastActivityAt
                    ? new Date(customer.lastActivityAt).toLocaleDateString()
                    : 'Never'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
