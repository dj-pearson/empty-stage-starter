import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getBudgetAnalyticsSummary } from '@/lib/budgetCalculator/supabaseIntegration';
import { formatCurrency } from '@/lib/budgetCalculator/calculator';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { DollarSign, Users, Download, TrendingUp, Mail, MapPin } from 'lucide-react';

interface AnalyticsSummary {
  totalCalculations: number;
  emailCaptureRate: number;
  averageBudget: number;
  averageFamilySize: number;
  downloadRate: number;
  trialStartRate: number;
  topStates: { state: string; count: number }[];
  recentLeads: Array<{
    id: string;
    email: string;
    name: string | null;
    monthly_budget: number;
    family_size: number;
    created_at: string;
    trial_started: boolean;
  }>;
}

export function BudgetAnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setIsLoading(true);
        const data = await getBudgetAnalyticsSummary();
        setAnalytics(data);
      } catch (err) {
        console.error('Error loading analytics:', err);
        setError('Failed to load analytics');
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500">{error || 'Failed to load analytics'}</p>
      </div>
    );
  }

  const conversionData = [
    { name: 'Total Calculations', value: analytics.totalCalculations, fill: '#3b82f6' },
    {
      name: 'Email Captured',
      value: Math.round((analytics.totalCalculations * analytics.emailCaptureRate) / 100),
      fill: '#10b981',
    },
    {
      name: 'PDF Downloaded',
      value: Math.round((analytics.totalCalculations * analytics.downloadRate) / 100),
      fill: '#f59e0b',
    },
    {
      name: 'Trial Started',
      value: Math.round(
        (analytics.totalCalculations * analytics.emailCaptureRate * analytics.trialStartRate) /
          10000
      ),
      fill: '#8b5cf6',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Budget Calculator Analytics</h2>
        <p className="text-muted-foreground">
          Overview of budget calculator performance and lead generation
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calculations</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalCalculations}</div>
            <p className="text-xs text-muted-foreground">
              Avg: {formatCurrency(analytics.averageBudget)}/month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Email Capture Rate</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.emailCaptureRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((analytics.totalCalculations * analytics.emailCaptureRate) / 100)} leads
              captured
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PDF Download Rate</CardTitle>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.downloadRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((analytics.totalCalculations * analytics.downloadRate) / 100)} downloads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trial Conversion</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.trialStartRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Of email captures start trial</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>User journey from calculation to trial</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={conversionData}>
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={12} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top States</CardTitle>
            <CardDescription>Calculations by state</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.topStates.map((state, index) => (
                <div key={state.state} className="flex items-center">
                  <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        #{index + 1} {state.state}
                      </span>
                      <span className="text-sm text-muted-foreground">{state.count} calcs</span>
                    </div>
                    <div className="mt-1 h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600"
                        style={{
                          width: `${(state.count / analytics.topStates[0].count) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {analytics.topStates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No state data available yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Leads</CardTitle>
          <CardDescription>Latest email captures from budget calculator</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Family Size</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Trial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.recentLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No leads captured yet
                  </TableCell>
                </TableRow>
              ) : (
                analytics.recentLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.name || 'N/A'}</TableCell>
                    <TableCell>{lead.email}</TableCell>
                    <TableCell>{formatCurrency(lead.monthly_budget)}/mo</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Users className="mr-1 h-4 w-4" />
                        {lead.family_size}
                      </div>
                    </TableCell>
                    <TableCell>{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {lead.trial_started ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                          No
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Average User Profile</CardTitle>
          <CardDescription>Typical budget calculator user</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Family Size</p>
              <p className="text-2xl font-bold">{analytics.averageFamilySize.toFixed(1)} people</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Monthly Budget</p>
              <p className="text-2xl font-bold">{formatCurrency(analytics.averageBudget)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Annual Savings</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(analytics.averageBudget * 3.5)}
              </p>
              <p className="text-xs text-muted-foreground">vs. meal kits estimate</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
