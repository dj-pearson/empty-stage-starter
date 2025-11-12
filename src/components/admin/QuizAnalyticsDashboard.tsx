/**
 * Quiz Analytics Dashboard for Admin
 * Shows key metrics and performance data for the picky eater quiz
 */
// @ts-nocheck - Database tables require migrations to be approved

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getQuizAnalyticsSummary, getRecentLeads } from '@/lib/quiz/supabaseIntegration';
import { getPersonalityName } from '@/lib/quiz/personalityTypes';
import { PersonalityType } from '@/types/quiz';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Users, Mail, FileDown, Share2, TrendingUp, Clock, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface AnalyticsSummary {
  totalResponses: number;
  completedResponses: number;
  emailCaptureRate: number;
  pdfDownloadRate: number;
  socialShareRate: number;
  avgCompletionTime: number;
  personalityDistribution: Record<string, number>;
}

interface QuizLead {
  id: string;
  email: string;
  child_name: string;
  parent_name: string;
  personality_type: PersonalityType;
  created_at: string;
  email_sequence_started: boolean;
  trial_started: boolean;
}

export function QuizAnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [leads, setLeads] = useState<QuizLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      // @ts-ignore - quiz_responses table exists but types not yet regenerated
      setRefreshing(true);
      const [summary, recentLeads] = await Promise.all([
        getQuizAnalyticsSummary(),
        getRecentLeads(20)
      ]);

      setAnalytics(summary);
      setLeads(recentLeads);
    } catch (error) {
      console.error('Error loading quiz analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading quiz analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-gray-500">No quiz data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const personalityData = Object.entries(analytics.personalityDistribution).map(([type, count]) => ({
    name: getPersonalityName(type as PersonalityType),
    value: count,
    percentage: ((count / analytics.totalResponses) * 100).toFixed(1)
  }));

  const COLORS = ['#8B5CF6', '#D4A574', '#10B981', '#F59E0B', '#EC4899', '#3B82F6'];

  const conversionData = [
    { name: 'Quiz Completed', value: analytics.completedResponses },
    { name: 'Email Captured', value: Math.round(analytics.totalResponses * analytics.emailCaptureRate) },
    { name: 'PDF Downloaded', value: Math.round(analytics.totalResponses * analytics.pdfDownloadRate) },
    { name: 'Social Shared', value: Math.round(analytics.totalResponses * analytics.socialShareRate) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Quiz Analytics</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Performance metrics for the Picky Eater Quiz
          </p>
        </div>
        <Button
          onClick={loadData}
          variant="outline"
          className="gap-2"
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Responses</CardTitle>
            <Users className="w-4 h-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalResponses}</div>
            <p className="text-xs text-gray-500">
              {analytics.completedResponses} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Email Capture Rate</CardTitle>
            <Mail className="w-4 h-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(analytics.emailCaptureRate * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-gray-500">
              {Math.round(analytics.totalResponses * analytics.emailCaptureRate)} leads captured
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PDF Download Rate</CardTitle>
            <FileDown className="w-4 h-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(analytics.pdfDownloadRate * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-gray-500">
              {Math.round(analytics.totalResponses * analytics.pdfDownloadRate)} downloads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Completion Time</CardTitle>
            <Clock className="w-4 h-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(analytics.avgCompletionTime / 60)}m
            </div>
            <p className="text-xs text-gray-500">
              {Math.round(analytics.avgCompletionTime)} seconds
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="distribution" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="distribution">Personality Distribution</TabsTrigger>
          <TabsTrigger value="funnel">Conversion Funnel</TabsTrigger>
        </TabsList>

        <TabsContent value="distribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personality Type Distribution</CardTitle>
              <CardDescription>
                How quiz takers are distributed across personality types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={personalityData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.percentage}%`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {personalityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="funnel" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>
                Drop-off rates through the quiz journey
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={conversionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8B5CF6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent Leads */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Leads</CardTitle>
          <CardDescription>
            Latest email captures from the quiz (last 20)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No leads yet</p>
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{lead.parent_name}</span>
                      {lead.trial_started && (
                        <Badge variant="default">Trial Started</Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {lead.email} • Child: {lead.child_name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">
                        {getPersonalityName(lead.personality_type)}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
