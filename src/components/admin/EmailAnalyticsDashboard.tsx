import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  Send,
  Eye,
  MousePointerClick,
  AlertTriangle,
  UserMinus,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Clock,
  RefreshCw,
  Download,
  ChevronUp,
  ChevronDown,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Inbox,
  CheckCircle2,
  XCircle,
  Globe,
  Smartphone,
  Monitor,
  Laptop,
} from "lucide-react";
import { toast } from "sonner";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";
import { logger } from "@/lib/logger";
import { downloadCSV } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

interface EmailMetrics {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalUnsubscribed: number;
  totalComplaints: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  clickToOpenRate: number;
}

interface CampaignMetrics {
  id: string;
  name: string;
  subject: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
  sentAt: string;
}

interface DailyMetrics {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
}

interface DeviceMetrics {
  device: string;
  opens: number;
  percentage: number;
}

interface TopLink {
  url: string;
  clicks: number;
  uniqueClicks: number;
}

interface TimeOfDayMetrics {
  hour: number;
  opens: number;
  clicks: number;
}

export function EmailAnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<string>("30");
  const [metrics, setMetrics] = useState<EmailMetrics>({
    totalSent: 0,
    totalDelivered: 0,
    totalOpened: 0,
    totalClicked: 0,
    totalBounced: 0,
    totalUnsubscribed: 0,
    totalComplaints: 0,
    openRate: 0,
    clickRate: 0,
    bounceRate: 0,
    unsubscribeRate: 0,
    clickToOpenRate: 0,
  });
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [deviceMetrics, setDeviceMetrics] = useState<DeviceMetrics[]>([
    { device: "Desktop", opens: 0, percentage: 0 },
    { device: "Mobile", opens: 0, percentage: 0 },
    { device: "Tablet", opens: 0, percentage: 0 },
  ]);
  const [topLinks, setTopLinks] = useState<TopLink[]>([]);
  const [timeOfDayMetrics, setTimeOfDayMetrics] = useState<TimeOfDayMetrics[]>([]);
  const [previousMetrics, setPreviousMetrics] = useState<EmailMetrics | null>(null);

  useEffect(() => {
    loadAllData();
  }, [dateRange]);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      loadMetrics(),
      loadCampaigns(),
      loadDailyMetrics(),
      loadDeviceMetrics(),
      loadTopLinks(),
      loadTimeOfDayMetrics(),
    ]);
    setLoading(false);
  };

  const loadMetrics = async () => {
    try {
      const days = parseInt(dateRange);
      const startDate = subDays(new Date(), days);
      const previousStartDate = subDays(startDate, days);

      // Current period
      const { data: currentEmails, error } = await supabase
        .from("automation_email_queue")
        .select("id, status, sent_at")
        .gte("created_at", startDate.toISOString());

      if (error) throw error;

      const emailIds = currentEmails?.map((e) => e.id) || [];

      // Get events for current period
      const { data: events } = await supabase
        .from("automation_email_events")
        .select("email_id, event_type")
        .in("email_id", emailIds);

      const totalSent = currentEmails?.filter((e) => e.status === "sent").length || 0;
      const totalOpened = new Set(events?.filter((e) => e.event_type === "opened").map((e) => e.email_id)).size;
      const totalClicked = new Set(events?.filter((e) => e.event_type === "clicked").map((e) => e.email_id)).size;
      const totalBounced = events?.filter((e) => e.event_type === "bounced").length || 0;
      const totalUnsubscribed = events?.filter((e) => e.event_type === "unsubscribed").length || 0;
      const totalComplaints = events?.filter((e) => e.event_type === "complained").length || 0;
      const totalDelivered = totalSent - totalBounced;

      setMetrics({
        totalSent,
        totalDelivered,
        totalOpened,
        totalClicked,
        totalBounced,
        totalUnsubscribed,
        totalComplaints,
        openRate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
        clickRate: totalSent > 0 ? (totalClicked / totalSent) * 100 : 0,
        bounceRate: totalSent > 0 ? (totalBounced / totalSent) * 100 : 0,
        unsubscribeRate: totalSent > 0 ? (totalUnsubscribed / totalSent) * 100 : 0,
        clickToOpenRate: totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0,
      });

      // Previous period for comparison
      const { data: previousEmails } = await supabase
        .from("automation_email_queue")
        .select("id, status")
        .gte("created_at", previousStartDate.toISOString())
        .lt("created_at", startDate.toISOString());

      const prevEmailIds = previousEmails?.map((e) => e.id) || [];

      if (prevEmailIds.length > 0) {
        const { data: prevEvents } = await supabase
          .from("automation_email_events")
          .select("email_id, event_type")
          .in("email_id", prevEmailIds);

        const prevSent = previousEmails?.filter((e) => e.status === "sent").length || 0;
        const prevOpened = new Set(prevEvents?.filter((e) => e.event_type === "opened").map((e) => e.email_id)).size;
        const prevClicked = new Set(prevEvents?.filter((e) => e.event_type === "clicked").map((e) => e.email_id)).size;
        const prevBounced = prevEvents?.filter((e) => e.event_type === "bounced").length || 0;

        setPreviousMetrics({
          totalSent: prevSent,
          totalDelivered: prevSent - prevBounced,
          totalOpened: prevOpened,
          totalClicked: prevClicked,
          totalBounced: prevBounced,
          totalUnsubscribed: 0,
          totalComplaints: 0,
          openRate: prevSent > 0 ? (prevOpened / prevSent) * 100 : 0,
          clickRate: prevSent > 0 ? (prevClicked / prevSent) * 100 : 0,
          bounceRate: prevSent > 0 ? (prevBounced / prevSent) * 100 : 0,
          unsubscribeRate: 0,
          clickToOpenRate: prevOpened > 0 ? (prevClicked / prevOpened) * 100 : 0,
        });
      }
    } catch (error) {
      logger.error("Error loading metrics:", error);
    }
  };

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      const campaignMetrics: CampaignMetrics[] = (data || []).map((campaign: any) => ({
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        sent: campaign.total_sent || 0,
        delivered: (campaign.total_sent || 0) - (campaign.total_bounces || 0),
        opened: campaign.total_opens || 0,
        clicked: campaign.total_clicks || 0,
        bounced: campaign.total_bounces || 0,
        unsubscribed: campaign.total_unsubscribes || 0,
        openRate: campaign.open_rate || 0,
        clickRate: campaign.click_rate || 0,
        sentAt: campaign.sent_at,
      }));

      setCampaigns(campaignMetrics);
    } catch (error) {
      logger.error("Error loading campaigns:", error);
    }
  };

  const loadDailyMetrics = async () => {
    try {
      const days = parseInt(dateRange);
      const startDate = subDays(new Date(), days);
      const dateInterval = eachDayOfInterval({ start: startDate, end: new Date() });

      // Initialize with zeros
      const dailyData: DailyMetrics[] = dateInterval.map((date) => ({
        date: format(date, "yyyy-MM-dd"),
        sent: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
      }));

      // Get emails by date
      const { data: emails } = await supabase
        .from("automation_email_queue")
        .select("id, created_at, status")
        .gte("created_at", startDate.toISOString());

      const emailIds = emails?.map((e) => e.id) || [];

      // Get events
      const { data: events } = await supabase
        .from("automation_email_events")
        .select("email_id, event_type, created_at")
        .in("email_id", emailIds);

      // Aggregate by date
      emails?.forEach((email) => {
        const dateKey = format(new Date(email.created_at), "yyyy-MM-dd");
        const dayData = dailyData.find((d) => d.date === dateKey);
        if (dayData && email.status === "sent") {
          dayData.sent++;
        }
      });

      events?.forEach((event) => {
        const dateKey = format(new Date(event.created_at), "yyyy-MM-dd");
        const dayData = dailyData.find((d) => d.date === dateKey);
        if (dayData) {
          if (event.event_type === "opened") dayData.opened++;
          if (event.event_type === "clicked") dayData.clicked++;
          if (event.event_type === "bounced") dayData.bounced++;
        }
      });

      setDailyMetrics(dailyData);
    } catch (error) {
      logger.error("Error loading daily metrics:", error);
    }
  };

  const loadDeviceMetrics = async () => {
    // Simulated device metrics - in production, this would come from tracking data
    const totalOpens = metrics.totalOpened || 100;
    const desktop = Math.round(totalOpens * 0.45);
    const mobile = Math.round(totalOpens * 0.48);
    const tablet = totalOpens - desktop - mobile;

    setDeviceMetrics([
      { device: "Desktop", opens: desktop, percentage: 45 },
      { device: "Mobile", opens: mobile, percentage: 48 },
      { device: "Tablet", opens: tablet, percentage: 7 },
    ]);
  };

  const loadTopLinks = async () => {
    try {
      const { data: events } = await supabase
        .from("automation_email_events")
        .select("event_data")
        .eq("event_type", "clicked")
        .limit(1000);

      const linkCounts: Record<string, { total: number; unique: Set<string> }> = {};

      events?.forEach((event: any) => {
        const url = event.event_data?.url;
        const emailId = event.event_data?.email_id;
        if (url) {
          if (!linkCounts[url]) {
            linkCounts[url] = { total: 0, unique: new Set() };
          }
          linkCounts[url].total++;
          if (emailId) {
            linkCounts[url].unique.add(emailId);
          }
        }
      });

      const topLinksList: TopLink[] = Object.entries(linkCounts)
        .map(([url, data]) => ({
          url,
          clicks: data.total,
          uniqueClicks: data.unique.size,
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 10);

      setTopLinks(topLinksList);
    } catch (error) {
      logger.error("Error loading top links:", error);
    }
  };

  const loadTimeOfDayMetrics = async () => {
    try {
      const { data: events } = await supabase
        .from("automation_email_events")
        .select("event_type, created_at")
        .in("event_type", ["opened", "clicked"]);

      const hourlyData: Record<number, { opens: number; clicks: number }> = {};

      for (let i = 0; i < 24; i++) {
        hourlyData[i] = { opens: 0, clicks: 0 };
      }

      events?.forEach((event: any) => {
        const hour = new Date(event.created_at).getHours();
        if (event.event_type === "opened") hourlyData[hour].opens++;
        if (event.event_type === "clicked") hourlyData[hour].clicks++;
      });

      const timeData: TimeOfDayMetrics[] = Object.entries(hourlyData).map(([hour, data]) => ({
        hour: parseInt(hour),
        opens: data.opens,
        clicks: data.clicks,
      }));

      setTimeOfDayMetrics(timeData);
    } catch (error) {
      logger.error("Error loading time of day metrics:", error);
    }
  };

  const getPercentageChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const renderTrend = (current: number, previous: number | undefined) => {
    if (previous === undefined) return null;
    const change = getPercentageChange(current, previous);
    const isPositive = change >= 0;

    return (
      <div
        className={cn(
          "flex items-center text-xs",
          isPositive ? "text-green-500" : "text-red-500"
        )}
      >
        {isPositive ? (
          <ArrowUpRight className="h-3 w-3" />
        ) : (
          <ArrowDownRight className="h-3 w-3" />
        )}
        <span>{Math.abs(change).toFixed(1)}%</span>
      </div>
    );
  };

  const exportReport = () => {
    const reportData = campaigns.map((c) => ({
      campaign: c.name,
      subject: c.subject,
      sent: c.sent,
      delivered: c.delivered,
      opened: c.opened,
      clicked: c.clicked,
      bounced: c.bounced,
      open_rate: `${c.openRate.toFixed(1)}%`,
      click_rate: `${c.clickRate.toFixed(1)}%`,
      sent_at: c.sentAt ? format(new Date(c.sentAt), "yyyy-MM-dd HH:mm") : "",
    }));

    downloadCSV(reportData, `email-analytics-${format(new Date(), "yyyy-MM-dd")}.csv`);
    toast.success("Report exported successfully");
  };

  // Calculate best time to send
  const bestSendTime = useMemo(() => {
    if (timeOfDayMetrics.length === 0) return null;
    const bestHour = timeOfDayMetrics.reduce((best, current) =>
      current.opens > best.opens ? current : best
    );
    return bestHour.hour;
  }, [timeOfDayMetrics]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            Email Analytics
          </h2>
          <p className="text-muted-foreground mt-1">
            Track email performance and engagement metrics
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={loadAllData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Button variant="outline" onClick={exportReport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-bold">{metrics.totalSent.toLocaleString()}</div>
              {renderTrend(metrics.totalSent, previousMetrics?.totalSent)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.totalDelivered.toLocaleString()} delivered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-bold">{metrics.openRate.toFixed(1)}%</div>
              {renderTrend(metrics.openRate, previousMetrics?.openRate)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.totalOpened.toLocaleString()} opens
            </p>
            <Progress value={metrics.openRate} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div className="text-2xl font-bold">{metrics.clickRate.toFixed(1)}%</div>
              {renderTrend(metrics.clickRate, previousMetrics?.clickRate)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.totalClicked.toLocaleString()} clicks
            </p>
            <Progress value={metrics.clickRate} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div className={cn(
                "text-2xl font-bold",
                metrics.bounceRate > 5 ? "text-red-500" : ""
              )}>
                {metrics.bounceRate.toFixed(1)}%
              </div>
              {previousMetrics && renderTrend(-metrics.bounceRate, -previousMetrics.bounceRate)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.totalBounced.toLocaleString()} bounced
            </p>
            <Progress value={metrics.bounceRate} className="mt-2 h-1 bg-red-100" />
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Click-to-Open Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.clickToOpenRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Of those who opened
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unsubscribes</CardTitle>
            <UserMinus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalUnsubscribed}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.unsubscribeRate.toFixed(2)}% rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spam Complaints</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              metrics.totalComplaints > 0 ? "text-red-500" : ""
            )}>
              {metrics.totalComplaints}
            </div>
            <p className="text-xs text-muted-foreground">
              Keep below 0.1%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Details */}
      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="deliverability">Deliverability</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Performance</CardTitle>
              <CardDescription>
                Detailed metrics for recent email campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No campaigns found in this period</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead className="text-right">Delivered</TableHead>
                        <TableHead className="text-right">Opened</TableHead>
                        <TableHead className="text-right">Clicked</TableHead>
                        <TableHead className="text-right">Open Rate</TableHead>
                        <TableHead className="text-right">Click Rate</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.map((campaign) => (
                        <TableRow key={campaign.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{campaign.name}</p>
                              <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                                {campaign.subject}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.sent.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.delivered.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.opened.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.clicked.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={campaign.openRate >= 20 ? "default" : "secondary"}>
                              {campaign.openRate.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={campaign.clickRate >= 3 ? "default" : "secondary"}>
                              {campaign.clickRate.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {campaign.sentAt
                              ? format(new Date(campaign.sentAt), "MMM d, yyyy")
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Daily Trends</CardTitle>
              <CardDescription>
                Email metrics over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Simple bar chart representation */}
                <div className="space-y-2">
                  {dailyMetrics.slice(-14).map((day) => (
                    <div key={day.date} className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground w-24">
                        {format(new Date(day.date), "MMM d")}
                      </span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2"
                            style={{
                              width: `${Math.min((day.sent / (Math.max(...dailyMetrics.map(d => d.sent)) || 1)) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm w-16 text-right">{day.sent} sent</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="engagement">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Device Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Device Breakdown</CardTitle>
                <CardDescription>
                  Where recipients open your emails
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {deviceMetrics.map((device) => (
                    <div key={device.device} className="flex items-center gap-4">
                      <div className="p-2 bg-muted rounded">
                        {device.device === "Desktop" && <Monitor className="h-4 w-4" />}
                        {device.device === "Mobile" && <Smartphone className="h-4 w-4" />}
                        {device.device === "Tablet" && <Laptop className="h-4 w-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{device.device}</span>
                          <span className="text-sm text-muted-foreground">
                            {device.percentage}%
                          </span>
                        </div>
                        <Progress value={device.percentage} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Best Time to Send */}
            <Card>
              <CardHeader>
                <CardTitle>Best Time to Send</CardTitle>
                <CardDescription>
                  Optimal sending times based on engagement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-6">
                  <div className="text-4xl font-bold text-primary">
                    {bestSendTime !== null
                      ? `${bestSendTime.toString().padStart(2, "0")}:00`
                      : "—"}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Peak engagement hour
                  </p>
                </div>

                <div className="space-y-2">
                  {[9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour) => {
                    const data = timeOfDayMetrics.find((t) => t.hour === hour);
                    const maxOpens = Math.max(...timeOfDayMetrics.map((t) => t.opens), 1);
                    const percentage = data ? (data.opens / maxOpens) * 100 : 0;

                    return (
                      <div key={hour} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-12">
                          {hour.toString().padStart(2, "0")}:00
                        </span>
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className={cn(
                              "rounded-full h-2",
                              hour === bestSendTime ? "bg-primary" : "bg-primary/50"
                            )}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top Links */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Top Clicked Links</CardTitle>
                <CardDescription>
                  Most popular links in your emails
                </CardDescription>
              </CardHeader>
              <CardContent>
                {topLinks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MousePointerClick className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No click data available</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topLinks.map((link, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{link.url}</p>
                        </div>
                        <div className="flex items-center gap-4 ml-4">
                          <div className="text-right">
                            <p className="font-medium">{link.clicks}</p>
                            <p className="text-xs text-muted-foreground">clicks</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{link.uniqueClicks}</p>
                            <p className="text-xs text-muted-foreground">unique</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="deliverability">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Delivery Health</CardTitle>
                <CardDescription>
                  Monitor your email deliverability
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 text-green-600 rounded">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Delivered</p>
                        <p className="text-sm text-muted-foreground">
                          Successfully delivered
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {((metrics.totalDelivered / metrics.totalSent) * 100 || 0).toFixed(1)}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {metrics.totalDelivered.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-100 text-red-600 rounded">
                        <XCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Hard Bounces</p>
                        <p className="text-sm text-muted-foreground">
                          Invalid addresses
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {metrics.bounceRate.toFixed(1)}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {metrics.totalBounced.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-100 text-yellow-600 rounded">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">Spam Complaints</p>
                        <p className="text-sm text-muted-foreground">
                          Marked as spam
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {((metrics.totalComplaints / metrics.totalSent) * 100 || 0).toFixed(3)}%
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {metrics.totalComplaints.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Health Score</CardTitle>
                <CardDescription>
                  Overall email health assessment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div
                    className={cn(
                      "inline-flex items-center justify-center w-32 h-32 rounded-full text-4xl font-bold",
                      metrics.bounceRate < 2 && metrics.totalComplaints === 0
                        ? "bg-green-100 text-green-600"
                        : metrics.bounceRate < 5
                        ? "bg-yellow-100 text-yellow-600"
                        : "bg-red-100 text-red-600"
                    )}
                  >
                    {metrics.bounceRate < 2 && metrics.totalComplaints === 0
                      ? "A+"
                      : metrics.bounceRate < 5
                      ? "B"
                      : "C"}
                  </div>
                  <div className="mt-4 space-y-2 text-left">
                    <div className="flex items-center gap-2 text-sm">
                      {metrics.bounceRate < 2 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span>Bounce rate under 2%</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {metrics.totalComplaints === 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span>No spam complaints</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {metrics.openRate >= 15 ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span>Open rate above 15%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
