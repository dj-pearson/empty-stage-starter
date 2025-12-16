// @ts-nocheck
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  BarChart3,
  TrendingUp,
  Users,
  MousePointerClick,
  Eye,
  Globe,
  Smartphone,
  FileText,
  AlertCircle,
  RefreshCw,
  CalendarIcon,
  Download,
  Settings,
  Plus,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

// Import sub-components
import { PlatformConnectionManager } from "@/components/admin/SearchTraffic/PlatformConnectionManager";
import { TrafficOverview } from "@/components/admin/SearchTraffic/TrafficOverview";
import { QueryPerformance } from "@/components/admin/SearchTraffic/QueryPerformance";
import { GeographicBreakdown } from "@/components/admin/SearchTraffic/GeographicBreakdown";
import { DeviceBrowserAnalytics } from "@/components/admin/SearchTraffic/DeviceBrowserAnalytics";
import { TopPagesPerformance } from "@/components/admin/SearchTraffic/TopPagesPerformance";
import { TrafficSources } from "@/components/admin/SearchTraffic/TrafficSources";
import { SEOOpportunities } from "@/components/admin/SearchTraffic/SEOOpportunities";
import { ComparativeAnalytics } from "@/components/admin/SearchTraffic/ComparativeAnalytics";
import { InsightsAnomalies } from "@/components/admin/SearchTraffic/InsightsAnomalies";
import { TrafficForecasts } from "@/components/admin/SearchTraffic/TrafficForecasts";

export default function SearchTrafficDashboard() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useAdminCheck();

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [activeTab, setActiveTab] = useState("overview");
  const [connections, setConnections] = useState<any[]>([]);
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [showConnectionManager, setShowConnectionManager] = useState(false);

  // Redirect if not admin
  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      navigate("/");
      toast.error("Access denied. Admin privileges required.");
    }
  }, [isAdmin, adminLoading, navigate]);

  // Fetch platform connections
  useEffect(() => {
    if (isAdmin) {
      fetchConnections();
    }
  }, [isAdmin]);

  const fetchConnections = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("analytics_platform_connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setConnections(data || []);

      // Auto-select all connections
      if (data) {
        setSelectedConnections(data.map(c => c.id));
      }
    } catch (error: any) {
      console.error("Error fetching connections:", error);
      toast.error("Failed to load platform connections");
    }
  };

  const handleSyncData = async () => {
    setSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const response = await invokeEdgeFunction("sync-analytics-data", {
        body: {
          userId: user.id,
          startDate: format(dateRange.from, "yyyy-MM-dd"),
          endDate: format(dateRange.to, "yyyy-MM-dd"),
        },
      });

      if (response.error) throw response.error;

      toast.success("Analytics data synced successfully!");

      // Refresh the dashboard data
      window.location.reload();
    } catch (error: any) {
      console.error("Error syncing data:", error);
      toast.error(error.message || "Failed to sync analytics data");
    } finally {
      setSyncing(false);
    }
  };

  const handleExportData = async () => {
    try {
      toast.info("Export functionality coming soon!");
      // TODO: Implement CSV/PDF export
    } catch (error: any) {
      console.error("Error exporting data:", error);
      toast.error("Failed to export data");
    }
  };

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const hasConnections = connections.length > 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Search Traffic Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Unified dashboard for Google Analytics, Search Console, Bing, and Yandex
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConnectionManager(true)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Manage Platforms
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportData}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Platform Status Bar */}
      {hasConnections && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Connected Platforms:</span>
                <div className="flex gap-2">
                  {connections.map((conn) => (
                    <div
                      key={conn.id}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium",
                        conn.sync_status === "success"
                          ? "bg-green-100 text-green-700"
                          : conn.sync_status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-700"
                      )}
                    >
                      {conn.platform.replace("_", " ").toUpperCase()}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={(range: any) => {
                        if (range?.from && range?.to) {
                          setDateRange({ from: range.from, to: range.to });
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>

                <Button
                  size="sm"
                  onClick={handleSyncData}
                  disabled={syncing}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
                  {syncing ? "Syncing..." : "Sync Data"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Connections State */}
      {!hasConnections && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Platforms Connected</h3>
              <p className="text-muted-foreground mb-4">
                Connect your analytics platforms to start tracking your search traffic
              </p>
              <Button onClick={() => setShowConnectionManager(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Connect Platform
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Dashboard Tabs */}
      {hasConnections && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">
              <BarChart3 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="queries">
              <FileText className="h-4 w-4 mr-2" />
              Queries
            </TabsTrigger>
            <TabsTrigger value="pages">
              <FileText className="h-4 w-4 mr-2" />
              Pages
            </TabsTrigger>
            <TabsTrigger value="audience">
              <Users className="h-4 w-4 mr-2" />
              Audience
            </TabsTrigger>
            <TabsTrigger value="seo">
              <TrendingUp className="h-4 w-4 mr-2" />
              SEO
            </TabsTrigger>
            <TabsTrigger value="insights">
              <AlertCircle className="h-4 w-4 mr-2" />
              Insights
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <TrafficOverview
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
            <ComparativeAnalytics
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
          </TabsContent>

          <TabsContent value="queries" className="space-y-4">
            <QueryPerformance
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
          </TabsContent>

          <TabsContent value="pages" className="space-y-4">
            <TopPagesPerformance
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
          </TabsContent>

          <TabsContent value="audience" className="space-y-4">
            <TrafficSources
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
            <GeographicBreakdown
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
            <DeviceBrowserAnalytics
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
          </TabsContent>

          <TabsContent value="seo" className="space-y-4">
            <SEOOpportunities
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
            <TrafficForecasts
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <InsightsAnomalies
              dateRange={dateRange}
              connections={connections.filter(c => selectedConnections.includes(c.id))}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Platform Connection Manager Dialog */}
      {showConnectionManager && (
        <PlatformConnectionManager
          open={showConnectionManager}
          onClose={() => {
            setShowConnectionManager(false);
            fetchConnections();
          }}
        />
      )}
    </div>
  );
}
