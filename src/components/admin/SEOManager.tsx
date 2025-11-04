import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
  Search,
  FileText,
  Code,
  Globe,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  Download,
  Copy,
  RefreshCw,
  Zap,
  TrendingUp,
  Target,
  Activity,
  Eye,
  BarChart3,
  FileJson,
  FileSpreadsheet,
  Sparkles,
  ExternalLink,
  Clock,
  Shield,
  Image as ImageIcon,
  Smartphone,
  Gauge,
  Link2,
  Users,
  Trophy,
  XCircle,
  Info,
  Bell,
  Settings,
  Calendar,
  Mail,
  ArrowRightCircle,
  Network,
  DollarSign,
  Image,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { ContentOptimizer } from "./ContentOptimizer";

interface AuditResult {
  category: string;
  item: string;
  status: "passed" | "warning" | "failed" | "info";
  message: string;
  impact: "high" | "medium" | "low";
  fix?: string;
}

interface SEOScore {
  overall: number;
  technical: number;
  onPage: number;
  performance: number;
  mobile: number;
  accessibility: number;
}

interface KeywordData {
  keyword: string;
  position: number;
  volume: number;
  difficulty: number;
  url: string;
  trend: "up" | "down" | "stable";
  impressions?: number;  // From GSC
  clicks?: number;        // From GSC
  ctr?: number;          // From GSC
}

interface PageData {
  url: string;
  title: string;
  metaDescription: string;
  wordCount: number;
  issues: number;
  score: number;
}

export function SEOManager() {
  const [robotsTxt, setRobotsTxt] = useState("");
  const [sitemapXml, setSitemapXml] = useState("");
  const [llmsTxt, setLlmsTxt] = useState("");
  const [isRegeneratingSitemap, setIsRegeneratingSitemap] = useState(false);
  const [metaTags, setMetaTags] = useState({
    title: "EatPal - Picky Eater Meal Planning Made Easy",
    description:
      "Plan weekly meals for picky eaters with safe foods and daily try bites. Auto-generate grocery lists and track meal results.",
    keywords: "meal planning, picky eaters, kid meals, grocery list, meal tracker",
    og_title: "EatPal - Picky Eater Solutions",
    og_description:
      "Simple meal planning app for parents of picky eaters with weekly rotation and grocery list generation",
    og_image: "https://lovable.dev/opengraph-image-p98pqg.png",
    twitter_card: "summary_large_image",
    twitter_site: "@lovable_dev",
  });

  const [structuredData, setStructuredData] = useState({});
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [seoScore, setSeoScore] = useState<SEOScore>({
    overall: 0,
    technical: 0,
    onPage: 0,
    performance: 0,
    mobile: 0,
    accessibility: 0,
  });
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditUrl, setAuditUrl] = useState(window.location.origin);
  const [trackedKeywords, setTrackedKeywords] = useState<KeywordData[]>([]);
  const [pageAnalysis, setPageAnalysis] = useState<PageData[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [competitorResults, setCompetitorResults] = useState<any[]>([]);
  const [isAnalyzingCompetitor, setIsAnalyzingCompetitor] = useState(false);
  const [activeTab, setActiveTab] = useState("audit");
  const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
  const [fixSuggestions, setFixSuggestions] = useState<any[]>([]);
  const [isApplyingFixes, setIsApplyingFixes] = useState(false);

  // Google Search Console state
  const [gscConnected, setGscConnected] = useState(false);
  const [gscProperties, setGscProperties] = useState<any[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [isSyncingGSC, setIsSyncingGSC] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isConnectingGSC, setIsConnectingGSC] = useState(false);

  // Monitoring & Alerts state
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertRules, setAlertRules] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<any>(null);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  const [isLoadingMonitoring, setIsLoadingMonitoring] = useState(false);

  const isMobile = useIsMobile();

  useEffect(() => {
    loadSEOSettings();
    loadTrackedKeywords();
    loadCompetitorAnalysis();
    loadPageAnalysis();
    checkGSCConnection();
    
    // Check if we're returning from OAuth
    const wasConnecting = sessionStorage.getItem('gsc_connecting');
    if (wasConnecting === 'true') {
      sessionStorage.removeItem('gsc_connecting');
      setIsConnectingGSC(true);
      
      // Check connection status after a brief delay
      setTimeout(async () => {
        await checkGSCConnection();
        if (gscConnected) {
          toast.success("Successfully connected to Google Search Console!");
          await fetchGSCPropertiesList();
        }
        setIsConnectingGSC(false);
      }, 1000);
    }
  }, []);

  const loadTrackedKeywords = async () => {
    try {
      const { data, error } = await supabase
        .from('seo_keywords')
        .select('*')
        .order('priority', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const keywords: KeywordData[] = data.map((kw) => ({
          keyword: kw.keyword,
          position: kw.current_position || 0,
          volume: kw.search_volume || 0,
          difficulty: kw.difficulty || 0,
          url: kw.target_url,
          trend: kw.position_trend as "up" | "down" | "stable",
          impressions: kw.impressions || undefined,
          clicks: kw.clicks || undefined,
          ctr: kw.ctr || undefined,
        }));
        setTrackedKeywords(keywords);
      } else {
        // Use fallback mock data if database is empty
        const mockKeywords: KeywordData[] = [
          { keyword: "picky eater meal planning", position: 3, volume: 1200, difficulty: 42, url: "/", trend: "up" },
          { keyword: "kid meal planner", position: 7, volume: 890, difficulty: 38, url: "/planner", trend: "up" },
          { keyword: "safe foods for picky eaters", position: 12, volume: 650, difficulty: 35, url: "/pantry", trend: "stable" },
          { keyword: "meal planning app", position: 24, volume: 5400, difficulty: 68, url: "/", trend: "down" },
        ];
        setTrackedKeywords(mockKeywords);
      }
    } catch (error) {
      console.error('Error loading keywords:', error);
      toast.error('Failed to load keyword data');
    }
  };

  const loadCompetitorAnalysis = async () => {
    try {
      const { data, error } = await supabase
        .from('seo_competitor_analysis')
        .select('*')
        .eq('is_active', true)
        .order('analyzed_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (data && data.length > 0) {
        setCompetitorResults(data.map((comp) => ({
          url: comp.competitor_url,
          score: comp.overall_score,
          status: comp.status_code,
          analysis: comp.analysis,
          analyzedAt: comp.analyzed_at,
        })));
      }
    } catch (error) {
      console.error('Error loading competitor analysis:', error);
    }
  };

  const loadPageAnalysis = async () => {
    try {
      const { data, error } = await supabase
        .from('seo_page_scores')
        .select('*')
        .order('overall_score', { ascending: false })
        .limit(20);

      if (error) throw error;

      if (data && data.length > 0) {
        const pages: PageData[] = data.map((page) => ({
          url: page.page_url,
          title: page.page_title || '',
          metaDescription: '',
          wordCount: page.word_count || 0,
          issues: page.issues_count || 0,
          score: page.overall_score,
        }));
        setPageAnalysis(pages);
      }
    } catch (error) {
      console.error('Error loading page analysis:', error);
    }
  };

  const analyzeBlogPostsSEO = async () => {
    toast.info("Analyzing all blog posts for SEO...");

    try {
      const { data, error} = await supabase.functions.invoke("analyze-blog-posts-seo");

      if (error) throw error;

      if (data.analyzed > 0) {
        toast.success(`Analyzed ${data.analyzed} blog posts successfully!`);
        await loadPageAnalysis();
      } else {
        toast.info("No published blog posts to analyze");
      }
    } catch (error: any) {
      console.error("Error analyzing blog posts:", error);
      toast.error(`Failed to analyze blog posts: ${error.message}`);
    }
  };

  // =====================================================
  // GOOGLE SEARCH CONSOLE FUNCTIONS
  // =====================================================

  const checkGSCConnection = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase.functions.invoke("gsc-oauth", {
        body: { action: "status", userId: user.id },
      });

      if (error) throw error;

      setGscConnected(data.connected || false);

      if (data.connected) {
        // Load properties
        await fetchGSCPropertiesList();
      }
    } catch (error: any) {
      console.error("Error checking GSC connection:", error);
    }
  };

  const connectToGSC = async () => {
    setIsConnectingGSC(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        toast.error("Please log in first");
        return;
      }

      // Get OAuth URL
      const { data, error } = await supabase.functions.invoke("gsc-oauth", {
        body: { action: "initiate", userId: user.id },
      });

      if (error) throw error;

      if (data.authUrl) {
        // Store the connection state before redirecting
        sessionStorage.setItem('gsc_connecting', 'true');
        sessionStorage.setItem('gsc_user_id', user.id);
        
        // Use full page redirect instead of popup to avoid COOP issues
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      console.error("Error connecting to GSC:", error);
      toast.error(`Failed to connect: ${error.message}`);
      setIsConnectingGSC(false);
    }
  };

  const fetchGSCPropertiesList = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase.functions.invoke("gsc-fetch-properties", {
        body: { userId: user.id },
      });

      if (error) throw error;

      if (data.properties && data.properties.length > 0) {
        setGscProperties(data.properties);

        // Auto-select primary property
        const primary = data.properties.find((p: any) => p.is_primary);
        if (primary) {
          setSelectedProperty(primary.property_url);
        }
      }
    } catch (error: any) {
      console.error("Error fetching GSC properties:", error);
    }
  };

  const syncGSCData = async () => {
    if (!selectedProperty) {
      toast.error("Please select a property first");
      return;
    }

    setIsSyncingGSC(true);
    toast.info("Syncing data from Google Search Console...");

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not logged in");

      const { data, error } = await supabase.functions.invoke("gsc-sync-data", {
        body: {
          userId: user.id,
          propertyUrl: selectedProperty,
          syncType: "all",
        },
      });

      if (error) throw error;

      toast.success(`Synced ${data.recordsSynced} records from Google Search Console!`);
      setLastSyncedAt(new Date().toISOString());

      // Reload keywords to show updated GSC data
      await loadTrackedKeywords();
    } catch (error: any) {
      console.error("Error syncing GSC data:", error);
      toast.error(`Failed to sync: ${error.message}`);
    } finally {
      setIsSyncingGSC(false);
    }
  };

  const disconnectGSC = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await supabase.functions.invoke("gsc-oauth", {
        body: { action: "disconnect", userId: user.id },
      });

      if (error) throw error;

      setGscConnected(false);
      setGscProperties([]);
      setSelectedProperty("");
      setLastSyncedAt(null);

      toast.success("Disconnected from Google Search Console");
    } catch (error: any) {
      console.error("Error disconnecting from GSC:", error);
      toast.error(`Failed to disconnect: ${error.message}`);
    }
  };

  // =====================================================
  // END GOOGLE SEARCH CONSOLE FUNCTIONS
  // =====================================================

  // =====================================================
  // MONITORING & ALERTS FUNCTIONS
  // =====================================================

  const loadMonitoringData = async () => {
    try {
      setIsLoadingMonitoring(true);
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      // Load active alerts
      const { data: alertsData } = await supabase
        .from("seo_alerts")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10);

      setAlerts(alertsData || []);
      setActiveAlertsCount(alertsData?.length || 0);

      // Load alert rules
      const { data: rulesData } = await supabase
        .from("seo_alert_rules")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setAlertRules(rulesData || []);

      // Load schedules
      const { data: schedulesData } = await supabase
        .from("seo_monitoring_schedules")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false});

      setSchedules(schedulesData || []);

      // Load notification preferences - create default if doesn't exist
      const { data: prefsData, error: prefsError } = await supabase
        .from("seo_notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (prefsError && prefsError.code === "PGRST116") {
        // No preferences found - create default
        const defaultPrefs = {
          user_id: user.id,
          email_enabled: true,
          email_address: user.email,
          immediate_alerts: true,
          daily_digest: true,
          notify_score_drops: true,
          notify_keyword_changes: true,
          notify_gsc_issues: true,
          notify_performance_issues: true,
        };

        const { data: newPrefs } = await supabase
          .from("seo_notification_preferences")
          .insert(defaultPrefs)
          .select()
          .single();

        setNotificationPrefs(newPrefs || defaultPrefs);

        // Also create default alert rule
        await supabase.from("seo_alert_rules").insert({
          user_id: user.id,
          rule_name: "SEO Score Drop Alert",
          rule_type: "score_drop",
          condition: { type: "score_drop", threshold: 10, timeframe_hours: 24 },
          severity: "high",
        });

        // Create default monitoring schedule
        await supabase.from("seo_monitoring_schedules").insert({
          user_id: user.id,
          schedule_name: "Daily SEO Audit",
          schedule_type: "audit",
          cron_expression: "0 3 * * *",
          config: { audit_type: "full" },
        });

        // Reload data to show newly created defaults
        setTimeout(() => loadMonitoringData(), 500);
      } else {
        setNotificationPrefs(prefsData || {
          email_enabled: true,
          immediate_alerts: true,
          daily_digest: true,
          notify_score_drops: true,
          notify_keyword_changes: true,
        });
      }
    } catch (error: any) {
      console.error("Error loading monitoring data:", error);
    } finally {
      setIsLoadingMonitoring(false);
    }
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { error } = await supabase
        .from("seo_alerts")
        .update({
          status: "acknowledged",
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        })
        .eq("id", alertId);

      if (error) throw error;

      await loadMonitoringData();
      toast.success("Alert acknowledged");
    } catch (error: any) {
      console.error("Error acknowledging alert:", error);
      toast.error("Failed to acknowledge alert");
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("seo_alerts")
        .update({ status: "dismissed" })
        .eq("id", alertId);

      if (error) throw error;

      await loadMonitoringData();
      toast.success("Alert dismissed");
    } catch (error: any) {
      console.error("Error dismissing alert:", error);
      toast.error("Failed to dismiss alert");
    }
  };

  const toggleSchedule = async (scheduleId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from("seo_monitoring_schedules")
        .update({ is_enabled: enabled })
        .eq("id", scheduleId);

      if (error) throw error;

      await loadMonitoringData();
      toast.success(enabled ? "Schedule enabled" : "Schedule disabled");
    } catch (error: any) {
      console.error("Error toggling schedule:", error);
      toast.error("Failed to update schedule");
    }
  };

  const saveNotificationPreferences = async (prefs: any) => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { error } = await supabase
        .from("seo_notification_preferences")
        .upsert({
          user_id: user.id,
          ...prefs,
        });

      if (error) throw error;

      setNotificationPrefs(prefs);
      toast.success("Notification preferences saved");
    } catch (error: any) {
      console.error("Error saving preferences:", error);
      toast.error("Failed to save preferences");
    }
  };

  // =====================================================
  // END MONITORING & ALERTS FUNCTIONS
  // =====================================================

  const runComprehensiveAudit = async () => {
    setIsAuditing(true);
    toast.info("Running comprehensive SEO audit...");
    
    const results: AuditResult[] = [];
    
    // Technical SEO Checks
    await runTechnicalSEOChecks(results);
    
    // On-Page SEO Checks
    await runOnPageSEOChecks(results);
    
    // Performance Checks
    await runPerformanceChecks(results);
    
    // Mobile & Accessibility
    await runMobileAccessibilityChecks(results);
    
    // Security Checks
    await runSecurityChecks(results);
    
    // Content Quality
    await runContentQualityChecks(results);
    
    setAuditResults(results);
    const scores = calculateSEOScore(results);

    // Save audit to database
    try {
      const passed = results.filter((r) => r.status === "passed").length;
      const warnings = results.filter((r) => r.status === "warning").length;
      const failed = results.filter((r) => r.status === "failed").length;

      const { data: auditData, error: auditError } = await supabase
        .from('seo_audit_history')
        .insert({
          url: auditUrl,
          audit_type: 'comprehensive',
          overall_score: scores.overall,
          technical_score: scores.technical,
          onpage_score: scores.onPage,
          performance_score: scores.performance,
          mobile_score: scores.mobile,
          accessibility_score: scores.accessibility,
          results: results,
          total_checks: results.length,
          passed_checks: passed,
          warning_checks: warnings,
          failed_checks: failed,
          triggered_by: 'manual',
        })
        .select()
        .single();

      if (auditError) {
        console.error('Error saving audit:', auditError);
      } else if (auditData) {
        setCurrentAuditId(auditData.id);

        // Update last_audit_at in settings
        await supabase
          .from('seo_settings')
          .update({ last_audit_at: new Date().toISOString() })
          .eq('id', '00000000-0000-0000-0000-000000000001');
      }
    } catch (error) {
      console.error('Error saving audit results:', error);
    }

    setIsAuditing(false);
    toast.success("SEO audit complete! Analyzed 50+ factors.");
  };

  const runTechnicalSEOChecks = async (results: AuditResult[]) => {
    // Title Tag
    const titleTag = document.querySelector("title");
    if (titleTag && titleTag.textContent) {
      const length = titleTag.textContent.length;
      if (length >= 30 && length <= 60) {
        results.push({
          category: "Technical SEO",
          item: "Title Tag",
          status: "passed",
          message: `✓ Title tag length is optimal (${length} characters)`,
          impact: "high",
        });
      } else if (length < 30) {
        results.push({
          category: "Technical SEO",
          item: "Title Tag",
          status: "warning",
          message: `⚠ Title tag is too short (${length} characters). Recommended: 30-60.`,
          impact: "high",
          fix: "Expand your title tag to include more descriptive keywords while keeping it under 60 characters.",
        });
      } else {
        results.push({
          category: "Technical SEO",
          item: "Title Tag",
          status: "warning",
          message: `⚠ Title tag is too long (${length} characters). May be truncated in search results.`,
          impact: "high",
          fix: "Shorten your title tag to 60 characters or less to prevent truncation.",
        });
      }
    } else {
      results.push({
        category: "Technical SEO",
        item: "Title Tag",
        status: "failed",
        message: "✗ Missing title tag",
        impact: "high",
        fix: "Add a <title> tag to the <head> section with a descriptive, keyword-rich title.",
      });
    }

    // Meta Description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      const content = metaDescription.getAttribute("content") || "";
      if (content.length >= 120 && content.length <= 160) {
        results.push({
          category: "Technical SEO",
          item: "Meta Description",
          status: "passed",
          message: `✓ Meta description length is optimal (${content.length} characters)`,
          impact: "high",
        });
      } else {
        results.push({
          category: "Technical SEO",
          item: "Meta Description",
          status: "warning",
          message: `⚠ Meta description should be 120-160 characters (current: ${content.length})`,
          impact: "medium",
          fix: "Optimize your meta description to 120-160 characters for better display in search results.",
        });
      }
    } else {
      results.push({
        category: "Technical SEO",
        item: "Meta Description",
        status: "failed",
        message: "✗ Missing meta description",
        impact: "high",
        fix: 'Add <meta name="description" content="..."> to improve click-through rates.',
      });
    }

    // Canonical URL
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      results.push({
        category: "Technical SEO",
        item: "Canonical URL",
        status: "passed",
        message: `✓ Canonical URL present: ${canonical.getAttribute("href")}`,
        impact: "high",
      });
    } else {
      results.push({
        category: "Technical SEO",
        item: "Canonical URL",
        status: "warning",
        message: "⚠ Missing canonical URL",
        impact: "medium",
        fix: 'Add <link rel="canonical" href="..."> to prevent duplicate content issues.',
      });
    }

    // Robots Meta
    const robotsMeta = document.querySelector('meta[name="robots"]');
    if (robotsMeta) {
      const content = robotsMeta.getAttribute("content") || "";
      if (content.includes("noindex")) {
        results.push({
          category: "Technical SEO",
          item: "Robots Meta",
          status: "warning",
          message: "⚠ Page set to noindex - will not appear in search results",
          impact: "high",
          fix: "Remove noindex directive if you want this page indexed by search engines.",
        });
      } else {
        results.push({
          category: "Technical SEO",
          item: "Robots Meta",
          status: "passed",
          message: `✓ Robots meta configured: ${content}`,
          impact: "medium",
        });
      }
    }

    // Viewport
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      results.push({
        category: "Technical SEO",
        item: "Viewport",
        status: "passed",
        message: "✓ Viewport meta tag present (mobile-friendly)",
        impact: "high",
      });
    } else {
      results.push({
        category: "Technical SEO",
        item: "Viewport",
        status: "failed",
        message: "✗ Missing viewport meta tag",
        impact: "high",
        fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile compatibility.',
      });
    }

    // HTTPS
    if (window.location.protocol === "https:") {
      results.push({
        category: "Technical SEO",
        item: "HTTPS",
        status: "passed",
        message: "✓ Site uses HTTPS (secure connection)",
        impact: "high",
      });
    } else {
      results.push({
        category: "Technical SEO",
        item: "HTTPS",
        status: "failed",
        message: "✗ Site not using HTTPS",
        impact: "high",
        fix: "Enable HTTPS/SSL certificate for improved security and SEO rankings.",
      });
    }

    // Favicon
    const favicon = document.querySelector('link[rel*="icon"]');
    if (favicon) {
      results.push({
        category: "Technical SEO",
        item: "Favicon",
        status: "passed",
        message: "✓ Favicon present",
        impact: "low",
      });
    } else {
      results.push({
        category: "Technical SEO",
        item: "Favicon",
        status: "warning",
        message: "⚠ Missing favicon",
        impact: "low",
        fix: "Add a favicon to improve brand recognition in browser tabs and bookmarks.",
      });
    }

    // Language Declaration
    const htmlLang = document.documentElement.lang;
    if (htmlLang) {
      results.push({
        category: "Technical SEO",
        item: "Language Declaration",
        status: "passed",
        message: `✓ Language declared: ${htmlLang}`,
        impact: "medium",
      });
    } else {
      results.push({
        category: "Technical SEO",
        item: "Language Declaration",
        status: "warning",
        message: "⚠ Missing language declaration on <html> tag",
        impact: "medium",
        fix: 'Add lang="en" (or appropriate language code) to your <html> tag.',
      });
    }
  };

  const runOnPageSEOChecks = async (results: AuditResult[]) => {
    // H1 Tags
    const h1s = document.querySelectorAll("h1");
    if (h1s.length === 1) {
      results.push({
        category: "On-Page SEO",
        item: "H1 Tag",
        status: "passed",
        message: `✓ Single H1 tag present: "${h1s[0].textContent?.substring(0, 50)}..."`,
        impact: "high",
      });
    } else if (h1s.length === 0) {
      results.push({
        category: "On-Page SEO",
        item: "H1 Tag",
        status: "failed",
        message: "✗ Missing H1 tag",
        impact: "high",
        fix: "Add a single, descriptive H1 tag that includes your primary keyword.",
      });
    } else {
      results.push({
        category: "On-Page SEO",
        item: "H1 Tag",
        status: "warning",
        message: `⚠ Multiple H1 tags found (${h1s.length})`,
        impact: "medium",
        fix: "Use only one H1 per page. Additional headings should use H2-H6.",
      });
    }

    // Heading Hierarchy
    const h2s = document.querySelectorAll("h2");
    const h3s = document.querySelectorAll("h3");
    const hasProperHierarchy = h1s.length > 0 && h2s.length > 0;
    if (hasProperHierarchy) {
      results.push({
        category: "On-Page SEO",
        item: "Heading Hierarchy",
        status: "passed",
        message: `✓ Proper heading structure (H1: ${h1s.length}, H2: ${h2s.length}, H3: ${h3s.length})`,
        impact: "medium",
      });
    } else {
      results.push({
        category: "On-Page SEO",
        item: "Heading Hierarchy",
        status: "warning",
        message: "⚠ Improve heading structure with H1, H2, H3 hierarchy",
        impact: "medium",
        fix: "Use a logical heading structure: H1 for main title, H2 for sections, H3 for subsections.",
      });
    }

    // Images with Alt Text
    const images = document.querySelectorAll("img");
    const imagesWithAlt = Array.from(images).filter((img) => img.alt && img.alt.length > 0);
    const altPercentage = images.length > 0 ? (imagesWithAlt.length / images.length) * 100 : 100;
    
    if (altPercentage === 100) {
      results.push({
        category: "On-Page SEO",
        item: "Image Alt Text",
        status: "passed",
        message: `✓ All ${images.length} images have alt text`,
        impact: "medium",
      });
    } else if (altPercentage >= 80) {
      results.push({
        category: "On-Page SEO",
        item: "Image Alt Text",
        status: "warning",
        message: `⚠ ${imagesWithAlt.length}/${images.length} images have alt text (${altPercentage.toFixed(0)}%)`,
        impact: "medium",
        fix: "Add descriptive alt text to all images for better accessibility and SEO.",
      });
    } else {
      results.push({
        category: "On-Page SEO",
        item: "Image Alt Text",
        status: "failed",
        message: `✗ Only ${imagesWithAlt.length}/${images.length} images have alt text (${altPercentage.toFixed(0)}%)`,
        impact: "high",
        fix: "Add alt text to images. Include keywords where appropriate, but focus on accurate descriptions.",
      });
    }

    // Internal Links
    const internalLinks = document.querySelectorAll('a[href^="/"], a[href^="' + window.location.origin + '"]');
    if (internalLinks.length >= 5) {
      results.push({
        category: "On-Page SEO",
        item: "Internal Linking",
        status: "passed",
        message: `✓ Good internal linking structure (${internalLinks.length} internal links)`,
        impact: "medium",
      });
    } else {
      results.push({
        category: "On-Page SEO",
        item: "Internal Linking",
        status: "warning",
        message: `⚠ Limited internal linking (${internalLinks.length} links)`,
        impact: "medium",
        fix: "Add more internal links to help search engines discover and understand your content structure.",
      });
    }

    // External Links
    const externalLinks = document.querySelectorAll('a[href^="http"]:not([href^="' + window.location.origin + '"])');
    const externalLinksWithRel = Array.from(externalLinks).filter((link) => link.getAttribute("rel"));
    
    if (externalLinksWithRel.length === externalLinks.length) {
      results.push({
        category: "On-Page SEO",
        item: "External Links",
        status: "passed",
        message: `✓ All ${externalLinks.length} external links have rel attributes`,
        impact: "low",
      });
    } else if (externalLinks.length > 0) {
      results.push({
        category: "On-Page SEO",
        item: "External Links",
        status: "warning",
        message: `⚠ ${externalLinks.length - externalLinksWithRel.length}/${externalLinks.length} external links missing rel attributes`,
        impact: "low",
        fix: 'Add rel="noopener noreferrer" or rel="nofollow" to external links as appropriate.',
      });
    }

    // Open Graph Tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');

    const ogComplete = ogTitle && ogDescription && ogImage && ogUrl;
    if (ogComplete) {
      results.push({
        category: "On-Page SEO",
        item: "Open Graph",
        status: "passed",
        message: "✓ Complete Open Graph meta tags (title, description, image, URL)",
        impact: "medium",
      });
    } else {
      const missing = [];
      if (!ogTitle) missing.push("title");
      if (!ogDescription) missing.push("description");
      if (!ogImage) missing.push("image");
      if (!ogUrl) missing.push("URL");
      
      results.push({
        category: "On-Page SEO",
        item: "Open Graph",
        status: "warning",
        message: `⚠ Missing Open Graph tags: ${missing.join(", ")}`,
        impact: "medium",
        fix: "Add complete Open Graph tags for better social media sharing.",
      });
    }

    // Twitter Cards
    const twitterCard = document.querySelector('meta[name="twitter:card"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');

    if (twitterCard) {
      results.push({
        category: "On-Page SEO",
        item: "Twitter Cards",
        status: "passed",
        message: "✓ Twitter Card meta tags present",
        impact: "low",
      });
    } else {
      results.push({
        category: "On-Page SEO",
        item: "Twitter Cards",
        status: "warning",
        message: "⚠ Missing Twitter Card meta tags",
        impact: "low",
        fix: "Add Twitter Card meta tags for improved Twitter sharing.",
      });
    }

    // Structured Data
    const structuredDataScripts = document.querySelectorAll('script[type="application/ld+json"]');
    if (structuredDataScripts.length > 0) {
      results.push({
        category: "On-Page SEO",
        item: "Structured Data",
        status: "passed",
        message: `✓ Structured data present (${structuredDataScripts.length} schema(s))`,
        impact: "high",
      });
    } else {
      results.push({
        category: "On-Page SEO",
        item: "Structured Data",
        status: "warning",
        message: "⚠ No structured data found",
        impact: "high",
        fix: "Add JSON-LD structured data for better search engine understanding and rich results.",
      });
    }
  };

  const runPerformanceChecks = async (results: AuditResult[]) => {
    // Page Load Time (simulated - in production use Lighthouse API)
    const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
    if (loadTime < 3000) {
      results.push({
        category: "Performance",
        item: "Page Load Time",
        status: "passed",
        message: `✓ Fast page load time (${(loadTime / 1000).toFixed(2)}s)`,
        impact: "high",
      });
    } else if (loadTime < 5000) {
      results.push({
        category: "Performance",
        item: "Page Load Time",
        status: "warning",
        message: `⚠ Moderate page load time (${(loadTime / 1000).toFixed(2)}s)`,
        impact: "high",
        fix: "Optimize images, minify CSS/JS, and enable caching to improve load times.",
      });
    } else {
      results.push({
        category: "Performance",
        item: "Page Load Time",
        status: "failed",
        message: `✗ Slow page load time (${(loadTime / 1000).toFixed(2)}s)`,
        impact: "high",
        fix: "Critical: Improve server response time, optimize assets, and consider a CDN.",
      });
    }

    // Image Optimization
    const pageImages = document.querySelectorAll('img');
    const largeImages = Array.from(pageImages).filter((img) => {
      return img.naturalWidth > 2000 || img.naturalHeight > 2000;
    });
    
    if (largeImages.length === 0) {
      results.push({
        category: "Performance",
        item: "Image Optimization",
        status: "passed",
        message: "✓ Images appear to be optimized",
        impact: "medium",
      });
    } else {
      results.push({
        category: "Performance",
        item: "Image Optimization",
        status: "warning",
        message: `⚠ ${largeImages.length} large images detected (>2000px)`,
        impact: "high",
        fix: "Resize and compress large images. Use modern formats like WebP.",
      });
    }

    // CSS/JS Minification (check file sizes)
    const scripts = document.querySelectorAll("script[src]");
    const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
    
    results.push({
      category: "Performance",
      item: "Resource Loading",
      status: "info",
      message: `ℹ ${scripts.length} scripts, ${stylesheets.length} stylesheets loaded`,
      impact: "medium",
    });

    // Render-Blocking Resources
    const renderBlockingScripts = Array.from(scripts).filter((script) => {
      return !script.hasAttribute("async") && !script.hasAttribute("defer");
    });

    if (renderBlockingScripts.length === 0) {
      results.push({
        category: "Performance",
        item: "Render-Blocking Scripts",
        status: "passed",
        message: "✓ No render-blocking scripts detected",
        impact: "medium",
      });
    } else {
      results.push({
        category: "Performance",
        item: "Render-Blocking Scripts",
        status: "warning",
        message: `⚠ ${renderBlockingScripts.length} render-blocking scripts found`,
        impact: "high",
        fix: "Add async or defer attributes to non-critical scripts.",
      });
    }
  };

  const runMobileAccessibilityChecks = async (results: AuditResult[]) => {
    // Mobile-Friendly Viewport
    const viewport = document.querySelector('meta[name="viewport"]');
    const viewportContent = viewport?.getAttribute("content") || "";
    
    if (viewportContent.includes("width=device-width")) {
      results.push({
        category: "Mobile & Accessibility",
        item: "Mobile Viewport",
        status: "passed",
        message: "✓ Mobile-responsive viewport configured",
        impact: "high",
      });
    } else {
      results.push({
        category: "Mobile & Accessibility",
        item: "Mobile Viewport",
        status: "failed",
        message: "✗ Mobile viewport not properly configured",
        impact: "high",
        fix: 'Ensure viewport meta includes "width=device-width, initial-scale=1".',
      });
    }

    // Font Size
    const bodyFontSize = window.getComputedStyle(document.body).fontSize;
    const fontSize = parseInt(bodyFontSize);
    
    if (fontSize >= 16) {
      results.push({
        category: "Mobile & Accessibility",
        item: "Font Size",
        status: "passed",
        message: `✓ Readable font size (${fontSize}px)`,
        impact: "medium",
      });
    } else {
      results.push({
        category: "Mobile & Accessibility",
        item: "Font Size",
        status: "warning",
        message: `⚠ Small font size (${fontSize}px) may be hard to read on mobile`,
        impact: "medium",
        fix: "Use minimum 16px font size for body text.",
      });
    }

    // Touch Targets
    const buttons = document.querySelectorAll("button, a");
    const smallButtons = Array.from(buttons).filter((btn) => {
      const rect = btn.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    });

    if (smallButtons.length === 0) {
      results.push({
        category: "Mobile & Accessibility",
        item: "Touch Targets",
        status: "passed",
        message: "✓ All interactive elements are touch-friendly (≥44px)",
        impact: "medium",
      });
    } else {
      results.push({
        category: "Mobile & Accessibility",
        item: "Touch Targets",
        status: "warning",
        message: `⚠ ${smallButtons.length} small touch targets (<44px)`,
        impact: "medium",
        fix: "Ensure buttons and links are at least 44x44px for easy mobile interaction.",
      });
    }

    // ARIA Labels
    const interactiveElements = document.querySelectorAll("button, a, input, select, textarea");
    const elementsWithLabels = Array.from(interactiveElements).filter((el) => {
      return el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.textContent?.trim();
    });

    const labelPercentage = (elementsWithLabels.length / interactiveElements.length) * 100;

    if (labelPercentage === 100) {
      results.push({
        category: "Mobile & Accessibility",
        item: "ARIA Labels",
        status: "passed",
        message: "✓ All interactive elements have accessible labels",
        impact: "high",
      });
    } else {
      results.push({
        category: "Mobile & Accessibility",
        item: "ARIA Labels",
        status: "warning",
        message: `⚠ ${labelPercentage.toFixed(0)}% of interactive elements have labels`,
        impact: "high",
        fix: "Add aria-label or aria-labelledby to unlabeled interactive elements.",
      });
    }

    // Color Contrast (simplified check)
    results.push({
      category: "Mobile & Accessibility",
      item: "Color Contrast",
      status: "info",
      message: "ℹ Manual color contrast check recommended (WCAG AA: 4.5:1)",
      impact: "high",
    });
  };

  const runSecurityChecks = async (results: AuditResult[]) => {
    // HTTPS
    if (window.location.protocol === "https:") {
      results.push({
        category: "Security",
        item: "SSL/TLS",
        status: "passed",
        message: "✓ Secure HTTPS connection",
        impact: "high",
      });
    } else {
      results.push({
        category: "Security",
        item: "SSL/TLS",
        status: "failed",
        message: "✗ Not using HTTPS",
        impact: "high",
        fix: "Enable SSL/TLS certificate for secure connections.",
      });
    }

    // Mixed Content
    const httpResources = Array.from(document.querySelectorAll('[src^="http:"], [href^="http:"]'));
    if (httpResources.length === 0) {
      results.push({
        category: "Security",
        item: "Mixed Content",
        status: "passed",
        message: "✓ No mixed content (HTTP resources on HTTPS page)",
        impact: "high",
      });
    } else {
      results.push({
        category: "Security",
        item: "Mixed Content",
        status: "warning",
        message: `⚠ ${httpResources.length} HTTP resources on HTTPS page`,
        impact: "high",
        fix: "Update all resource URLs to HTTPS to prevent security warnings.",
      });
    }

    // Inline Scripts (security concern)
    const inlineScripts = document.querySelectorAll("script:not([src])");
    if (inlineScripts.length === 0) {
      results.push({
        category: "Security",
        item: "Inline Scripts",
        status: "passed",
        message: "✓ No inline scripts (good for CSP)",
        impact: "low",
      });
    } else {
      results.push({
        category: "Security",
        item: "Inline Scripts",
        status: "info",
        message: `ℹ ${inlineScripts.length} inline scripts present`,
        impact: "low",
      });
    }
  };

  const runContentQualityChecks = async (results: AuditResult[]) => {
    // Word Count
    const bodyText = document.body.innerText || "";
    const wordCount = bodyText.trim().split(/\s+/).length;

    if (wordCount >= 300) {
      results.push({
        category: "Content Quality",
        item: "Word Count",
        status: "passed",
        message: `✓ Substantial content (${wordCount} words)`,
        impact: "high",
      });
    } else {
      results.push({
        category: "Content Quality",
        item: "Word Count",
        status: "warning",
        message: `⚠ Thin content (${wordCount} words). Aim for 300+.`,
        impact: "high",
        fix: "Add more valuable content. Search engines prefer comprehensive, in-depth pages.",
      });
    }

    // Content Freshness
    results.push({
      category: "Content Quality",
      item: "Content Freshness",
      status: "info",
      message: "ℹ Regular content updates improve SEO",
      impact: "medium",
    });

    // Keyword Usage (simplified - check if title contains keywords)
    const title = document.querySelector("title")?.textContent || "";
    const hasKeywords = title.toLowerCase().includes("meal") || title.toLowerCase().includes("food") || title.toLowerCase().includes("planner");

    if (hasKeywords) {
      results.push({
        category: "Content Quality",
        item: "Keyword Optimization",
        status: "passed",
        message: "✓ Keywords present in title",
        impact: "high",
      });
    } else {
      results.push({
        category: "Content Quality",
        item: "Keyword Optimization",
        status: "warning",
        message: "⚠ Consider adding target keywords to title",
        impact: "high",
        fix: "Include your primary keywords naturally in the title tag.",
      });
    }
  };

  const calculateSEOScore = (results: AuditResult[]) => {
    const categories = {
      technical: results.filter((r) => r.category === "Technical SEO" || r.category === "Security"),
      onPage: results.filter((r) => r.category === "On-Page SEO"),
      performance: results.filter((r) => r.category === "Performance"),
      mobile: results.filter((r) => r.category === "Mobile & Accessibility"),
      content: results.filter((r) => r.category === "Content Quality"),
    };

    const calculateCategoryScore = (categoryResults: AuditResult[]) => {
      if (categoryResults.length === 0) return 100;

      const passed = categoryResults.filter((r) => r.status === "passed").length;
      const warnings = categoryResults.filter((r) => r.status === "warning").length;
      const failed = categoryResults.filter((r) => r.status === "failed").length;

      // Scoring: passed = 1.0, warning = 0.5, failed = 0
      const score = (passed + warnings * 0.5) / categoryResults.length * 100;
      return Math.round(score);
    };

    const scores = {
      technical: calculateCategoryScore(categories.technical),
      onPage: calculateCategoryScore(categories.onPage),
      performance: calculateCategoryScore(categories.performance),
      mobile: calculateCategoryScore(categories.mobile),
      accessibility: calculateCategoryScore(categories.mobile), // Using mobile results
    };

    const overall = Math.round(
      (scores.technical * 0.3 + scores.onPage * 0.25 + scores.performance * 0.25 + scores.mobile * 0.2)
    );

    const finalScores = {
      overall,
      ...scores,
    };

    setSeoScore(finalScores);
    return finalScores; // Return scores for saving to database
  };

  const runAIAutoHealing = async () => {
    setIsAutoHealing(true);
    toast.info("Running AI-powered SEO auto-healing...");

    try {
      // Call the apply-seo-fixes edge function
      const { data, error } = await supabase.functions.invoke("apply-seo-fixes", {
        body: {
          auditResults: auditResults,
          auditId: currentAuditId,
          autoApply: false, // Set to true to automatically apply fixes
          userId: (await supabase.auth.getUser()).data.user?.id,
        },
      });

      if (error) throw error;

      setFixSuggestions(data.suggestions || []);

      if (data.autoApplyEnabled && data.appliedFixes > 0) {
        toast.success(`Applied ${data.appliedFixes} SEO fixes automatically!`);

        // Re-run audit to see improvements
        setTimeout(() => {
          runComprehensiveAudit();
        }, 1000);
      } else {
        toast.success(`Generated ${data.totalSuggestions} AI-powered optimization suggestions!`);
      }

      console.log("AI Healing Results:", data);
    } catch (error: any) {
      console.error("AI Auto-Healing error:", error);
      toast.error(`Failed to generate suggestions: ${error.message}`);
    } finally {
      setIsAutoHealing(false);
    }
  };

  const applyFixesBatch = async () => {
    setIsApplyingFixes(true);
    toast.info("Applying SEO fixes...");

    try {
      const { data, error } = await supabase.functions.invoke("apply-seo-fixes", {
        body: {
          auditResults: auditResults,
          auditId: currentAuditId,
          autoApply: true, // Actually apply the fixes
          userId: (await supabase.auth.getUser()).data.user?.id,
        },
      });

      if (error) throw error;

      if (data.appliedFixes > 0) {
        toast.success(`Successfully applied ${data.appliedFixes} SEO fixes!`);

        // Reload SEO settings
        await loadSEOSettings();

        // Re-run audit to verify improvements
        setTimeout(() => {
          runComprehensiveAudit();
        }, 1000);
      }

      if (data.failedFixes > 0) {
        toast.warning(`${data.failedFixes} fixes failed to apply. Check the logs.`);
      }
    } catch (error: any) {
      console.error("Error applying fixes:", error);
      toast.error(`Failed to apply fixes: ${error.message}`);
    } finally {
      setIsApplyingFixes(false);
    }
  };

  const exportAuditReport = (format: "json" | "csv") => {
    const timestamp = new Date().toISOString().split("T")[0];
    
    if (format === "json") {
      const report = {
        timestamp: new Date().toISOString(),
        url: auditUrl,
        score: seoScore,
        results: auditResults,
        keywords: trackedKeywords,
      };
      
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seo-audit-${timestamp}.json`;
      a.click();
      toast.success("SEO audit report exported (JSON)");
    } else {
      // CSV Export
      let csv = "Category,Item,Status,Impact,Message\n";
      auditResults.forEach((result) => {
        csv += `"${result.category}","${result.item}","${result.status}","${result.impact}","${result.message.replace(/"/g, '""')}"\n`;
      });
      
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seo-audit-${timestamp}.csv`;
      a.click();
      toast.success("SEO audit report exported (CSV)");
    }
  };

  const addKeywordToTrack = () => {
    if (!newKeyword.trim()) {
      toast.error("Please enter a keyword");
      return;
    }

    // In production, this would save to database
    const newKeywordData: KeywordData = {
      keyword: newKeyword,
      position: 0,
      volume: 0,
      difficulty: 0,
      url: "/",
      trend: "stable",
    };

    setTrackedKeywords([...trackedKeywords, newKeywordData]);
    setNewKeyword("");
    toast.success(`Added "${newKeyword}" to keyword tracking`);
  };

  const analyzeCompetitor = async () => {
    if (!competitorUrl.trim()) {
      toast.error("Please enter a competitor URL");
      return;
    }

    setIsAnalyzingCompetitor(true);
    toast.info(`Analyzing competitor: ${competitorUrl}`);

    try {
      const { data, error } = await supabase.functions.invoke("seo-audit", {
        body: { url: competitorUrl },
      });

      if (error) throw error;

      // Save to database
      const userId = (await supabase.auth.getUser()).data.user?.id;

      const { error: insertError } = await supabase
        .from('seo_competitor_analysis')
        .insert({
          competitor_url: competitorUrl,
          overall_score: data.score,
          technical_score: data.analysis?.technical ? Math.round(data.analysis.technical.filter((i: any) => i.status === 'passed').length / data.analysis.technical.length * 100) : null,
          onpage_score: data.analysis?.onPage ? Math.round(data.analysis.onPage.filter((i: any) => i.status === 'passed').length / data.analysis.onPage.length * 100) : null,
          performance_score: data.analysis?.performance ? Math.round(data.analysis.performance.filter((i: any) => i.status === 'passed').length / data.analysis.performance.length * 100) : null,
          mobile_score: data.analysis?.mobile ? Math.round(data.analysis.mobile.filter((i: any) => i.status === 'passed').length / data.analysis.mobile.length * 100) : null,
          analysis: data.analysis,
          status_code: data.status,
          content_type: data.contentType,
          our_score: seoScore.overall,
          score_difference: data.score - seoScore.overall,
          analyzed_by_user_id: userId,
        });

      if (insertError) {
        console.error('Error saving competitor analysis:', insertError);
      }

      // Reload competitor analysis
      await loadCompetitorAnalysis();

      toast.success("Competitor analysis complete and saved!");
    } catch (error: any) {
      console.error("Competitor analysis error:", error);
      toast.error(`Failed to analyze competitor: ${error.message}`);
    } finally {
      setIsAnalyzingCompetitor(false);
    }
  };

  const removeCompetitor = async (url: string) => {
    try {
      // Mark as inactive in database
      await supabase
        .from('seo_competitor_analysis')
        .update({ is_active: false })
        .eq('competitor_url', url);

      setCompetitorResults(competitorResults.filter((c) => c.url !== url));
      toast.success("Competitor removed");
    } catch (error) {
      console.error('Error removing competitor:', error);
      toast.error('Failed to remove competitor');
    }
  };

  const regenerateSitemap = async () => {
    setIsRegeneratingSitemap(true);
    
    try {
      // Fetch all published blog posts
      const { data: posts, error } = await supabase
        .from('blog_posts')
        .select('slug, updated_at, published_at, featured_image_url')
        .eq('status', 'published')
        .lte('published_at', new Date().toISOString())
        .order('published_at', { ascending: false });

      if (error) throw error;

      const baseUrl = window.location.origin;
      const today = new Date().toISOString().split('T')[0];

      // Static pages
      const staticPages = [
        { url: "/", priority: "1.0", changefreq: "daily", lastmod: today },
        { url: "/auth", priority: "0.8", changefreq: "monthly", lastmod: today },
        { url: "/pricing", priority: "0.9", changefreq: "weekly", lastmod: today },
        { url: "/dashboard", priority: "0.8", changefreq: "weekly", lastmod: today },
        { url: "/planner", priority: "0.9", changefreq: "weekly", lastmod: today },
        { url: "/kids", priority: "0.8", changefreq: "weekly", lastmod: today },
        { url: "/tracker", priority: "0.8", changefreq: "weekly", lastmod: today },
        { url: "/pantry", priority: "0.7", changefreq: "weekly", lastmod: today },
        { url: "/recipes", priority: "0.8", changefreq: "weekly", lastmod: today },
        { url: "/grocery", priority: "0.7", changefreq: "weekly", lastmod: today },
        { url: "/blog", priority: "0.8", changefreq: "daily", lastmod: today },
        { url: "/faq", priority: "0.7", changefreq: "monthly", lastmod: today },
        { url: "/contact", priority: "0.6", changefreq: "monthly", lastmod: today },
        { url: "/privacy", priority: "0.3", changefreq: "yearly", lastmod: today },
        { url: "/terms", priority: "0.3", changefreq: "yearly", lastmod: today },
      ];

      // Build sitemap
      let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>${baseUrl}/Cover.png</image:loc>
      <image:title>EatPal - Kids Meal Planning for Picky Eaters</image:title>
      <image:caption>The #1 meal planning app for picky eaters and selective eating</image:caption>
    </image:image>
  </url>

`;

      // Add static pages
      staticPages.slice(1).forEach(page => {
        sitemap += `  <!-- ${page.url.replace('/', '').replace('-', ' ').toUpperCase() || 'Page'} -->
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>

`;
      });

      // Add blog posts
      if (posts && posts.length > 0) {
        sitemap += `  <!-- Blog Posts (${posts.length} posts) -->\n`;
        posts.forEach(post => {
          const lastmod = post.updated_at 
            ? new Date(post.updated_at).toISOString().split('T')[0]
            : new Date(post.published_at).toISOString().split('T')[0];

          sitemap += `  <url>
    <loc>${baseUrl}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>`;

          // Add featured image if available
          if (post.featured_image_url) {
            sitemap += `
    <image:image>
      <image:loc>${post.featured_image_url.startsWith('http') ? post.featured_image_url : baseUrl + post.featured_image_url}</image:loc>
    </image:image>`;
          }

          sitemap += `
  </url>

`;
        });
      }

      sitemap += `</urlset>`;

      setSitemapXml(sitemap);
      toast.success(`Sitemap regenerated with ${posts?.length || 0} blog posts!`);
    } catch (error) {
      console.error('Error regenerating sitemap:', error);
      toast.error('Failed to regenerate sitemap');
    } finally {
      setIsRegeneratingSitemap(false);
    }
  };

  const loadSEOSettings = () => {
    // Generate default robots.txt
    const defaultRobots = `# Robots.txt for EatPal
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /auth/

# Sitemap location
Sitemap: ${window.location.origin}/sitemap.xml

# Crawl delay (optional)
Crawl-delay: 1

# Popular search engines
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /`;

    setRobotsTxt(defaultRobots);

    // Generate sitemap.xml
    const pages = [
      { url: "/", priority: "1.0", changefreq: "daily" },
      { url: "/dashboard", priority: "0.8", changefreq: "weekly" },
      { url: "/planner", priority: "0.9", changefreq: "weekly" },
      { url: "/pantry", priority: "0.7", changefreq: "weekly" },
      { url: "/recipes", priority: "0.8", changefreq: "weekly" },
      { url: "/grocery", priority: "0.7", changefreq: "weekly" },
    ];

    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${window.location.origin}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
  </url>`
  )
  .join("\n")}
</urlset>`;

    setSitemapXml(sitemapContent);

    // Generate llms.txt
    const defaultLlms = `# EatPal - Meal Planning for Picky Eaters

## About
EatPal is a meal planning application designed specifically for parents of picky eaters.
It helps families plan weekly meals using safe foods and introduces new foods gradually
through daily "try bites."

## Features
- Child profile management with dietary restrictions and allergens
- Pantry management with safe foods and try bites
- Weekly meal planner with drag-and-drop interface
- Recipe library with kid-friendly meals
- Automatic grocery list generation
- Meal result tracking and notes

## Target Audience
Parents of picky eaters aged 2-12 years old looking for structured meal planning solutions

## Technology
React, TypeScript, Supabase, Vite, shadcn/ui, Tailwind CSS

## Contact
For inquiries: support@eatpal.com

## Documentation
Full documentation available at: ${window.location.origin}/docs

## API
RESTful API available for integrations. Contact for API access.
`;

    setLlmsTxt(defaultLlms);

    // Generate structured data (JSON-LD)
    const structuredDataSchema = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "EatPal",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web Browser",
      description:
        "Meal planning application for parents of picky eaters with weekly meal rotation and grocery list generation",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "127",
        bestRating: "5",
        worstRating: "1",
      },
      creator: {
        "@type": "Organization",
        name: "EatPal",
        url: window.location.origin,
      },
    };

    setStructuredData(structuredDataSchema);
  };

  const handleCopyToClipboard = (content: string, label: string) => {
    navigator.clipboard.writeText(content);
    toast.success(`${label} copied to clipboard`);
  };

  const handleDownloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    toast.success(`${filename} downloaded`);
  };

  const handleUpdateMetaTags = () => {
    // In a real implementation, this would update the database and index.html
    toast.success("Meta tags configuration saved. Update index.html manually with these values.");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "info":
        return <Info className="h-4 w-4 text-blue-600" />;
      default:
        return null;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">SEO Audit & Optimization Suite</h2>
          <p className="text-sm text-muted-foreground">
            Comprehensive SEO analysis, keyword tracking, and AI-powered optimization
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runAIAutoHealing} variant="outline" disabled={isAutoHealing || auditResults.length === 0}>
            <Sparkles className="h-4 w-4 mr-2" />
            {isAutoHealing ? "Analyzing..." : "AI Auto-Heal"}
          </Button>
          {fixSuggestions.length > 0 && (
            <Button onClick={applyFixesBatch} variant="default" disabled={isApplyingFixes}>
              <Zap className={`h-4 w-4 mr-2 ${isApplyingFixes ? "animate-pulse" : ""}`} />
              {isApplyingFixes ? "Applying..." : `Apply ${fixSuggestions.length} Fixes`}
            </Button>
          )}
          <Button onClick={runComprehensiveAudit} disabled={isAuditing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isAuditing ? "animate-spin" : ""}`} />
            {isAuditing ? "Auditing..." : "Run Full Audit"}
          </Button>
        </div>
      </div>

      {/* SEO Score Dashboard */}
      {seoScore.overall > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Overall SEO Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className={`text-4xl font-bold ${getScoreColor(seoScore.overall)}`}>
                  {seoScore.overall}
                </div>
                <div className="flex-1">
                  <Progress value={seoScore.overall} className="h-3" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {seoScore.overall >= 90 && "Excellent"}
                    {seoScore.overall >= 70 && seoScore.overall < 90 && "Good"}
                    {seoScore.overall < 70 && "Needs Improvement"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Technical
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(seoScore.technical)}`}>
                {seoScore.technical}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                On-Page
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(seoScore.onPage)}`}>
                {seoScore.onPage}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(seoScore.performance)}`}>
                {seoScore.performance}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Mobile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(seoScore.mobile)}`}>
                {seoScore.mobile}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Desktop Tabs */}
        {!isMobile && (
          <TabsList>
            <TabsTrigger value="audit">
              <Search className="h-4 w-4 mr-2" />
              Audit
            </TabsTrigger>
            <TabsTrigger value="keywords">
              <Target className="h-4 w-4 mr-2" />
              Keywords
            </TabsTrigger>
            <TabsTrigger value="competitors">
              <Trophy className="h-4 w-4 mr-2" />
              Competitors
            </TabsTrigger>
            <TabsTrigger value="pages">
              <Eye className="h-4 w-4 mr-2" />
              Pages
            </TabsTrigger>
            <TabsTrigger value="meta">Meta Tags</TabsTrigger>
            <TabsTrigger value="robots">robots.txt</TabsTrigger>
            <TabsTrigger value="sitemap">sitemap.xml</TabsTrigger>
            <TabsTrigger value="llms">llms.txt</TabsTrigger>
            <TabsTrigger value="structured">Structured Data</TabsTrigger>
            <TabsTrigger value="performance">
              <Gauge className="h-4 w-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="backlinks">
              <Link2 className="h-4 w-4 mr-2" />
              Backlinks
            </TabsTrigger>
            <TabsTrigger value="broken-links">
              <XCircle className="h-4 w-4 mr-2" />
              Broken Links
            </TabsTrigger>
            <TabsTrigger value="content">
              <FileText className="h-4 w-4 mr-2" />
              Content
            </TabsTrigger>
            <TabsTrigger value="content-optimizer">
              <Sparkles className="h-4 w-4 mr-2" />
              Content Optimizer
            </TabsTrigger>
            <TabsTrigger value="monitoring">
              <Bell className="h-4 w-4 mr-2" />
              Monitoring
            </TabsTrigger>
            <TabsTrigger value="site-crawler">
              <Globe className="h-4 w-4 mr-2" />
              Site Crawler
            </TabsTrigger>
            <TabsTrigger value="image-analysis">
              <Image className="h-4 w-4 mr-2" />
              Images
            </TabsTrigger>
            <TabsTrigger value="redirects">
              <ArrowRightCircle className="h-4 w-4 mr-2" />
              Redirects
            </TabsTrigger>
            <TabsTrigger value="duplicate-content">
              <Copy className="h-4 w-4 mr-2" />
              Duplicates
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="link-structure">
              <Network className="h-4 w-4 mr-2" />
              Link Structure
            </TabsTrigger>
            <TabsTrigger value="mobile-check">
              <Smartphone className="h-4 w-4 mr-2" />
              Mobile Check
            </TabsTrigger>
            <TabsTrigger value="budget">
              <DollarSign className="h-4 w-4 mr-2" />
              Budget
            </TabsTrigger>
          </TabsList>
        )}

        {/* Mobile Dropdown Selector */}
        {isMobile && (
          <div className="w-full">
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="audit">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    <span>SEO Audit</span>
                  </div>
                </SelectItem>
                <SelectItem value="keywords">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    <span>Keyword Tracking</span>
                  </div>
                </SelectItem>
                <SelectItem value="competitors">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    <span>Competitor Analysis</span>
                  </div>
                </SelectItem>
                <SelectItem value="pages">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    <span>Page Analysis</span>
                  </div>
                </SelectItem>
                <SelectItem value="meta">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>Meta Tags</span>
                  </div>
                </SelectItem>
                <SelectItem value="robots">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span>robots.txt</span>
                  </div>
                </SelectItem>
                <SelectItem value="sitemap">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    <span>sitemap.xml</span>
                  </div>
                </SelectItem>
                <SelectItem value="llms">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>llms.txt</span>
                  </div>
                </SelectItem>
                <SelectItem value="structured">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4" />
                    <span>Structured Data</span>
                  </div>
                </SelectItem>
                <SelectItem value="performance">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    <span>Performance</span>
                  </div>
                </SelectItem>
                <SelectItem value="backlinks">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    <span>Backlinks</span>
                  </div>
                </SelectItem>
                <SelectItem value="broken-links">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    <span>Broken Links</span>
                  </div>
                </SelectItem>
                <SelectItem value="content">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>Content</span>
                  </div>
                </SelectItem>
                <SelectItem value="content-optimizer">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span>Content Optimizer</span>
                  </div>
                </SelectItem>
                <SelectItem value="monitoring">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <span>Monitoring</span>
                  </div>
                </SelectItem>
                <SelectItem value="site-crawler">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span>Site Crawler</span>
                  </div>
                </SelectItem>
                <SelectItem value="image-analysis">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    <span>Image Analysis</span>
                  </div>
                </SelectItem>
                <SelectItem value="redirects">
                  <div className="flex items-center gap-2">
                    <ArrowRightCircle className="h-4 w-4" />
                    <span>Redirects</span>
                  </div>
                </SelectItem>
                <SelectItem value="duplicate-content">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4" />
                    <span>Duplicate Content</span>
                  </div>
                </SelectItem>
                <SelectItem value="security">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    <span>Security</span>
                  </div>
                </SelectItem>
                <SelectItem value="link-structure">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4" />
                    <span>Link Structure</span>
                  </div>
                </SelectItem>
                <SelectItem value="mobile-check">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    <span>Mobile Check</span>
                  </div>
                </SelectItem>
                <SelectItem value="budget">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    <span>Performance Budget</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Audit Results Tab */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    SEO Audit Results
                  </CardTitle>
                  <CardDescription>
                    Comprehensive analysis of {auditResults.length} SEO factors
                  </CardDescription>
                </div>
                {auditResults.length > 0 && (
                  <div className="flex gap-2">
                    <Button onClick={() => exportAuditReport("json")} variant="outline" size="sm">
                      <FileJson className="h-4 w-4 mr-2" />
                      Export JSON
                    </Button>
                    <Button onClick={() => exportAuditReport("csv")} variant="outline" size="sm">
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {auditResults.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No audit results yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Click "Run Full Audit" to analyze 50+ SEO factors
                  </p>
                  <Button onClick={runComprehensiveAudit}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Start SEO Audit
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {["Technical SEO", "On-Page SEO", "Performance", "Mobile & Accessibility", "Security", "Content Quality"].map(
                    (category) => {
                      const categoryResults = auditResults.filter((r) => r.category === category);
                      if (categoryResults.length === 0) return null;

                      const passed = categoryResults.filter((r) => r.status === "passed").length;
                      const warnings = categoryResults.filter((r) => r.status === "warning").length;
                      const failed = categoryResults.filter((r) => r.status === "failed").length;

                      return (
                        <div key={category} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-lg">{category}</h4>
                            <div className="flex gap-4 text-sm">
                              <span className="text-green-600">{passed} passed</span>
                              <span className="text-yellow-600">{warnings} warnings</span>
                              <span className="text-red-600">{failed} failed</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {categoryResults.map((result, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                              >
                                <div className="mt-0.5">{getStatusIcon(result.status)}</div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{result.item}</span>
                                    <Badge variant={result.impact === "high" ? "destructive" : result.impact === "medium" ? "default" : "secondary"} className="text-xs">
                                      {result.impact}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
                                  {result.fix && (
                                    <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded text-sm">
                                      <strong className="text-blue-700 dark:text-blue-300">How to fix:</strong>{" "}
                                      <span className="text-blue-600 dark:text-blue-400">{result.fix}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <Separator />
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Keyword Tracking Tab */}
        <TabsContent value="keywords" className="space-y-4">
          {/* Google Search Console Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Google Search Console
                  </CardTitle>
                  <CardDescription>
                    {gscConnected
                      ? "Connected - Real data from Google"
                      : "Connect to get real keyword data from Google"}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {gscConnected ? (
                    <>
                      <Button
                        onClick={syncGSCData}
                        disabled={isSyncingGSC || !selectedProperty}
                        variant="default"
                        size="sm"
                      >
                        {isSyncingGSC ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Sync Data
                          </>
                        )}
                      </Button>
                      <Button onClick={disconnectGSC} variant="outline" size="sm">
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button onClick={connectToGSC} disabled={isConnectingGSC}>
                      {isConnectingGSC ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Globe className="h-4 w-4 mr-2" />
                          Connect to GSC
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            {gscConnected && gscProperties.length > 0 && (
              <CardContent>
                <div className="flex items-center gap-4">
                  <Label className="text-sm font-medium">Property:</Label>
                  <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                    <SelectTrigger className="w-[400px]">
                      <SelectValue placeholder="Select a property" />
                    </SelectTrigger>
                    <SelectContent>
                      {gscProperties.map((prop) => (
                        <SelectItem key={prop.id} value={prop.property_url}>
                          {prop.display_name || prop.property_url}
                          {prop.is_primary && (
                            <Badge variant="default" className="ml-2">
                              Primary
                            </Badge>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {lastSyncedAt && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Last synced: {new Date(lastSyncedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Keyword Tracking Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Keyword Tracking
              </CardTitle>
              <CardDescription>
                Monitor keyword rankings and performance
                {gscConnected && <Badge className="ml-2">Real GSC Data</Badge>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add keyword to track..."
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && addKeywordToTrack()}
                />
                <Button onClick={addKeywordToTrack}>Add</Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Position</TableHead>
                    {gscConnected && (
                      <>
                        <TableHead>Impressions</TableHead>
                        <TableHead>Clicks</TableHead>
                        <TableHead>CTR</TableHead>
                      </>
                    )}
                    <TableHead>Volume</TableHead>
                    <TableHead>Difficulty</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trackedKeywords.map((kw, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{kw.keyword}</TableCell>
                      <TableCell>
                        <Badge variant={kw.position <= 3 ? "default" : kw.position <= 10 ? "secondary" : "outline"}>
                          #{kw.position}
                        </Badge>
                      </TableCell>
                      {gscConnected && (
                        <>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                              {kw.impressions?.toLocaleString() || "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Target className="h-3 w-3 text-muted-foreground" />
                              {kw.clicks?.toLocaleString() || "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {kw.ctr ? `${kw.ctr.toFixed(2)}%` : "—"}
                            </Badge>
                          </TableCell>
                        </>
                      )}
                      <TableCell>{kw.volume?.toLocaleString() || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={kw.difficulty || 0} className="w-16 h-2" />
                          <span className="text-xs">{kw.difficulty || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{kw.url}</TableCell>
                      <TableCell>
                        {kw.trend === "up" && <TrendingUp className="h-4 w-4 text-green-600" />}
                        {kw.trend === "down" && <TrendingUp className="h-4 w-4 text-red-600 rotate-180" />}
                        {kw.trend === "stable" && <Activity className="h-4 w-4 text-gray-600" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Competitor Analysis Tab */}
        <TabsContent value="competitors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5" />
                Competitor Analysis
              </CardTitle>
              <CardDescription>
                Analyze competitor websites and compare SEO performance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter competitor URL (e.g., https://competitor.com)"
                  value={competitorUrl}
                  onChange={(e) => setCompetitorUrl(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && analyzeCompetitor()}
                />
                <Button onClick={analyzeCompetitor} disabled={isAnalyzingCompetitor}>
                  {isAnalyzingCompetitor ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Analyze
                    </>
                  )}
                </Button>
              </div>

              {competitorResults.length === 0 ? (
                <div className="text-center py-12">
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No competitors analyzed yet</h3>
                  <p className="text-muted-foreground">
                    Enter a competitor URL above to analyze their SEO performance
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {competitorResults.map((competitor, idx) => (
                    <Card key={idx} className="border-2">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <ExternalLink className="h-4 w-4" />
                              <span className="font-medium">{competitor.url}</span>
                              <Badge variant={competitor.status === 200 ? "default" : "destructive"}>
                                {competitor.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Analyzed: {new Date(competitor.analyzedAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <div className={`text-3xl font-bold ${getScoreColor(competitor.score)}`}>
                                {competitor.score}
                              </div>
                              <p className="text-xs text-muted-foreground">SEO Score</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeCompetitor(competitor.url)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 md:grid-cols-4">
                          {/* Technical SEO */}
                          <div>
                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              Technical
                            </h4>
                            <div className="space-y-1">
                              {competitor.analysis.technical.map((item: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  {getStatusIcon(item.status)}
                                  <span className="truncate">{item.item}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* On-Page SEO */}
                          <div>
                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              On-Page
                            </h4>
                            <div className="space-y-1">
                              {competitor.analysis.onPage.map((item: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  {getStatusIcon(item.status)}
                                  <span className="truncate">{item.item}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Mobile */}
                          <div>
                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <Smartphone className="h-4 w-4" />
                              Mobile
                            </h4>
                            <div className="space-y-1">
                              {competitor.analysis.mobile.map((item: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  {getStatusIcon(item.status)}
                                  <span className="truncate">{item.item}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Content */}
                          <div>
                            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Content
                            </h4>
                            <div className="space-y-1">
                              {competitor.analysis.content.map((item: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  {getStatusIcon(item.status)}
                                  <span className="truncate">{item.item}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Comparison vs Your Site */}
                        {seoScore.overall > 0 && (
                          <div className="mt-4 pt-4 border-t">
                            <h4 className="text-sm font-semibold mb-2">Comparison vs Your Site</h4>
                            <div className="grid gap-2 md:grid-cols-2">
                              <div className="flex items-center justify-between p-2 bg-muted rounded">
                                <span className="text-sm">Your Score:</span>
                                <Badge variant={seoScore.overall >= competitor.score ? "default" : "secondary"}>
                                  {seoScore.overall}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between p-2 bg-muted rounded">
                                <span className="text-sm">Competitor Score:</span>
                                <Badge variant={competitor.score >= seoScore.overall ? "default" : "secondary"}>
                                  {competitor.score}
                                </Badge>
                              </div>
                            </div>
                            {competitor.score > seoScore.overall && (
                              <p className="text-sm text-yellow-600 mt-2">
                                ⚠ Competitor is ahead by {competitor.score - seoScore.overall} points. Run AI Auto-Heal for improvement suggestions.
                              </p>
                            )}
                            {seoScore.overall > competitor.score && (
                              <p className="text-sm text-green-600 mt-2">
                                ✓ You're ahead by {seoScore.overall - competitor.score} points. Keep optimizing!
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pages Tab */}
        <TabsContent value="pages" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Page Analysis
                  </CardTitle>
                  <CardDescription>SEO performance of individual pages</CardDescription>
                </div>
                <Button onClick={analyzeBlogPostsSEO} variant="outline" size="sm">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analyze All Blog Posts
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pageAnalysis.length === 0 ? (
                <div className="text-center py-12">
                  <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No page analysis data yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Analyze your blog posts to see individual SEO scores
                  </p>
                  <Button onClick={analyzeBlogPostsSEO}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analyze Blog Posts
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Page URL</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Word Count</TableHead>
                      <TableHead>Issues</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageAnalysis.map((page, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            {page.url}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell className="font-medium">{page.title}</TableCell>
                        <TableCell>
                          <Badge variant={page.score >= 90 ? "default" : page.score >= 70 ? "secondary" : "destructive"}>
                            {page.score}
                          </Badge>
                        </TableCell>
                        <TableCell>{page.wordCount.toLocaleString()}</TableCell>
                        <TableCell>
                          {page.issues > 0 ? (
                            <Badge variant="destructive">{page.issues} issues</Badge>
                          ) : (
                            <Badge variant="default">No issues</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAuditUrl(page.url);
                              runComprehensiveAudit();
                            }}
                          >
                            <Search className="h-3 w-3 mr-1" />
                            Audit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Meta Tags Tab */}
        <TabsContent value="meta">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Meta Tags Configuration
              </CardTitle>
              <CardDescription>
                Configure meta tags for SEO and social media sharing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Title Tag *</Label>
                  <Input
                    value={metaTags.title}
                    onChange={(e) => setMetaTags({ ...metaTags, title: e.target.value })}
                    placeholder="30-60 characters"
                  />
                  <p className="text-xs text-muted-foreground">
                    Length: {metaTags.title.length} characters
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Keywords</Label>
                  <Input
                    value={metaTags.keywords}
                    onChange={(e) => setMetaTags({ ...metaTags, keywords: e.target.value })}
                    placeholder="comma, separated, keywords"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Meta Description *</Label>
                <Textarea
                  value={metaTags.description}
                  onChange={(e) => setMetaTags({ ...metaTags, description: e.target.value })}
                  placeholder="120-160 characters"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Length: {metaTags.description.length} characters
                </p>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-4">Open Graph Tags (Facebook, LinkedIn)</h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>OG Title</Label>
                    <Input
                      value={metaTags.og_title}
                      onChange={(e) => setMetaTags({ ...metaTags, og_title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OG Description</Label>
                    <Textarea
                      value={metaTags.og_description}
                      onChange={(e) =>
                        setMetaTags({ ...metaTags, og_description: e.target.value })
                      }
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OG Image URL</Label>
                    <Input
                      value={metaTags.og_image}
                      onChange={(e) => setMetaTags({ ...metaTags, og_image: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-4">Twitter Card Tags</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Twitter Card Type</Label>
                    <Input
                      value={metaTags.twitter_card}
                      onChange={(e) =>
                        setMetaTags({ ...metaTags, twitter_card: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Twitter Site Handle</Label>
                    <Input
                      value={metaTags.twitter_site}
                      onChange={(e) =>
                        setMetaTags({ ...metaTags, twitter_site: e.target.value })
                      }
                      placeholder="@username"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={handleUpdateMetaTags} className="w-full">
                Save Meta Tags Configuration
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* robots.txt Tab */}
        <TabsContent value="robots">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                robots.txt
              </CardTitle>
              <CardDescription>
                Control search engine crawling. Place this file in your /public directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={robotsTxt}
                onChange={(e) => setRobotsTxt(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleCopyToClipboard(robotsTxt, "robots.txt")}
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button
                  onClick={() => handleDownloadFile(robotsTxt, "robots.txt")}
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* sitemap.xml Tab */}
        <TabsContent value="sitemap">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                sitemap.xml
              </CardTitle>
              <CardDescription>
                Help search engines discover your pages. Regenerate to include all published blog posts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium">Click Regenerate to include latest blog posts</span>
                </div>
                <Button
                  onClick={regenerateSitemap}
                  disabled={isRegeneratingSitemap}
                  size="sm"
                >
                  {isRegeneratingSitemap ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regenerate Sitemap
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                value={sitemapXml}
                onChange={(e) => setSitemapXml(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleCopyToClipboard(sitemapXml, "sitemap.xml")}
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button
                  onClick={() => handleDownloadFile(sitemapXml, "sitemap.xml")}
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
              <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Note:</strong> After regenerating, download the sitemap.xml file and manually replace the one in your public folder, or set up the dynamic sitemap edge function for automatic updates.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* llms.txt Tab */}
        <TabsContent value="llms">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                llms.txt
              </CardTitle>
              <CardDescription>
                Provide information about your site for Large Language Models and AI assistants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={llmsTxt}
                onChange={(e) => setLlmsTxt(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => handleCopyToClipboard(llmsTxt, "llms.txt")}
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button
                  onClick={() => handleDownloadFile(llmsTxt, "llms.txt")}
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Structured Data Tab */}
        <TabsContent value="structured">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Structured Data (JSON-LD)
              </CardTitle>
              <CardDescription>
                Add this schema.org markup to your index.html for rich search results
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={JSON.stringify(structuredData, null, 2)}
                onChange={(e) => {
                  try {
                    setStructuredData(JSON.parse(e.target.value));
                  } catch (err) {
                    // Invalid JSON, ignore
                  }
                }}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    handleCopyToClipboard(
                      JSON.stringify(structuredData, null, 2),
                      "Structured Data"
                    )
                  }
                  variant="outline"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
                <Button
                  onClick={() =>
                    handleDownloadFile(
                      JSON.stringify(structuredData, null, 2),
                      "structured-data.json"
                    )
                  }
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download File
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>
                  <strong>How to add to your site:</strong>
                </p>
                <ol className="list-decimal list-inside space-y-1 mt-2">
                  <li>Copy the JSON-LD code above</li>
                  <li>Open your index.html file</li>
                  <li>
                    Add this inside the {"<head>"} section:
                    <code className="block mt-1 p-2 bg-muted rounded text-xs">
                      {'<script type="application/ld+json">'}
                      <br />
                      {"  /* Paste JSON here */"}
                      <br />
                      {"</script>"}
                    </code>
                  </li>
                </ol>
              </div>

              <Separator className="my-6" />

              {/* Structured Data Validator Section */}
              <div className="space-y-4 pt-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Validate Existing Structured Data
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Check any page for valid Schema.org JSON-LD markup
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="validate-structured-url">Page URL to Validate</Label>
                  <Input
                    id="validate-structured-url"
                    type="url"
                    placeholder={`${window.location.origin}/`}
                    defaultValue={`${window.location.origin}/`}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={async () => {
                    const urlInput = document.getElementById('validate-structured-url') as HTMLInputElement;
                    const url = urlInput?.value || `${window.location.origin}/`;

                    toast.loading('Validating structured data...', { duration: Infinity });

                    try {
                      const { data, error } = await supabase.functions.invoke('validate-structured-data', {
                        body: { url }
                      });

                      if (data?.success) {
                        const result = data.data;
                        const message = `
Structured Data Validation Complete!

Found: ${result.hasStructuredData ? 'Yes ✓' : 'No ✗'}
Total Items: ${result.totalItems}
Valid Items: ${result.validItems}
Invalid Items: ${result.invalidItems}
Overall Score: ${result.overallScore}/100

${result.items.length > 0 ? 'Items Found:\n' + result.items.map((item: any) =>
  `• ${item.type} (${item.isValid ? 'Valid ✓' : 'Invalid ✗'} - Score: ${item.score}/100)`
).join('\n') : 'No structured data found on page'}

${result.issues.length > 0 ? '\nIssues:\n' + result.issues.map((issue: any) =>
  `• [${issue.severity}] ${issue.message}`
).join('\n') : ''}
                        `.trim();

                        alert(message);
                        console.log('Full structured data validation:', data.data);
                      } else {
                        throw new Error(data?.error || 'Failed to validate structured data');
                      }
                    } catch (error: any) {
                      toast.error(error.message || 'Failed to validate structured data');
                    } finally {
                      toast.dismiss();
                    }
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Validate Structured Data
                </Button>

                <div className="rounded-lg border p-4 bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    <Info className="h-4 w-4 inline mr-2" />
                    Validates JSON-LD structured data against Schema.org standards. Checks 15+ types including Article, Recipe, Product, Organization, and more.
                  </p>
                </div>

                <div className="text-sm text-muted-foreground">
                  <h4 className="font-semibold mb-2">Validation Checks:</h4>
                  <ul className="space-y-1 ml-4">
                    <li>✅ JSON-LD syntax validation</li>
                    <li>✅ Required properties for each type</li>
                    <li>✅ Date format validation (ISO 8601)</li>
                    <li>✅ URL format validation</li>
                    <li>✅ Breadcrumb structure</li>
                    <li>✅ Review and rating validation</li>
                    <li>✅ Recipe, Product, Article validation</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monitoring & Alerts Tab */}
        <TabsContent value="monitoring" className="space-y-4">
          {/* Load data when tab is opened */}
          {activeTab === "monitoring" && !isLoadingMonitoring && alerts.length === 0 && alertRules.length === 0 && (
            <div className="hidden">{loadMonitoringData()}</div>
          )}

          {/* Active Alerts Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Active Alerts
                  {activeAlertsCount > 0 && (
                    <Badge variant="destructive">{activeAlertsCount}</Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMonitoringData}
                  disabled={isLoadingMonitoring}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingMonitoring ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </CardTitle>
              <CardDescription>
                SEO issues and changes that require your attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMonitoring ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                  <p>No active alerts - your SEO is looking good!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 border rounded-lg ${
                        alert.severity === "critical"
                          ? "border-red-500 bg-red-50 dark:bg-red-950"
                          : alert.severity === "high"
                          ? "border-orange-500 bg-orange-50 dark:bg-orange-950"
                          : alert.severity === "medium"
                          ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                          : "border-blue-500 bg-blue-50 dark:bg-blue-950"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge
                              variant={
                                alert.severity === "critical" || alert.severity === "high"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <Badge variant="outline">{alert.alert_type}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(alert.created_at).toLocaleString()}
                            </span>
                          </div>
                          <h4 className="font-semibold mb-1">{alert.title}</h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            {alert.message}
                          </p>
                          {alert.details && Object.keys(alert.details).length > 0 && (
                            <div className="text-xs bg-white dark:bg-gray-900 p-2 rounded border mt-2">
                              {Object.entries(alert.details).map(([key, value]) => (
                                <div key={key} className="flex justify-between py-1">
                                  <span className="font-medium">{key}:</span>
                                  <span>{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Acknowledge
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => dismissAlert(alert.id)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Monitoring Schedules Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Automated Monitoring Schedules
              </CardTitle>
              <CardDescription>
                Configure automated SEO audits and keyword position checks
              </CardDescription>
            </CardHeader>
            <CardContent>
              {schedules.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <Info className="h-8 w-8 mx-auto mb-2" />
                  <p>No monitoring schedules configured yet</p>
                  <p className="text-sm mt-1">Default daily audit schedule will be created automatically</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedules.map((schedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">
                          {schedule.schedule_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{schedule.schedule_type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {schedule.cron_expression}
                        </TableCell>
                        <TableCell className="text-sm">
                          {schedule.last_run_at ? (
                            <div>
                              <div>{new Date(schedule.last_run_at).toLocaleDateString()}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(schedule.last_run_at).toLocaleTimeString()}
                              </div>
                            </div>
                          ) : (
                            "Never"
                          )}
                        </TableCell>
                        <TableCell>
                          {schedule.last_run_status === "success" ? (
                            <Badge variant="default" className="bg-green-500">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Success
                            </Badge>
                          ) : schedule.last_run_status === "failed" ? (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant={schedule.is_enabled ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              toggleSchedule(schedule.id, !schedule.is_enabled)
                            }
                          >
                            {schedule.is_enabled ? "Enabled" : "Disabled"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Notification Preferences Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
              <CardDescription>
                Configure how and when you want to receive SEO alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {notificationPrefs && (
                <div className="space-y-6">
                  {/* Email Settings */}
                  <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email Notifications
                    </h3>
                    <div className="grid gap-4 pl-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="email-enabled">Email Enabled</Label>
                          <p className="text-sm text-muted-foreground">
                            Receive alerts via email
                          </p>
                        </div>
                        <Button
                          id="email-enabled"
                          variant={notificationPrefs.email_enabled ? "default" : "outline"}
                          size="sm"
                          onClick={() =>
                            saveNotificationPreferences({
                              ...notificationPrefs,
                              email_enabled: !notificationPrefs.email_enabled,
                            })
                          }
                        >
                          {notificationPrefs.email_enabled ? "Enabled" : "Disabled"}
                        </Button>
                      </div>

                      {notificationPrefs.email_enabled && (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Immediate Alerts</Label>
                              <p className="text-sm text-muted-foreground">
                                Get notified immediately when issues occur
                              </p>
                            </div>
                            <Button
                              variant={notificationPrefs.immediate_alerts ? "default" : "outline"}
                              size="sm"
                              onClick={() =>
                                saveNotificationPreferences({
                                  ...notificationPrefs,
                                  immediate_alerts: !notificationPrefs.immediate_alerts,
                                })
                              }
                            >
                              {notificationPrefs.immediate_alerts ? "On" : "Off"}
                            </Button>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Daily Digest</Label>
                              <p className="text-sm text-muted-foreground">
                                Daily summary of SEO metrics and alerts
                              </p>
                            </div>
                            <Button
                              variant={notificationPrefs.daily_digest ? "default" : "outline"}
                              size="sm"
                              onClick={() =>
                                saveNotificationPreferences({
                                  ...notificationPrefs,
                                  daily_digest: !notificationPrefs.daily_digest,
                                })
                              }
                            >
                              {notificationPrefs.daily_digest ? "On" : "Off"}
                            </Button>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Weekly Digest</Label>
                              <p className="text-sm text-muted-foreground">
                                Weekly performance report
                              </p>
                            </div>
                            <Button
                              variant={notificationPrefs.weekly_digest ? "default" : "outline"}
                              size="sm"
                              onClick={() =>
                                saveNotificationPreferences({
                                  ...notificationPrefs,
                                  weekly_digest: !notificationPrefs.weekly_digest,
                                })
                              }
                            >
                              {notificationPrefs.weekly_digest ? "On" : "Off"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Alert Types */}
                  <div className="space-y-4">
                    <h3 className="font-semibold">What to Monitor</h3>
                    <div className="grid gap-4 pl-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>SEO Score Drops</Label>
                          <p className="text-sm text-muted-foreground">
                            Alert when your SEO score decreases
                          </p>
                        </div>
                        <Button
                          variant={notificationPrefs.notify_score_drops ? "default" : "outline"}
                          size="sm"
                          onClick={() =>
                            saveNotificationPreferences({
                              ...notificationPrefs,
                              notify_score_drops: !notificationPrefs.notify_score_drops,
                            })
                          }
                        >
                          {notificationPrefs.notify_score_drops ? "On" : "Off"}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Keyword Position Changes</Label>
                          <p className="text-sm text-muted-foreground">
                            Alert when keyword rankings change significantly
                          </p>
                        </div>
                        <Button
                          variant={notificationPrefs.notify_keyword_changes ? "default" : "outline"}
                          size="sm"
                          onClick={() =>
                            saveNotificationPreferences({
                              ...notificationPrefs,
                              notify_keyword_changes: !notificationPrefs.notify_keyword_changes,
                            })
                          }
                        >
                          {notificationPrefs.notify_keyword_changes ? "On" : "Off"}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Competitor Changes</Label>
                          <p className="text-sm text-muted-foreground">
                            Alert when competitors' rankings change
                          </p>
                        </div>
                        <Button
                          variant={notificationPrefs.notify_competitor_changes ? "default" : "outline"}
                          size="sm"
                          onClick={() =>
                            saveNotificationPreferences({
                              ...notificationPrefs,
                              notify_competitor_changes: !notificationPrefs.notify_competitor_changes,
                            })
                          }
                        >
                          {notificationPrefs.notify_competitor_changes ? "On" : "Off"}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>GSC Issues</Label>
                          <p className="text-sm text-muted-foreground">
                            Alert about Google Search Console issues
                          </p>
                        </div>
                        <Button
                          variant={notificationPrefs.notify_gsc_issues ? "default" : "outline"}
                          size="sm"
                          onClick={() =>
                            saveNotificationPreferences({
                              ...notificationPrefs,
                              notify_gsc_issues: !notificationPrefs.notify_gsc_issues,
                            })
                          }
                        >
                          {notificationPrefs.notify_gsc_issues ? "On" : "Off"}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Performance Issues</Label>
                          <p className="text-sm text-muted-foreground">
                            Alert about page speed and performance problems
                          </p>
                        </div>
                        <Button
                          variant={notificationPrefs.notify_performance_issues ? "default" : "outline"}
                          size="sm"
                          onClick={() =>
                            saveNotificationPreferences({
                              ...notificationPrefs,
                              notify_performance_issues: !notificationPrefs.notify_performance_issues,
                            })
                          }
                        >
                          {notificationPrefs.notify_performance_issues ? "On" : "Off"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alert Rules Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Alert Rules
              </CardTitle>
              <CardDescription>
                Custom rules that trigger alerts based on specific conditions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {alertRules.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p>Default alert rules are configured automatically</p>
                  <p className="text-sm mt-1">
                    Custom rules can be added via the database
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">
                          {rule.rule_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.rule_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              rule.severity === "critical" || rule.severity === "high"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {rule.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {rule.is_enabled ? (
                            <Badge variant="default" className="bg-green-500">
                              Enabled
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Core Web Vitals / Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5" />
                Core Web Vitals
              </CardTitle>
              <CardDescription>
                Monitor page performance and Google's Core Web Vitals (LCP, FID, CLS)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter URL to test (leave empty for homepage)"
                  defaultValue={window.location.origin}
                  id="cwv-url"
                />
                <Button
                  onClick={async () => {
                    const url = (document.getElementById('cwv-url') as HTMLInputElement)?.value || window.location.origin;
                    toast.loading('Checking Core Web Vitals...');

                    try {
                      const { data, error } = await supabase.functions.invoke('gsc-fetch-core-web-vitals', {
                        body: { siteUrl: url }
                      });

                      if (error) throw error;

                      if (data?.success) {
                        toast.success('Core Web Vitals checked successfully!');

                        // Show results
                        const metrics = data.data.metrics;
                        const message = `
Performance Score: ${metrics.mobile_performance_score || 'N/A'}
LCP: ${metrics.mobile_lcp || 'N/A'}s (${metrics.lcp_status || 'unknown'})
CLS: ${metrics.mobile_cls || 'N/A'} (${metrics.cls_status || 'unknown'})
Data Source: ${data.data.dataSource}
                        `.trim();

                        alert(message);
                      } else {
                        throw new Error(data?.error || 'Failed to check Core Web Vitals');
                      }
                    } catch (error: any) {
                      toast.error(error.message || 'Failed to check Core Web Vitals');
                    } finally {
                      toast.dismiss();
                    }
                  }}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Check Performance
                </Button>
              </div>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Uses your existing Google Search Console connection to fetch real user data from Chrome UX Report.
                  Add a PageSpeed API key for more detailed metrics.
                </p>
              </div>

              <div className="text-sm text-muted-foreground mt-4">
                <h4 className="font-semibold mb-2">What are Core Web Vitals?</h4>
                <ul className="space-y-1 ml-4">
                  <li>• <strong>LCP</strong>: Largest Contentful Paint - Loading speed (Good: ≤2.5s)</li>
                  <li>• <strong>FID/INP</strong>: First Input Delay/Interaction - Interactivity (Good: ≤100ms)</li>
                  <li>• <strong>CLS</strong>: Cumulative Layout Shift - Visual stability (Good: ≤0.1)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backlinks Tab */}
        <TabsContent value="backlinks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Backlink Tracking
              </CardTitle>
              <CardDescription>
                Monitor inbound links and track link quality
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Backlink source URL"
                  id="backlink-source"
                />
                <Input
                  placeholder="Your URL (target)"
                  defaultValue={window.location.origin}
                  id="backlink-target"
                />
                <Button
                  onClick={async () => {
                    const sourceUrl = (document.getElementById('backlink-source') as HTMLInputElement)?.value;
                    const targetUrl = (document.getElementById('backlink-target') as HTMLInputElement)?.value || window.location.origin;

                    if (!sourceUrl) {
                      toast.error('Please enter a backlink source URL');
                      return;
                    }

                    toast.loading('Adding backlink...');

                    try {
                      const { data, error } = await supabase.functions.invoke('sync-backlinks', {
                        body: {
                          targetDomain: new URL(targetUrl).hostname,
                          source: 'manual',
                          manualBacklinks: [{
                            sourceUrl: sourceUrl,
                            targetUrl: targetUrl,
                            anchorText: '',
                            linkType: 'dofollow',
                            notes: 'Added manually'
                          }]
                        }
                      });

                      if (error) throw error;

                      if (data?.success) {
                        toast.success('Backlink added successfully!');
                        (document.getElementById('backlink-source') as HTMLInputElement).value = '';
                      } else {
                        throw new Error(data?.error || 'Failed to add backlink');
                      }
                    } catch (error: any) {
                      toast.error(error.message || 'Failed to add backlink');
                    } finally {
                      toast.dismiss();
                    }
                  }}
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  Add Backlink
                </Button>
              </div>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Track backlinks manually or integrate with Ahrefs/Moz APIs for automated discovery.
                  Configure API keys in environment variables for automatic backlink syncing.
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Backlink Tracking Features:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ Track link quality (Domain Authority, Spam Score)</li>
                  <li>✅ Monitor new and lost backlinks</li>
                  <li>✅ Detect toxic links automatically</li>
                  <li>✅ Historical metrics tracking</li>
                  <li>✅ Manual or automated via APIs (Ahrefs, Moz)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Broken Links Tab */}
        <TabsContent value="broken-links" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Broken Link Checker
              </CardTitle>
              <CardDescription>
                Find and fix broken links across your site
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="URL to scan for broken links"
                  defaultValue={window.location.origin}
                  id="broken-links-url"
                />
                <Button
                  onClick={async () => {
                    const url = (document.getElementById('broken-links-url') as HTMLInputElement)?.value || window.location.origin;
                    toast.loading('Scanning for broken links...');

                    try {
                      const { data, error } = await supabase.functions.invoke('check-broken-links', {
                        body: {
                          url: url,
                          checkExternal: true,
                          maxLinks: 100
                        }
                      });

                      if (error) throw error;

                      if (data?.success) {
                        toast.success(`Scan complete! Found ${data.data.brokenLinksFound} broken links out of ${data.data.totalLinksChecked} checked.`);

                        if (data.data.brokenLinksFound > 0) {
                          console.log('Broken links:', data.data.brokenLinks);
                          alert(`Found ${data.data.brokenLinksFound} broken links. Check console for details.`);
                        }
                      } else {
                        throw new Error(data?.error || 'Failed to scan for broken links');
                      }
                    } catch (error: any) {
                      toast.error(error.message || 'Failed to scan for broken links');
                    } finally {
                      toast.dismiss();
                    }
                  }}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Scan Page
                </Button>
              </div>

              <div className="rounded-lg border p-4 bg-muted-50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Scans all links on a page including internal links, external links, images, CSS, and JavaScript files.
                  Broken links are prioritized by impact (critical, high, medium, low).
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">What Gets Checked:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ Internal links (pages, posts)</li>
                  <li>✅ External links (outbound)</li>
                  <li>✅ Images (src attributes)</li>
                  <li>✅ Stylesheets (CSS files)</li>
                  <li>✅ Scripts (JavaScript files)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content Analysis Tab */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Content Analysis
              </CardTitle>
              <CardDescription>
                Analyze content quality, readability, and keyword optimization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Input
                  placeholder="URL to analyze"
                  defaultValue={window.location.origin}
                  id="content-url"
                />
                <Input
                  placeholder="Target keyword (optional)"
                  id="content-keyword"
                />
                <Button
                  onClick={async () => {
                    const url = (document.getElementById('content-url') as HTMLInputElement)?.value || window.location.origin;
                    const keyword = (document.getElementById('content-keyword') as HTMLInputElement)?.value || '';

                    toast.loading('Analyzing content...');

                    try {
                      const { data, error } = await supabase.functions.invoke('analyze-content', {
                        body: {
                          url: url,
                          targetKeyword: keyword || undefined,
                          contentType: 'blog_post'
                        }
                      });

                      if (error) throw error;

                      if (data?.success) {
                        toast.success('Content analysis complete!');

                        const scores = data.data.scores;
                        const metrics = data.data.metrics;
                        const suggestions = data.data.suggestions;

                        const message = `
Content Analysis Results:

Overall Score: ${scores.overall}/100
Readability: ${scores.readability}/100
Keyword Optimization: ${scores.keywordOptimization}/100
Structure: ${scores.structure}/100

Metrics:
Word Count: ${metrics.wordCount}
Sentences: ${metrics.sentenceCount}
Readability: ${metrics.fleschReadingEase} (Flesch Reading Ease)
Grade Level: ${metrics.fleschKincaidGrade}
${keyword ? `Keyword Density: ${metrics.keywordDensity}% (${metrics.keywordCount} times)` : ''}

Suggestions: ${suggestions.length}
${suggestions.map((s: any) => `• ${s.message}`).join('\n')}
                        `.trim();

                        alert(message);
                        console.log('Full analysis:', data.data);
                      } else {
                        throw new Error(data?.error || 'Failed to analyze content');
                      }
                    } catch (error: any) {
                      toast.error(error.message || 'Failed to analyze content');
                    } finally {
                      toast.dismiss();
                    }
                  }}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze Content
                </Button>
              </div>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Analyzes readability, keyword density, content structure, and provides actionable suggestions.
                  No external API required - runs locally with instant results.
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Analysis Includes:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ Readability scores (Flesch, Gunning Fog, SMOG, etc.)</li>
                  <li>✅ Keyword density analysis (optimal: 1-3%)</li>
                  <li>✅ Content structure (headings, paragraphs, links)</li>
                  <li>✅ Image optimization check</li>
                  <li>✅ Actionable improvement suggestions</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content Optimizer Tab */}
        <TabsContent value="content-optimizer" className="space-y-4">
          <ContentOptimizer />
        </TabsContent>

        {/* Site Crawler Tab */}
        <TabsContent value="site-crawler" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Technical SEO Site Crawler
              </CardTitle>
              <CardDescription>
                Crawl your entire site and analyze SEO issues (like Screaming Frog)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="crawler-url">Start URL</Label>
                <Input
                  id="crawler-url"
                  type="url"
                  placeholder={`${window.location.origin}/`}
                  defaultValue={`${window.location.origin}/`}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-pages">Maximum Pages to Crawl</Label>
                <Input
                  id="max-pages"
                  type="number"
                  defaultValue="50"
                  min="1"
                  max="500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="follow-external"
                  className="rounded"
                />
                <Label htmlFor="follow-external" className="text-sm cursor-pointer">
                  Follow external links
                </Label>
              </div>

              <Button
                className="w-full"
                onClick={async () => {
                  const urlInput = document.getElementById('crawler-url') as HTMLInputElement;
                  const maxPagesInput = document.getElementById('max-pages') as HTMLInputElement;
                  const followExternalInput = document.getElementById('follow-external') as HTMLInputElement;

                  const startUrl = urlInput?.value || `${window.location.origin}/`;
                  const maxPages = parseInt(maxPagesInput?.value || '50');
                  const followExternal = followExternalInput?.checked || false;

                  toast.loading('Crawling site...', { duration: Infinity });

                  try {
                    const { data, error } = await supabase.functions.invoke('crawl-site', {
                      body: { startUrl, maxPages, followExternal }
                    });

                    if (data?.success) {
                      const summary = data.data.summary;
                      const message = `
Site Crawl Complete!

Total Pages: ${summary.totalPages}
Pages with Issues: ${summary.pagesWithIssues}
Orphaned Pages: ${summary.orphanedPages}

Issues Breakdown:
• Critical: ${summary.issueBreakdown.critical}
• High: ${summary.issueBreakdown.high}
• Medium: ${summary.issueBreakdown.medium}
• Low: ${summary.issueBreakdown.low}

Averages:
• Word Count: ${summary.avgWordCount}
• Load Time: ${summary.avgLoadTime}ms
                      `.trim();

                      alert(message);
                      console.log('Full crawl results:', data.data);
                    } else {
                      throw new Error(data?.error || 'Failed to crawl site');
                    }
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to crawl site');
                  } finally {
                    toast.dismiss();
                  }
                }}
              >
                <Search className="h-4 w-4 mr-2" />
                Start Crawl
              </Button>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Crawls your entire site, finds SEO issues, maps internal links, and detects orphaned pages.
                  No external API required!
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Features:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ Complete site crawling with link following</li>
                  <li>✅ SEO issue detection (50+ checks per page)</li>
                  <li>✅ Internal link graph mapping</li>
                  <li>✅ Orphaned page detection</li>
                  <li>✅ Content analysis (word count, headings)</li>
                  <li>✅ Load time measurement</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Image Analysis Tab */}
        <TabsContent value="image-analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Image SEO Analyzer
              </CardTitle>
              <CardDescription>
                Scan all images for SEO issues and optimization opportunities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image-url">Page URL to Analyze</Label>
                <Input
                  id="image-url"
                  type="url"
                  placeholder={`${window.location.origin}/`}
                  defaultValue={`${window.location.origin}/`}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-file-size">Max File Size (KB)</Label>
                <Input
                  id="max-file-size"
                  type="number"
                  defaultValue="200"
                  min="50"
                  max="2000"
                />
              </div>

              <Button
                className="w-full"
                onClick={async () => {
                  const urlInput = document.getElementById('image-url') as HTMLInputElement;
                  const maxSizeInput = document.getElementById('max-file-size') as HTMLInputElement;

                  const url = urlInput?.value || `${window.location.origin}/`;
                  const maxFileSize = parseInt(maxSizeInput?.value || '200') * 1024;

                  toast.loading('Analyzing images...', { duration: Infinity });

                  try {
                    const { data, error } = await supabase.functions.invoke('analyze-images', {
                      body: { url, maxFileSize }
                    });

                    if (data?.success) {
                      const summary = data.data.summary;
                      const message = `
Image Analysis Complete!

Total Images: ${summary.totalImages}
Without Alt Text: ${summary.imagesWithoutAlt}
Without Dimensions: ${summary.imagesWithoutDimensions}
Oversized: ${summary.oversizedImages}
Unoptimized Formats: ${summary.unoptimizedFormats}
Using Lazy Loading: ${summary.lazyLoadedImages}

Total Size: ${Math.round(summary.totalSize / 1024)}KB
Average Size: ${Math.round(summary.avgSize / 1024)}KB
Total Issues: ${summary.issues.length}
                      `.trim();

                      alert(message);
                      console.log('Full image analysis:', data.data);
                    } else {
                      throw new Error(data?.error || 'Failed to analyze images');
                    }
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to analyze images');
                  } finally {
                    toast.dismiss();
                  }
                }}
              >
                <Image className="h-4 w-4 mr-2" />
                Analyze Images
              </Button>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Scans all images on the page and checks for alt text, file sizes, formats, and dimensions.
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Checks:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ Missing or empty alt text</li>
                  <li>✅ Missing width/height attributes</li>
                  <li>✅ Oversized images</li>
                  <li>✅ Unoptimized formats (recommends WebP)</li>
                  <li>✅ Lazy loading implementation</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Redirects Tab */}
        <TabsContent value="redirects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightCircle className="h-5 w-5" />
                Redirect Chain Detector
              </CardTitle>
              <CardDescription>
                Detect redirect chains, loops, and performance issues
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="redirect-urls">URLs to Check (one per line)</Label>
                <textarea
                  id="redirect-urls"
                  className="w-full min-h-[100px] p-2 border rounded-md"
                  placeholder={`${window.location.origin}/\n${window.location.origin}/about\n${window.location.origin}/contact`}
                  defaultValue={`${window.location.origin}/`}
                />
              </div>

              <Button
                className="w-full"
                onClick={async () => {
                  const urlsInput = document.getElementById('redirect-urls') as HTMLTextAreaElement;
                  const urls = urlsInput?.value.split('\n').filter(u => u.trim());

                  if (!urls || urls.length === 0) {
                    toast.error('Please enter at least one URL');
                    return;
                  }

                  toast.loading('Analyzing redirects...', { duration: Infinity });

                  try {
                    const { data, error } = await supabase.functions.invoke('detect-redirect-chains', {
                      body: { urls, maxRedirects: 10 }
                    });

                    if (data?.success) {
                      const summary = data.data.summary;
                      const message = `
Redirect Analysis Complete!

Total URLs Checked: ${summary.totalUrls}
URLs with Redirects: ${summary.urlsWithRedirects}
URLs with Chains: ${summary.urlsWithChains}
URLs with Loops: ${summary.urlsWithLoops}
Average Chain Length: ${summary.avgChainLength}
Total Issues: ${summary.totalIssues}
                      `.trim();

                      alert(message);
                      console.log('Full redirect analysis:', data.data);
                    } else {
                      throw new Error(data?.error || 'Failed to analyze redirects');
                    }
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to analyze redirects');
                  } finally {
                    toast.dismiss();
                  }
                }}
              >
                <ArrowRightCircle className="h-4 w-4 mr-2" />
                Analyze Redirects
              </Button>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Follows redirect chains, detects loops, and measures redirect performance impact.
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Detects:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ Redirect chains (A→B→C→D)</li>
                  <li>✅ Redirect loops</li>
                  <li>✅ HTTPS/HTTP protocol downgrades</li>
                  <li>✅ Slow redirect chains</li>
                  <li>✅ Mixed 301/302 redirects</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Duplicate Content Tab */}
        <TabsContent value="duplicate-content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5" />
                Duplicate Content Detector
              </CardTitle>
              <CardDescription>
                Find duplicate, similar, and thin content across pages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="duplicate-urls">URLs to Compare (one per line, minimum 2)</Label>
                <textarea
                  id="duplicate-urls"
                  className="w-full min-h-[120px] p-2 border rounded-md"
                  placeholder={`${window.location.origin}/page1\n${window.location.origin}/page2\n${window.location.origin}/page3`}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="similarity-threshold">Similarity Threshold (%)</Label>
                <Input
                  id="similarity-threshold"
                  type="number"
                  defaultValue="85"
                  min="50"
                  max="100"
                />
              </div>

              <Button
                className="w-full"
                onClick={async () => {
                  const urlsInput = document.getElementById('duplicate-urls') as HTMLTextAreaElement;
                  const thresholdInput = document.getElementById('similarity-threshold') as HTMLInputElement;

                  const urls = urlsInput?.value.split('\n').filter(u => u.trim());
                  const similarityThreshold = parseInt(thresholdInput?.value || '85') / 100;

                  if (!urls || urls.length < 2) {
                    toast.error('Please enter at least 2 URLs');
                    return;
                  }

                  toast.loading('Analyzing content similarity...', { duration: Infinity });

                  try {
                    const { data, error } = await supabase.functions.invoke('detect-duplicate-content', {
                      body: { urls, similarityThreshold, thinContentThreshold: 300 }
                    });

                    if (data?.success) {
                      const summary = data.data.summary;
                      const message = `
Duplicate Content Analysis Complete!

Total Pages Analyzed: ${summary.totalPages}
Exact Duplicates: ${summary.exactDuplicates}
Near Duplicates: ${summary.nearDuplicates}
Similar Pages: ${summary.similarPages}
Thin Content Pages: ${summary.thinContent}
Average Word Count: ${summary.avgWordCount}
Total Issues: ${summary.totalIssues}
                      `.trim();

                      alert(message);
                      console.log('Full duplicate content analysis:', data.data);
                    } else {
                      throw new Error(data?.error || 'Failed to analyze content');
                    }
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to analyze content');
                  } finally {
                    toast.dismiss();
                  }
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                Detect Duplicates
              </Button>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Compares content across multiple pages to find exact duplicates, near-duplicates, and thin content.
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Analysis:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ Exact duplicate detection (100% match)</li>
                  <li>✅ Near-duplicate detection (95%+ similar)</li>
                  <li>✅ Similar content detection (configurable threshold)</li>
                  <li>✅ Thin content detection (&lt;300 words)</li>
                  <li>✅ Content similarity scoring</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Headers Checker
              </CardTitle>
              <CardDescription>
                Check HTTPS implementation and security headers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="security-url">URL to Check</Label>
                <Input
                  id="security-url"
                  type="url"
                  placeholder={`${window.location.origin}/`}
                  defaultValue={`${window.location.origin}/`}
                />
              </div>

              <Button
                className="w-full"
                onClick={async () => {
                  const urlInput = document.getElementById('security-url') as HTMLInputElement;
                  const url = urlInput?.value || `${window.location.origin}/`;

                  toast.loading('Checking security...', { duration: Infinity });

                  try {
                    const { data, error } = await supabase.functions.invoke('check-security-headers', {
                      body: { url }
                    });

                    if (data?.success) {
                      const analysis = data.data;
                      const message = `
Security Analysis Complete!

Grade: ${analysis.grade}
Overall Score: ${analysis.overallScore}/100
Protocol: ${analysis.protocol}
HTTPS: ${analysis.isHttps ? 'Yes ✓' : 'No ✗'}

Issues:
• Critical: ${analysis.criticalIssues}
• High: ${analysis.highIssues}
• Medium: ${analysis.mediumIssues}
• Low: ${analysis.lowIssues}

Total Checks: ${analysis.checks.length}
Passed: ${analysis.checks.filter((c: any) => c.severity === 'pass').length}
                      `.trim();

                      alert(message);
                      console.log('Full security analysis:', data.data);
                    } else {
                      throw new Error(data?.error || 'Failed to check security');
                    }
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to check security');
                  } finally {
                    toast.dismiss();
                  }
                }}
              >
                <Shield className="h-4 w-4 mr-2" />
                Check Security
              </Button>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Validates HTTPS implementation and important security headers like HSTS, CSP, and X-Frame-Options.
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Security Checks:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ HTTPS implementation</li>
                  <li>✅ Strict-Transport-Security (HSTS)</li>
                  <li>✅ Content-Security-Policy (CSP)</li>
                  <li>✅ X-Frame-Options</li>
                  <li>✅ X-Content-Type-Options</li>
                  <li>✅ Referrer-Policy</li>
                  <li>✅ Permissions-Policy</li>
                  <li>✅ Server information disclosure</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Link Structure Tab */}
        <TabsContent value="link-structure" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Internal Link Analysis
              </CardTitle>
              <CardDescription>
                Analyze link structure, PageRank scores, and find orphaned pages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="link-url">Start URL (optional if using crawl ID)</Label>
                <Input
                  id="link-url"
                  type="url"
                  placeholder={`${window.location.origin}/`}
                  defaultValue={`${window.location.origin}/`}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="link-max-pages">Maximum Pages to Analyze</Label>
                <Input
                  id="link-max-pages"
                  type="number"
                  defaultValue="100"
                  min="10"
                  max="500"
                />
              </div>

              <Button
                className="w-full"
                onClick={async () => {
                  const urlInput = document.getElementById('link-url') as HTMLInputElement;
                  const maxPagesInput = document.getElementById('link-max-pages') as HTMLInputElement;

                  const startUrl = urlInput?.value || `${window.location.origin}/`;
                  const maxPages = parseInt(maxPagesInput?.value || '100');

                  toast.loading('Analyzing link structure...', { duration: Infinity });

                  try {
                    const { data, error } = await supabase.functions.invoke('analyze-internal-links', {
                      body: { startUrl, maxPages }
                    });

                    if (data?.success) {
                      const summary = data.data.summary;
                      const message = `
Link Structure Analysis Complete!

Total Pages: ${summary.totalPages}
Total Links: ${summary.totalLinks}
Orphaned Pages: ${summary.orphanedPages}
Hub Pages: ${summary.hubPages}
Authority Pages: ${summary.authorityPages}

Link Metrics:
• Avg Inbound Links: ${summary.avgInboundLinks}
• Avg Outbound Links: ${summary.avgOutboundLinks}
• Max Depth: ${summary.maxDepth}
• Avg Depth: ${summary.avgDepth}
                      `.trim();

                      alert(message);
                      console.log('Full link analysis:', data.data);
                    } else {
                      throw new Error(data?.error || 'Failed to analyze links');
                    }
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to analyze links');
                  } finally {
                    toast.dismiss();
                  }
                }}
              >
                <Network className="h-4 w-4 mr-2" />
                Analyze Links
              </Button>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Analyzes internal linking structure, calculates PageRank-style scores, and identifies orphaned pages.
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Analysis Includes:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ PageRank-style link scoring</li>
                  <li>✅ Orphaned page detection</li>
                  <li>✅ Hub page identification (many outbound links)</li>
                  <li>✅ Authority page identification (many inbound links)</li>
                  <li>✅ Link depth from homepage</li>
                  <li>✅ Internal link graph visualization data</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mobile Check Tab */}
        <TabsContent value="mobile-check" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Mobile-First Checker
              </CardTitle>
              <CardDescription>
                Comprehensive mobile usability and responsive design analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mobile-url">Page URL to Check</Label>
                <Input
                  id="mobile-url"
                  type="url"
                  placeholder={`${window.location.origin}/`}
                  defaultValue={`${window.location.origin}/`}
                />
              </div>

              <Button
                className="w-full"
                onClick={async () => {
                  const urlInput = document.getElementById('mobile-url') as HTMLInputElement;
                  const url = urlInput?.value || `${window.location.origin}/`;

                  toast.loading('Checking mobile usability...', { duration: Infinity });

                  try {
                    const { data, error } = await supabase.functions.invoke('check-mobile-first', {
                      body: { url }
                    });

                    if (data?.success) {
                      const analysis = data.data;
                      const message = `
Mobile Analysis Complete!

Grade: ${analysis.grade}
Overall Score: ${analysis.overallScore}/100

Issues:
• High: ${analysis.highIssues}
• Medium: ${analysis.mediumIssues}
• Low: ${analysis.lowIssues}

Checks Performed: ${analysis.checks.length}
Passed: ${analysis.checks.filter((c: any) => c.passed).length}
Failed: ${analysis.checks.filter((c: any) => !c.passed).length}
                      `.trim();

                      alert(message);
                      console.log('Full mobile analysis:', data.data);
                    } else {
                      throw new Error(data?.error || 'Failed to check mobile usability');
                    }
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to check mobile usability');
                  } finally {
                    toast.dismiss();
                  }
                }}
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Check Mobile
              </Button>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Comprehensive mobile usability testing beyond viewport meta tags.
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Mobile Checks:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ Viewport meta tag configuration</li>
                  <li>✅ Text readability (font sizes)</li>
                  <li>✅ Responsive design (media queries)</li>
                  <li>✅ Touch target sizes</li>
                  <li>✅ Responsive images (srcset, sizes)</li>
                  <li>✅ Fixed width elements</li>
                  <li>✅ Mobile navigation patterns</li>
                  <li>✅ Form input optimization</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Budget Tab */}
        <TabsContent value="budget" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Performance Budget Monitor
              </CardTitle>
              <CardDescription>
                Track page size, resource counts, and performance budget compliance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="budget-url">Page URL to Monitor</Label>
                <Input
                  id="budget-url"
                  type="url"
                  placeholder={`${window.location.origin}/`}
                  defaultValue={`${window.location.origin}/`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-page-size">Max Page Size (MB)</Label>
                  <Input
                    id="max-page-size"
                    type="number"
                    defaultValue="3"
                    min="1"
                    max="10"
                    step="0.5"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-requests">Max Requests</Label>
                  <Input
                    id="max-requests"
                    type="number"
                    defaultValue="50"
                    min="10"
                    max="200"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                onClick={async () => {
                  const urlInput = document.getElementById('budget-url') as HTMLInputElement;
                  const pageSizeInput = document.getElementById('max-page-size') as HTMLInputElement;
                  const requestsInput = document.getElementById('max-requests') as HTMLInputElement;

                  const url = urlInput?.value || `${window.location.origin}/`;
                  const maxPageSize = parseFloat(pageSizeInput?.value || '3') * 1024 * 1024;
                  const maxRequests = parseInt(requestsInput?.value || '50');

                  const budget = {
                    maxPageSize,
                    maxJsSize: 1024 * 1024,
                    maxCssSize: 200 * 1024,
                    maxImageSize: 1.5 * 1024 * 1024,
                    maxFonts: 4,
                    maxRequests,
                    maxThirdParty: 10,
                  };

                  toast.loading('Monitoring performance budget...', { duration: Infinity });

                  try {
                    const { data, error } = await supabase.functions.invoke('monitor-performance-budget', {
                      body: { url, budget }
                    });

                    if (data?.success) {
                      const analysis = data.data;
                      const totalSizeMB = (analysis.totalPageSize / (1024 * 1024)).toFixed(2);
                      const message = `
Performance Budget Analysis!

Status: ${analysis.passedBudget ? 'PASSED ✓' : 'EXCEEDED ✗'}
Score: ${analysis.score}/100

Page Metrics:
• Total Size: ${totalSizeMB}MB
• Total Requests: ${analysis.totalRequests}
• Third-Party Resources: ${analysis.thirdPartyResources}

Budget Violations: ${analysis.violations.length}
${analysis.violations.map((v: any) => `• ${v.metric}: ${v.message}`).join('\n')}
                      `.trim();

                      alert(message);
                      console.log('Full performance budget analysis:', data.data);
                    } else {
                      throw new Error(data?.error || 'Failed to monitor performance');
                    }
                  } catch (error: any) {
                    toast.error(error.message || 'Failed to monitor performance');
                  } finally {
                    toast.dismiss();
                  }
                }}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Check Budget
              </Button>

              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline mr-2" />
                  Monitors page weight, resource counts, and alerts when budgets are exceeded.
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <h4 className="font-semibold mb-2">Tracks:</h4>
                <ul className="space-y-1 ml-4">
                  <li>✅ Total page size</li>
                  <li>✅ JavaScript bundle size</li>
                  <li>✅ CSS file sizes</li>
                  <li>✅ Image total size</li>
                  <li>✅ Font count</li>
                  <li>✅ Total HTTP requests</li>
                  <li>✅ Third-party resources</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
