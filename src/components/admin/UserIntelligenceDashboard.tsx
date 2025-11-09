import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  User,
  Mail,
  CreditCard,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Calendar,
  Flag,
  MessageSquare,
  Send,
  Gift,
  StickyNote,
  Play,
  ExternalLink,
  RefreshCw,
  Loader2,
  AlertCircle,
  Brain,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase-platform";
import { formatDistanceToNow, format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserIntelligence {
  id: string;
  email: string;
  name: string;
  created_at: string;
  health_score: number;
  health_status: 'healthy' | 'at_risk' | 'critical';
  subscription_status: string;
  subscription_id: string;
  stripe_customer_id: string;
  next_billing_date: string;
  cancel_at_period_end: boolean;
  mrr: number;
  estimated_ltv: number;
  account_age_days: number;
  logins_30d: number;
  logins_7d: number;
  last_login: string;
  last_activity: string;
  meal_plans_30d: number;
  recipes_30d: number;
  foods_30d: number;
  food_attempts_30d: number;
  achievements_30d: number;
  errors_7d: number;
  features_adopted: number;
  user_tier: 'power_user' | 'active' | 'casual' | 'inactive';
  total_tickets: number;
  open_tickets: number;
  closed_tickets: number;
  last_ticket_date: string;
  avg_resolution_hours: number;
  kids_count: number;
  at_risk_inactive: boolean;
  at_risk_errors: boolean;
  at_risk_payment: boolean;
  kids?: Array<{ id: string; name: string; age: number }>;
  featureFlags?: Array<{ feature_flag_id: string; enabled: boolean; feature_flags: { name: string; description: string } }>;
  recentErrors?: Array<any>;
  openTickets?: Array<any>;
}

interface ActivityTimelineItem {
  activity_date: string;
  activity_type: string;
  activity_description: string;
  severity: 'info' | 'warning' | 'error';
  metadata: any;
}

const QuickFilterButtons = ({ onFilterClick, activeFilter }: { onFilterClick: (filter: string | null) => void, activeFilter: string | null }) => {
  const filters = [
    { id: 'at_risk', label: 'At-Risk Users', icon: AlertTriangle },
    { id: 'payment_failed', label: 'Payment Failed', icon: CreditCard },
    { id: 'has_tickets', label: 'Open Tickets', icon: MessageSquare },
    { id: 'churned', label: 'Churned (30d)', icon: TrendingDown },
    { id: 'vip', label: 'VIP Users', icon: Flag },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {filters.map((filter) => (
        <Button
          key={filter.id}
          variant={activeFilter === filter.id ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterClick(activeFilter === filter.id ? null : filter.id)}
        >
          <filter.icon className="h-4 w-4 mr-2" />
          {filter.label}
        </Button>
      ))}
      {activeFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFilterClick(null)}
        >
          Clear Filter
        </Button>
      )}
    </div>
  );
};

const HealthScoreCard = ({ user }: { user: UserIntelligence }) => {
  const getHealthColor = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  const getHealthIcon = (score: number) => {
    if (score >= 70) return <CheckCircle className="h-5 w-5 text-green-600" />;
    if (score >= 40) return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      power_user: "bg-purple-100 text-purple-800",
      active: "bg-blue-100 text-blue-800",
      casual: "bg-gray-100 text-gray-800",
      inactive: "bg-red-100 text-red-800",
    };
    return <Badge className={colors[tier] || ""}>{tier.replace('_', ' ').toUpperCase()}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle>{user.name || user.email}</CardTitle>
          </div>
          {getTierBadge(user.user_tier)}
        </div>
        <CardDescription>{user.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getHealthIcon(user.health_score)}
            <span className="font-semibold">Health Score:</span>
            <span className={`text-2xl font-bold ${getHealthColor(user.health_score)}`}>
              {user.health_score}/100
            </span>
            <Badge variant={user.health_status === 'healthy' ? 'default' : user.health_status === 'at_risk' ? 'secondary' : 'destructive'}>
              {user.health_status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </div>

        {(user.at_risk_inactive || user.at_risk_errors || user.at_risk_payment) && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">Risk Indicators:</p>
            {user.at_risk_inactive && (
              <div className="flex items-center gap-2 text-sm text-yellow-600">
                <AlertTriangle className="h-4 w-4" />
                Low engagement (hasn't logged in recently)
              </div>
            )}
            {user.at_risk_errors && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                Experiencing errors ({user.errors_7d} in last 7 days)
              </div>
            )}
            {user.at_risk_payment && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <CreditCard className="h-4 w-4" />
                Payment issue detected
              </div>
            )}
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Subscription</p>
            <p className="font-semibold capitalize">{user.subscription_status || 'None'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">MRR</p>
            <p className="font-semibold">${user.mrr || 0}/mo</p>
          </div>
          <div>
            <p className="text-muted-foreground">Account Age</p>
            <p className="font-semibold">{user.account_age_days} days</p>
          </div>
          <div>
            <p className="text-muted-foreground">LTV</p>
            <p className="font-semibold">${user.estimated_ltv || 0}</p>
          </div>
          {user.next_billing_date && (
            <div>
              <p className="text-muted-foreground">Next Billing</p>
              <p className="font-semibold">{formatDistanceToNow(new Date(user.next_billing_date), { addSuffix: true })}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Feature Adoption</p>
            <p className="font-semibold">{user.features_adopted}/10</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const AIInsightsCard = ({ user }: { user: UserIntelligence }) => {
  const [insights, setInsights] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  useEffect(() => {
    generateInsights();
  }, [user]);

  const generateInsights = () => {
    const newInsights: string[] = [];
    const newRecommendations: string[] = [];

    // Engagement insights
    if (user.logins_7d === 0 && user.logins_30d > 0) {
      newInsights.push(`User hasn't logged in for ${Math.floor((Date.now() - new Date(user.last_login).getTime()) / (1000 * 60 * 60 * 24))} days (unusual for this user)`);
      newRecommendations.push('Send "We miss you" re-engagement email');
    }

    if (user.meal_plans_30d === 0 && user.account_age_days > 7) {
      newInsights.push('No meal plans created in 30 days');
      newRecommendations.push('Send tutorial on creating meal plans or offer templates');
    }

    if (user.features_adopted < 3) {
      newInsights.push(`Low feature adoption (${user.features_adopted}/10 features used)`);
      newRecommendations.push('Provide onboarding assistance for unused features');
    }

    // Error insights
    if (user.errors_7d > 3) {
      newInsights.push(`${user.errors_7d} API errors in last 7 days affecting user experience`);
      newRecommendations.push('Investigate error pattern and reach out proactively');
    }

    // Subscription insights
    if (user.cancel_at_period_end) {
      newInsights.push('Subscription set to cancel at period end');
      newRecommendations.push('Conduct exit survey and offer retention discount');
    }

    if (user.subscription_status === 'past_due') {
      newInsights.push('Payment failure - account past due');
      newRecommendations.push('Send payment update reminder with dunning sequence');
    }

    // Positive insights
    if (user.user_tier === 'power_user') {
      newInsights.push('Power user - highly engaged with platform');
      newRecommendations.push('Consider for beta features or testimonial request');
    }

    if (user.logins_30d > 20) {
      newInsights.push('Very active user - logging in frequently');
      newRecommendations.push('Upsell opportunity for annual plan');
    }

    setInsights(newInsights);
    setRecommendations(newRecommendations);
  };

  if (insights.length === 0 && recommendations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Assistant
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No significant insights detected. User appears to be in good standing.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          AI Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {insights.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">Automatic Insights:</p>
            <div className="space-y-2">
              {insights.map((insight, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-yellow-600" />
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recommendations.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">Recommended Actions:</p>
            <div className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
                  <span>{recommendation}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ActivityTimeline = ({ userId }: { userId: string }) => {
  const [timeline, setTimeline] = useState<ActivityTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    loadTimeline();
  }, [userId, limit]);

  const loadTimeline = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('user-intelligence', {
        body: {
          action: 'get_timeline',
          userId,
          limit,
          offset: 0,
        },
      });

      if (error) throw error;
      setTimeline(data.timeline || []);
    } catch (error) {
      console.error('Error loading timeline:', error);
      toast.error('Failed to load activity timeline');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Activity Timeline
        </CardTitle>
        <CardDescription>Last {limit} activities</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-4">
            {timeline.map((item, index) => (
              <div key={index} className="flex gap-3 pb-4 border-b last:border-b-0">
                <div className="flex-shrink-0 mt-1">
                  {getSeverityIcon(item.severity)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.activity_description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.activity_date), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {item.activity_type}
                    </Badge>
                  </div>
                  {item.metadata && Object.keys(item.metadata).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:underline">
                        View details
                      </summary>
                      <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(item.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        {timeline.length >= limit && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-4"
            onClick={() => setLimit(limit + 50)}
          >
            Load More
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

const QuickActions = ({ userId, onActionComplete }: { userId: string; onActionComplete: () => void }) => {
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showCompSubDialog, setShowCompSubDialog] = useState(false);
  const [note, setNote] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [compSubDays, setCompSubDays] = useState('30');
  const [compSubReason, setCompSubReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddNote = async () => {
    if (!note.trim()) {
      toast.error('Please enter a note');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('user-intelligence', {
        body: {
          action: 'quick_action',
          userId,
          quickAction: {
            type: 'add_note',
            data: { note },
          },
        },
      });

      if (error) throw error;
      toast.success('Note added successfully');
      setNote('');
      setShowNoteDialog(false);
      onActionComplete();
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      toast.error('Please enter both subject and body');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('user-intelligence', {
        body: {
          action: 'quick_action',
          userId,
          quickAction: {
            type: 'send_email',
            data: {
              subject: emailSubject,
              body: emailBody,
              priority: 'normal',
            },
          },
        },
      });

      if (error) throw error;
      toast.success('Email queued for sending');
      setEmailSubject('');
      setEmailBody('');
      setShowEmailDialog(false);
      onActionComplete();
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Failed to queue email');
    } finally {
      setLoading(false);
    }
  };

  const handleGrantCompSub = async () => {
    if (!compSubReason.trim()) {
      toast.error('Please enter a reason');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('user-intelligence', {
        body: {
          action: 'quick_action',
          userId,
          quickAction: {
            type: 'grant_comp_sub',
            data: {
              durationDays: parseInt(compSubDays),
              reason: compSubReason,
            },
          },
        },
      });

      if (error) throw error;
      toast.success('Complementary subscription granted');
      setCompSubReason('');
      setShowCompSubDialog(false);
      onActionComplete();
    } catch (error) {
      console.error('Error granting comp sub:', error);
      toast.error('Failed to grant complementary subscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <Send className="h-4 w-4 mr-2" />
              Send Email
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Email to User</DialogTitle>
              <DialogDescription>
                Compose an email that will be queued for sending to this user.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email-subject">Subject</Label>
                <Input
                  id="email-subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject"
                />
              </div>
              <div>
                <Label htmlFor="email-body">Message</Label>
                <Textarea
                  id="email-body"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Email message"
                  rows={8}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSendEmail} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send Email
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showCompSubDialog} onOpenChange={setShowCompSubDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <Gift className="h-4 w-4 mr-2" />
              Grant Comp Subscription
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant Complementary Subscription</DialogTitle>
              <DialogDescription>
                Grant a free subscription to this user for a specified duration.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="comp-days">Duration (days)</Label>
                <Select value={compSubDays} onValueChange={setCompSubDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="comp-reason">Reason</Label>
                <Textarea
                  id="comp-reason"
                  value={compSubReason}
                  onChange={(e) => setCompSubReason(e.target.value)}
                  placeholder="Reason for granting complementary subscription"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCompSubDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleGrantCompSub} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Grant Subscription
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full justify-start">
              <StickyNote className="h-4 w-4 mr-2" />
              Add Note
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Admin Note</DialogTitle>
              <DialogDescription>
                Add a note to this user's activity timeline.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="note">Note</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Enter your note here"
                  rows={6}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNoteDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddNote} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Add Note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button variant="outline" className="w-full justify-start" asChild>
          <a href={`/admin-dashboard?tab=tickets`} target="_blank">
            <MessageSquare className="h-4 w-4 mr-2" />
            Create Ticket
          </a>
        </Button>
      </CardContent>
    </Card>
  );
};

const ContextSidebar = ({ user }: { user: UserIntelligence }) => {
  return (
    <div className="space-y-4">
      {/* Subscription Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Subscription
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="font-semibold capitalize">{user.subscription_status || 'None'}</p>
          </div>
          {user.mrr > 0 && (
            <>
              <div>
                <p className="text-muted-foreground">MRR</p>
                <p className="font-semibold">${user.mrr}</p>
              </div>
              {user.next_billing_date && (
                <div>
                  <p className="text-muted-foreground">Next charge</p>
                  <p className="font-semibold">
                    {format(new Date(user.next_billing_date), 'MMM d')}
                  </p>
                </div>
              )}
              {user.stripe_customer_id && (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a
                    href={`https://dashboard.stripe.com/customers/${user.stripe_customer_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Manage in Stripe
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Support Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Support
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <p className="text-muted-foreground">Open tickets</p>
            <p className="font-semibold">{user.open_tickets || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total tickets</p>
            <p className="font-semibold">{user.total_tickets || 0}</p>
          </div>
          {user.avg_resolution_hours && (
            <div>
              <p className="text-muted-foreground">Avg resolution</p>
              <p className="font-semibold">{user.avg_resolution_hours.toFixed(1)}h</p>
            </div>
          )}
          {user.last_ticket_date && (
            <div>
              <p className="text-muted-foreground">Last ticket</p>
              <p className="font-semibold">
                {formatDistanceToNow(new Date(user.last_ticket_date), { addSuffix: true })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kids & Usage */}
      {user.kids && user.kids.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              Kids
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {user.kids.map((kid) => (
              <div key={kid.id}>
                • {kid.name} ({kid.age}yo)
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Usage Stats (30d)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Meal plans</span>
            <span className="font-semibold">{user.meal_plans_30d}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recipes</span>
            <span className="font-semibold">{user.recipes_30d}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Food attempts</span>
            <span className="font-semibold">{user.food_attempts_30d}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">App opens</span>
            <span className="font-semibold">{user.logins_30d}</span>
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      {user.featureFlags && user.featureFlags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Flag className="h-4 w-4" />
              Feature Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {user.featureFlags.map((flag) => (
              <div key={flag.feature_flag_id} className="flex items-center gap-2">
                {flag.enabled ? (
                  <CheckCircle className="h-3 w-3 text-green-600" />
                ) : (
                  <XCircle className="h-3 w-3 text-gray-400" />
                )}
                <span>{flag.feature_flags?.name || 'Unknown'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export function UserIntelligenceDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserIntelligence | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const handleSearch = async (term: string = searchTerm, filter: string | null = activeFilter) => {
    if (!term && !filter) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('user-intelligence', {
        body: {
          action: 'search',
          searchTerm: term,
          filter,
          limit: 20,
        },
      });

      if (error) throw error;
      setSearchResults(data.users || []);
    } catch (error) {
      console.error('Error searching users:', error);
      toast.error('Failed to search users');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterClick = (filter: string | null) => {
    setActiveFilter(filter);
    handleSearch(searchTerm, filter);
  };

  const loadUserDetails = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('user-intelligence', {
        body: {
          action: 'get_user',
          userId,
        },
      });

      if (error) throw error;
      setSelectedUser(data);
    } catch (error) {
      console.error('Error loading user details:', error);
      toast.error('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const handleActionComplete = () => {
    if (selectedUser) {
      loadUserDetails(selectedUser.id);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">User Intelligence Dashboard</h2>
        <p className="text-muted-foreground">
          Unified view of user data, health metrics, and quick actions
        </p>
      </div>

      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search User
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search by email, name, or user ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={() => handleSearch()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          <QuickFilterButtons onFilterClick={handleFilterClick} activeFilter={activeFilter} />

          {searchResults.length > 0 && (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {searchResults.map((result) => (
                  <Card
                    key={result.user_id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => loadUserDetails(result.user_id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{result.email}</p>
                          <p className="text-sm text-muted-foreground">{result.name || 'No name'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={result.health_status === 'healthy' ? 'default' : 'destructive'}>
                            Score: {result.health_score}
                          </Badge>
                          <Badge variant="outline">{result.user_tier}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* User Details */}
      {selectedUser && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <HealthScoreCard user={selectedUser} />
            <AIInsightsCard user={selectedUser} />
            <ActivityTimeline userId={selectedUser.id} />
          </div>
          <div className="space-y-6">
            <QuickActions userId={selectedUser.id} onActionComplete={handleActionComplete} />
            <ContextSidebar user={selectedUser} />
          </div>
        </div>
      )}

      {!selectedUser && searchResults.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Search for a user or use quick filters to get started
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
