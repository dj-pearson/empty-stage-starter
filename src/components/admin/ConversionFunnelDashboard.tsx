import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  CreditCard,
  Mail,
  FileText,
  ArrowRight,
  ArrowDown,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  MousePointer,
  Eye,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase-platform';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface FunnelStep {
  name: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  description: string;
}

interface ConversionMetrics {
  pageViews: number;
  quizStarts: number;
  quizCompletes: number;
  emailCaptures: number;
  signups: number;
  paidConversions: number;
  trialStarts: number;
}

interface RecentConversion {
  id: string;
  email: string;
  source: string;
  convertedAt: string;
  value: number;
}

export function ConversionFunnelDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7d');
  const [metrics, setMetrics] = useState<ConversionMetrics>({
    pageViews: 0,
    quizStarts: 0,
    quizCompletes: 0,
    emailCaptures: 0,
    signups: 0,
    paidConversions: 0,
    trialStarts: 0,
  });
  const [recentConversions, setRecentConversions] = useState<RecentConversion[]>([]);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const startDate = subDays(new Date(), days);

      // Try to fetch from new funnel_events table first (for accurate page views)
      let funnelMetrics: {
        pageViews: number;
        quizStarts: number;
        quizCompletes: number;
        emailCaptures: number;
        signups: number;
        trialStarts: number;
        paidConversions: number;
      } | null = null;

      try {
        const { data: funnelEvents, error: funnelError } = await supabase
          .from('funnel_events')
          .select('event_type')
          .gte('created_at', startDate.toISOString());

        if (!funnelError && funnelEvents && funnelEvents.length > 0) {
          funnelMetrics = {
            pageViews: funnelEvents.filter(e => e.event_type === 'landing_view').length,
            quizStarts: funnelEvents.filter(e => e.event_type === 'quiz_start').length,
            quizCompletes: funnelEvents.filter(e => e.event_type === 'quiz_complete').length,
            emailCaptures: funnelEvents.filter(e => e.event_type === 'email_capture').length,
            signups: funnelEvents.filter(e => e.event_type === 'signup').length,
            trialStarts: funnelEvents.filter(e => e.event_type === 'trial_start').length,
            paidConversions: funnelEvents.filter(e => e.event_type === 'paid_conversion').length,
          };
        }
      } catch {
        // funnel_events table may not exist yet, fall through to legacy data
      }

      // Fetch quiz analytics (legacy data source)
      const { data: quizData, error: quizError } = await supabase
        .from('quiz_analytics')
        .select('event_type, created_at')
        .gte('created_at', startDate.toISOString());

      if (quizError) throw quizError;

      // Fetch quiz responses (completed quizzes)
      const { data: quizResponses, error: responsesError } = await supabase
        .from('quiz_responses')
        .select('id, created_at, email_captured')
        .gte('created_at', startDate.toISOString());

      if (responsesError) throw responsesError;

      // Fetch signups
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, created_at')
        .gte('created_at', startDate.toISOString());

      if (profilesError) throw profilesError;

      // Fetch subscriptions
      const { data: subscriptions, error: subsError } = await supabase
        .from('user_subscriptions')
        .select('id, status, created_at, user_id')
        .gte('created_at', startDate.toISOString());

      if (subsError) throw subsError;

      // Fetch leads from leads table and quiz_leads table
      let emailLeads: any[] = [];
      try {
        // First try the main leads table
        const { data: leadsData, error: leadsError } = await supabase
          .from('leads')
          .select('id, email, source, created_at')
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(10);

        if (!leadsError && leadsData) {
          emailLeads = leadsData.map(lead => ({
            ...lead,
            source: lead.source || 'landing_page',
          }));
        }

        // Also get quiz leads if available
        const { data: quizLeadsData, error: quizError } = await supabase
          .from('quiz_leads')
          .select('id, email, created_at')
          .gte('created_at', startDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(10);

        if (!quizError && quizLeadsData) {
          const quizLeads = quizLeadsData.map(lead => ({
            id: lead.id,
            email: lead.email,
            source: 'quiz',
            created_at: lead.created_at,
          }));
          // Merge and sort by created_at
          emailLeads = [...emailLeads, ...quizLeads]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 10);
        }
      } catch (error) {
        logger.warn('Error fetching leads', error);
      }

      // Calculate metrics from legacy data sources
      const legacyQuizStarts = quizData?.filter(q => q.event_type === 'quiz_started').length || 0;
      const legacyQuizCompletes = quizResponses?.length || 0;
      const legacyEmailCaptures = quizResponses?.filter(r => r.email_captured).length || 0;
      const legacySignups = profiles?.length || 0;
      const legacyPaidConversions = subscriptions?.filter(s => s.status === 'active').length || 0;
      const legacyTrialStarts = subscriptions?.filter(s => s.status === 'trialing').length || 0;

      // Use funnel_events data if available (more accurate), otherwise fall back to legacy + estimates
      const quizStarts = funnelMetrics?.quizStarts || legacyQuizStarts;
      const quizCompletes = funnelMetrics?.quizCompletes || legacyQuizCompletes;
      const emailCaptures = funnelMetrics?.emailCaptures || legacyEmailCaptures;
      const signups = funnelMetrics?.signups || legacySignups;
      const paidConversions = funnelMetrics?.paidConversions || legacyPaidConversions;
      const trialStarts = funnelMetrics?.trialStarts || legacyTrialStarts;

      // Use actual page views if available, otherwise estimate (typically 3-5x quiz starts)
      const pageViews = funnelMetrics?.pageViews || Math.max(quizStarts * 4, legacyQuizStarts * 4);

      setMetrics({
        pageViews,
        quizStarts,
        quizCompletes,
        emailCaptures,
        signups,
        paidConversions,
        trialStarts,
      });

      // Format recent conversions
      const conversions: RecentConversion[] = (emailLeads || []).map(lead => ({
        id: lead.id,
        email: lead.email,
        source: lead.source || 'quiz',
        convertedAt: lead.created_at,
        value: 0,
      }));

      setRecentConversions(conversions);
    } catch (error) {
      console.error('Error fetching conversion metrics:', error);
      toast.error('Failed to load conversion data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [dateRange]);

  const calculateConversionRate = (current: number, previous: number): number => {
    if (previous === 0) return 0;
    return Math.round((current / previous) * 100);
  };

  const funnelSteps: FunnelStep[] = [
    {
      name: 'Landing Page Views',
      count: metrics.pageViews,
      icon: <Eye className="w-5 h-5" />,
      color: 'bg-blue-500',
      description: 'Estimated visitors to landing pages',
    },
    {
      name: 'Quiz Started',
      count: metrics.quizStarts,
      icon: <MousePointer className="w-5 h-5" />,
      color: 'bg-indigo-500',
      description: `${calculateConversionRate(metrics.quizStarts, metrics.pageViews)}% of visitors`,
    },
    {
      name: 'Quiz Completed',
      count: metrics.quizCompletes,
      icon: <CheckCircle className="w-5 h-5" />,
      color: 'bg-purple-500',
      description: `${calculateConversionRate(metrics.quizCompletes, metrics.quizStarts)}% completion rate`,
    },
    {
      name: 'Email Captured',
      count: metrics.emailCaptures,
      icon: <Mail className="w-5 h-5" />,
      color: 'bg-pink-500',
      description: `${calculateConversionRate(metrics.emailCaptures, metrics.quizCompletes)}% email capture`,
    },
    {
      name: 'Account Signups',
      count: metrics.signups,
      icon: <UserPlus className="w-5 h-5" />,
      color: 'bg-orange-500',
      description: `${calculateConversionRate(metrics.signups, metrics.emailCaptures)}% signup rate`,
    },
    {
      name: 'Paid Conversions',
      count: metrics.paidConversions,
      icon: <CreditCard className="w-5 h-5" />,
      color: 'bg-green-500',
      description: `${calculateConversionRate(metrics.paidConversions, metrics.signups)}% paid conversion`,
    },
  ];

  const overallConversion = calculateConversionRate(metrics.paidConversions, metrics.pageViews);
  const emailToPayingRate = calculateConversionRate(metrics.paidConversions, metrics.emailCaptures);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Conversion Funnel</h2>
          <p className="text-muted-foreground">
            Track visitor journey from landing to paid conversion
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchMetrics} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall Conversion</p>
                <p className="text-3xl font-bold">{overallConversion}%</p>
              </div>
              <div className={`p-3 rounded-full ${overallConversion > 2 ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                {overallConversion > 2 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Visitors → Paid</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Email → Paid</p>
                <p className="text-3xl font-bold">{emailToPayingRate}%</p>
              </div>
              <div className={`p-3 rounded-full ${emailToPayingRate > 10 ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                <Target className="w-6 h-6" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">After email capture</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Trials</p>
                <p className="text-3xl font-bold">{metrics.trialStarts}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                <Users className="w-6 h-6" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">In trial period</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Email Leads</p>
                <p className="text-3xl font-bold">{metrics.emailCaptures}</p>
              </div>
              <div className="p-3 rounded-full bg-pink-100 text-pink-600">
                <Mail className="w-6 h-6" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">From quiz</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Conversion Funnel Visualization</CardTitle>
          <CardDescription>
            See where visitors drop off in the conversion journey
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {funnelSteps.map((step, index) => {
                const maxCount = Math.max(...funnelSteps.map(s => s.count));
                const widthPercent = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
                const dropOff = index > 0
                  ? funnelSteps[index - 1].count - step.count
                  : 0;
                const dropOffPercent = index > 0 && funnelSteps[index - 1].count > 0
                  ? Math.round((dropOff / funnelSteps[index - 1].count) * 100)
                  : 0;

                return (
                  <div key={step.name}>
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${step.color} text-white shrink-0`}>
                        {step.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium truncate">{step.name}</span>
                          <span className="text-lg font-bold">{step.count.toLocaleString()}</span>
                        </div>
                        <div className="relative">
                          <Progress value={widthPercent} className="h-8" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-medium text-white drop-shadow">
                              {step.description}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Drop-off indicator */}
                    {index < funnelSteps.length - 1 && dropOff > 0 && (
                      <div className="flex items-center gap-2 ml-12 my-2 text-sm text-muted-foreground">
                        <ArrowDown className="w-4 h-4 text-red-500" />
                        <span className="text-red-500 font-medium">
                          -{dropOff.toLocaleString()} ({dropOffPercent}% drop-off)
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Drop-off Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              Biggest Drop-offs
            </CardTitle>
            <CardDescription>
              Where you're losing the most potential customers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {funnelSteps.slice(1).map((step, index) => {
                const prevStep = funnelSteps[index];
                const dropOff = prevStep.count - step.count;
                const dropOffPercent = prevStep.count > 0
                  ? Math.round((dropOff / prevStep.count) * 100)
                  : 0;

                return (
                  <div key={step.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{prevStep.name}</span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{step.name}</span>
                    </div>
                    <Badge variant={dropOffPercent > 50 ? 'destructive' : dropOffPercent > 30 ? 'secondary' : 'default'}>
                      -{dropOffPercent}%
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent Conversions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Recent Email Captures
            </CardTitle>
            <CardDescription>
              Latest leads from quiz and other sources
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentConversions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No recent email captures</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentConversions.slice(0, 5).map((conversion) => (
                  <div key={conversion.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{conversion.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(conversion.convertedAt), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <Badge variant="outline">{conversion.source}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Optimization Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle>Optimization Opportunities</CardTitle>
          <CardDescription>
            Actionable suggestions based on your funnel data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calculateConversionRate(metrics.quizStarts, metrics.pageViews) < 25 && (
              <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4" />
                  Low Quiz Entry Rate
                </h4>
                <p className="text-sm text-muted-foreground">
                  Only {calculateConversionRate(metrics.quizStarts, metrics.pageViews)}% of visitors start the quiz.
                  Consider adding more prominent CTAs and reducing friction.
                </p>
              </div>
            )}

            {calculateConversionRate(metrics.quizCompletes, metrics.quizStarts) < 60 && (
              <div className="p-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800">
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4" />
                  Quiz Abandonment
                </h4>
                <p className="text-sm text-muted-foreground">
                  {100 - calculateConversionRate(metrics.quizCompletes, metrics.quizStarts)}% abandon the quiz.
                  Shorten the quiz or add a progress indicator.
                </p>
              </div>
            )}

            {calculateConversionRate(metrics.emailCaptures, metrics.quizCompletes) < 40 && (
              <div className="p-4 rounded-lg border border-pink-200 bg-pink-50 dark:bg-pink-900/20 dark:border-pink-800">
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <Mail className="w-4 h-4" />
                  Email Capture Gap
                </h4>
                <p className="text-sm text-muted-foreground">
                  Only {calculateConversionRate(metrics.emailCaptures, metrics.quizCompletes)}% give email.
                  Gate results behind email capture for better lead gen.
                </p>
              </div>
            )}

            {calculateConversionRate(metrics.signups, metrics.emailCaptures) < 20 && (
              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <UserPlus className="w-4 h-4" />
                  Email to Signup Gap
                </h4>
                <p className="text-sm text-muted-foreground">
                  {100 - calculateConversionRate(metrics.signups, metrics.emailCaptures)}% of leads don't sign up.
                  Improve email nurture sequence.
                </p>
              </div>
            )}

            {calculateConversionRate(metrics.paidConversions, metrics.signups) < 10 && (
              <div className="p-4 rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4" />
                  Trial to Paid Conversion
                </h4>
                <p className="text-sm text-muted-foreground">
                  Only {calculateConversionRate(metrics.paidConversions, metrics.signups)}% become paid.
                  Review onboarding and trial experience.
                </p>
              </div>
            )}

            <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
              <h4 className="font-semibold flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Quick Wins
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Add exit-intent popup</li>
                <li>• A/B test quiz length</li>
                <li>• Optimize mobile experience</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
