import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
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
  Copy,
  RefreshCw,
  Zap,
  Target,
  Eye,
  Sparkles,
  Shield,
  Smartphone,
  Gauge,
  Link2,
  Trophy,
  XCircle,
  Info,
  Bell,
  ArrowRightCircle,
  Network,
  DollarSign,
  Image,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { useIsMobile } from "@/hooks/use-mobile";
import { ContentOptimizer } from "./ContentOptimizer";
import { logger } from "@/lib/logger";

// AuditResult, SEOScore and the pure scoring logic live in src/lib/seoScore.ts
// (unit-tested) so the scoring math is verifiable outside this large component (US-553 AC1).
import { getScoreColor } from "@/lib/seoScore";
import { SeoFilesTabs } from "@/components/admin/seo/SeoFilesTabs";
import { SeoMetaTab, type MetaTags } from "@/components/admin/seo/SeoMetaTab";
import { SeoStructuredDataTab } from "@/components/admin/seo/SeoStructuredDataTab";
import { SeoCompetitorsTab } from "@/components/admin/seo/SeoCompetitorsTab";
import { SeoPagesTab } from "@/components/admin/seo/SeoPagesTab";
import { SeoPerformanceTab } from "@/components/admin/seo/SeoPerformanceTab";
import { SeoContentTab } from "@/components/admin/seo/SeoContentTab";
import { SeoMonitoringTab } from "@/components/admin/seo/SeoMonitoringTab";
import { SeoAuditTab } from "@/components/admin/seo/SeoAuditTab";
import { SeoKeywordsTab } from "@/components/admin/seo/SeoKeywordsTab";
import { useGscConnection } from "@/components/admin/seo/useGscConnection";
import { useSeoMonitoring } from "@/components/admin/seo/useSeoMonitoring";
import { useSeoKeywords } from "@/components/admin/seo/useSeoKeywords";
import { useSeoCompetitors } from "@/components/admin/seo/useSeoCompetitors";
import { useSeoAudit } from "@/components/admin/seo/useSeoAudit";
import {
  SeoRedirectsTab,
  SeoDuplicateContentTab,
  SeoSecurityTab,
  SeoLinkStructureTab,
  SeoMobileCheckTab,
  SeoBudgetTab,
} from "@/components/admin/seo/SeoAnalysisTabs";
import {
  SeoSiteCrawlerTab,
  SeoImageAnalysisTab,
} from "@/components/admin/seo/SeoCrawlerTabs";
import {
  SeoBacklinksTab,
  SeoBrokenLinksTab,
} from "@/components/admin/seo/SeoLinkAuditTabs";

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
  const [metaTags, setMetaTags] = useState<MetaTags>({
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

  const [structuredData, setStructuredData] = useState<Record<string, unknown>>({});

  const [auditUrl, setAuditUrl] = useState(window.location.origin);
  // Read partway through a long audit run, so the hook takes a getter over
  // this ref rather than a value captured when the handler was built.
  const auditUrlRef = useRef(auditUrl);
  auditUrlRef.current = auditUrl;
  const [pageAnalysis, setPageAnalysis] = useState<PageData[]>([]);
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [activeTab, setActiveTab] = useState("audit");
  const [fixSuggestions, setFixSuggestions] = useState<Record<string, unknown>[]>([]);
  const [isApplyingFixes, setIsApplyingFixes] = useState(false);

  // Google Search Console state

  // Monitoring & Alerts state

  // New SEO features state

  // Additional operation results state
  const [blogPostsAnalysisResults, setBlogPostsAnalysisResults] = useState<Record<string, unknown> | null>(null);
  const [structuredDataValidationResults, setStructuredDataValidationResults] = useState<Record<string, unknown> | null>(null);
  const [autoHealingResults, setAutoHealingResults] = useState<Record<string, unknown> | null>(null);
  const [fixesAppliedResults, setFixesAppliedResults] = useState<Record<string, unknown> | null>(null);

  // Loading states for operations
  const [isAnalyzingBlogPosts, setIsAnalyzingBlogPosts] = useState(false);
  const [isValidatingStructuredData, setIsValidatingStructuredData] = useState(false);

  const isMobile = useIsMobile();

  const {
    trackedKeywords,
    newKeyword,
    setNewKeyword,
    loadTrackedKeywords,
    addKeywordToTrack,
  } = useSeoKeywords();

  const {
    auditResults,
    seoScore,
    isAuditing,
    currentAuditId,
    runComprehensiveAudit,
    exportAuditReport,
  } = useSeoAudit({
    getAuditUrl: () => auditUrlRef.current,
    getTrackedKeywords: () => trackedKeywords,
  });

  // useSeoCompetitors reads our own score AFTER awaiting its analysis call, so
  // it takes a getter over this ref rather than a value captured when the
  // handler was built, which could be a whole audit out of date.
  const seoScoreRef = useRef(seoScore);
  seoScoreRef.current = seoScore;

  const {
    competitorUrl,
    setCompetitorUrl,
    competitorResults,
    isAnalyzingCompetitor,
    analyzeCompetitor,
    removeCompetitor,
  } = useSeoCompetitors({ getSeoScore: () => seoScoreRef.current });

  const {
    gscConnected,
    gscProperties,
    selectedProperty,
    setSelectedProperty,
    isSyncingGSC,
    lastSyncedAt,
    isConnectingGSC,
    gscSyncResults,
    connectToGSC,
    syncGSCData,
    disconnectGSC,
  } = useGscConnection({ onKeywordsSynced: () => loadTrackedKeywords() });

  const {
    alerts,
    alertRules,
    schedules,
    notificationPrefs,
    activeAlertsCount,
    isLoadingMonitoring,
    loadMonitoringData,
    acknowledgeAlert,
    dismissAlert,
    toggleSchedule,
    saveNotificationPreferences,
  } = useSeoMonitoring();

  useEffect(() => {
    loadSEOSettings();
    loadPageAnalysis();
    // The GSC connection check and the OAuth-return handshake moved into
    // useGscConnection with the state they touch (US-553).
  }, []);



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
      logger.error('Error loading page analysis:', error);
    }
  };

  const analyzeBlogPostsSEO = async () => {
    setIsAnalyzingBlogPosts(true);
    setBlogPostsAnalysisResults(null);

    try {
      const { data, error} = await invokeEdgeFunction("analyze-blog-posts-seo");

      if (error) throw error;

      setBlogPostsAnalysisResults({
        success: true,
        analyzed: data.analyzed || 0,
        message: data.analyzed > 0
          ? `Analyzed ${data.analyzed} blog posts successfully!`
          : "No published blog posts to analyze"
      });

      if (data.analyzed > 0) {
        await loadPageAnalysis();
      }
    } catch (error: unknown) {
      logger.error("Error analyzing blog posts:", error);
      setBlogPostsAnalysisResults({
        success: false,
        error: error.message || "Failed to analyze blog posts"
      });
    } finally {
      setIsAnalyzingBlogPosts(false);
    }
  };

  // =====================================================
  // GOOGLE SEARCH CONSOLE FUNCTIONS
  // =====================================================


  // =====================================================
  // END GOOGLE SEARCH CONSOLE FUNCTIONS
  // =====================================================

  // =====================================================
  // MONITORING & ALERTS FUNCTIONS
  // =====================================================


  // =====================================================
  // END MONITORING & ALERTS FUNCTIONS
  // =====================================================


  const runAIAutoHealing = async () => {
    setIsAutoHealing(true);
    setAutoHealingResults(null);

    try {
      // Call the apply-seo-fixes edge function
      const { data, error } = await invokeEdgeFunction("apply-seo-fixes", {
        body: {
          auditResults: auditResults,
          auditId: currentAuditId,
          autoApply: false, // Set to true to automatically apply fixes
          userId: (await supabase.auth.getUser()).data.user?.id,
        },
      });

      if (error) throw error;

      setFixSuggestions(data.suggestions || []);

      setAutoHealingResults({
        success: true,
        appliedFixes: data.appliedFixes || 0,
        totalSuggestions: data.totalSuggestions || 0,
        autoApplyEnabled: data.autoApplyEnabled || false,
        message: data.autoApplyEnabled && data.appliedFixes > 0
          ? `Applied ${data.appliedFixes} SEO fixes automatically!`
          : `Generated ${data.totalSuggestions} AI-powered optimization suggestions!`
      });

      if (data.autoApplyEnabled && data.appliedFixes > 0) {
        // Re-run audit to see improvements
        setTimeout(() => {
          runComprehensiveAudit();
        }, 1000);
      }

      logger.debug("AI Healing Results:", data);
    } catch (error: unknown) {
      logger.error("AI Auto-Healing error:", error);
      setAutoHealingResults({
        success: false,
        error: error.message || "Failed to generate suggestions"
      });
    } finally {
      setIsAutoHealing(false);
    }
  };

  const applyFixesBatch = async () => {
    setIsApplyingFixes(true);
    setFixesAppliedResults(null);

    try {
      const { data, error } = await invokeEdgeFunction("apply-seo-fixes", {
        body: {
          auditResults: auditResults,
          auditId: currentAuditId,
          autoApply: true, // Actually apply the fixes
          userId: (await supabase.auth.getUser()).data.user?.id,
        },
      });

      if (error) throw error;

      setFixesAppliedResults({
        success: true,
        appliedFixes: data.appliedFixes || 0,
        failedFixes: data.failedFixes || 0,
        message: data.appliedFixes > 0
          ? `Successfully applied ${data.appliedFixes} SEO fixes!`
          : "No fixes were applied",
        warning: data.failedFixes > 0
          ? `${data.failedFixes} fixes failed to apply. Check the logs.`
          : null
      });

      if (data.appliedFixes > 0) {
        // Reload SEO settings
        await loadSEOSettings();

        // Re-run audit to verify improvements
        setTimeout(() => {
          runComprehensiveAudit();
        }, 1000);
      }
    } catch (error: unknown) {
      logger.error("Error applying fixes:", error);
      setFixesAppliedResults({
        success: false,
        error: error.message || "Failed to apply fixes"
      });
    } finally {
      setIsApplyingFixes(false);
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
      <image:loc>${baseUrl}/Cover.webp</image:loc>
      <image:title>EatPal - Kids Meal Planning for Picky Eaters</image:title>
      <image:caption>Meal planning for picky eaters and selective eating</image:caption>
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
      logger.error('Error regenerating sitemap:', error);
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
      // No aggregateRating. This generator used to emit 4.8 from 127 ratings, which
      // nothing backs; a site publishing ratings about its own product is self-serving
      // markup, ineligible for rich results and a manual-action risk when invented.
      // Wire it to a real rating store before re-adding.
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

      {/* Auto-Healing Results */}
      {autoHealingResults && (
        <div className="mt-4">
          {autoHealingResults.success ? (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3 mb-4">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-green-900 mb-1">AI Auto-Healing Complete</h4>
                    <p className="text-sm text-green-800">{autoHealingResults.message}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-card rounded p-3">
                    <div className="text-sm text-muted-foreground">Total Suggestions</div>
                    <div className="text-2xl font-bold">{autoHealingResults.totalSuggestions}</div>
                  </div>
                  {autoHealingResults.autoApplyEnabled && (
                    <div className="bg-card rounded p-3">
                      <div className="text-sm text-muted-foreground">Applied Fixes</div>
                      <div className="text-2xl font-bold text-green-600">{autoHealingResults.appliedFixes}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-red-900 mb-1">AI Auto-Healing Failed</h4>
                  <p className="text-sm text-red-800">{autoHealingResults.error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fixes Applied Results */}
      {fixesAppliedResults && (
        <div className="mt-4">
          {fixesAppliedResults.success ? (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3 mb-4">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-green-900 mb-1">SEO Fixes Applied</h4>
                    <p className="text-sm text-green-800">{fixesAppliedResults.message}</p>
                    {fixesAppliedResults.warning && (
                      <p className="text-sm text-yellow-800 mt-2">⚠️ {fixesAppliedResults.warning}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-card rounded p-3">
                    <div className="text-sm text-muted-foreground">Successfully Applied</div>
                    <div className="text-2xl font-bold text-green-600">{fixesAppliedResults.appliedFixes}</div>
                  </div>
                  {fixesAppliedResults.failedFixes > 0 && (
                    <div className="bg-card rounded p-3">
                      <div className="text-sm text-muted-foreground">Failed Fixes</div>
                      <div className="text-2xl font-bold text-red-600">{fixesAppliedResults.failedFixes}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-red-900 mb-1">Failed to Apply Fixes</h4>
                  <p className="text-sm text-red-800">{fixesAppliedResults.error}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
        <div className={!isMobile ? "flex gap-6" : ""}>
          {/* Desktop Sidebar Navigation */}
          {!isMobile && (
            <TabsList className="w-64 shrink-0 h-fit sticky top-4 flex-col items-stretch bg-card border">
              <div className="p-4 space-y-6">
                {/* Technical SEO */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground px-2 mb-2">TECHNICAL SEO</p>
                  <TabsTrigger value="audit" className="w-full justify-start">
                    <Search className="h-4 w-4 mr-2" />
                    Audit
                  </TabsTrigger>
                  <TabsTrigger value="site-crawler" className="w-full justify-start">
                    <Globe className="h-4 w-4 mr-2" />
                    Site Crawler
                  </TabsTrigger>
                  <TabsTrigger value="broken-links" className="w-full justify-start">
                    <XCircle className="h-4 w-4 mr-2" />
                    Broken Links
                  </TabsTrigger>
                  <TabsTrigger value="redirects" className="w-full justify-start">
                    <ArrowRightCircle className="h-4 w-4 mr-2" />
                    Redirects
                  </TabsTrigger>
                  <TabsTrigger value="security" className="w-full justify-start">
                    <Shield className="h-4 w-4 mr-2" />
                    Security
                  </TabsTrigger>
                  <TabsTrigger value="mobile-check" className="w-full justify-start">
                    <Smartphone className="h-4 w-4 mr-2" />
                    Mobile Check
                  </TabsTrigger>
                </div>

                <Separator />

                {/* Content & On-Page */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground px-2 mb-2">CONTENT & ON-PAGE</p>
                  <TabsTrigger value="content" className="w-full justify-start">
                    <FileText className="h-4 w-4 mr-2" />
                    Content
                  </TabsTrigger>
                  <TabsTrigger value="content-optimizer" className="w-full justify-start">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Optimizer
                  </TabsTrigger>
                  <TabsTrigger value="pages" className="w-full justify-start">
                    <Eye className="h-4 w-4 mr-2" />
                    Pages
                  </TabsTrigger>
                  <TabsTrigger value="meta" className="w-full justify-start">
                    <FileText className="h-4 w-4 mr-2" />
                    Meta Tags
                  </TabsTrigger>
                  <TabsTrigger value="duplicate-content" className="w-full justify-start">
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicates
                  </TabsTrigger>
                  <TabsTrigger value="image-analysis" className="w-full justify-start">
                    <Image className="h-4 w-4 mr-2" />
                    Images
                  </TabsTrigger>
                </div>

                <Separator />

                {/* Links & Ranking */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground px-2 mb-2">LINKS & RANKING</p>
                  <TabsTrigger value="keywords" className="w-full justify-start">
                    <Target className="h-4 w-4 mr-2" />
                    Keywords
                  </TabsTrigger>
                  <TabsTrigger value="competitors" className="w-full justify-start">
                    <Trophy className="h-4 w-4 mr-2" />
                    Competitors
                  </TabsTrigger>
                  <TabsTrigger value="backlinks" className="w-full justify-start">
                    <Link2 className="h-4 w-4 mr-2" />
                    Backlinks
                  </TabsTrigger>
                  <TabsTrigger value="link-structure" className="w-full justify-start">
                    <Network className="h-4 w-4 mr-2" />
                    Link Structure
                  </TabsTrigger>
                </div>

                <Separator />

                {/* Performance */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground px-2 mb-2">PERFORMANCE</p>
                  <TabsTrigger value="performance" className="w-full justify-start">
                    <Gauge className="h-4 w-4 mr-2" />
                    Core Web Vitals
                  </TabsTrigger>
                  <TabsTrigger value="budget" className="w-full justify-start">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Budget Monitor
                  </TabsTrigger>
                </div>

                <Separator />

                {/* Configuration */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground px-2 mb-2">CONFIGURATION</p>
                  <TabsTrigger value="robots" className="w-full justify-start">
                    <Globe className="h-4 w-4 mr-2" />
                    robots.txt
                  </TabsTrigger>
                  <TabsTrigger value="sitemap" className="w-full justify-start">
                    <Code className="h-4 w-4 mr-2" />
                    sitemap.xml
                  </TabsTrigger>
                  <TabsTrigger value="llms" className="w-full justify-start">
                    <FileText className="h-4 w-4 mr-2" />
                    llms.txt
                  </TabsTrigger>
                  <TabsTrigger value="structured" className="w-full justify-start">
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Structured Data
                  </TabsTrigger>
                  <TabsTrigger value="monitoring" className="w-full justify-start">
                    <Bell className="h-4 w-4 mr-2" />
                    Monitoring
                  </TabsTrigger>
                </div>
              </div>
            </TabsList>
          )}

          <div className={!isMobile ? "flex-1 min-w-0" : "w-full"}>
            {/* Mobile Dropdown Selector */}
            {isMobile && (
          <div className="w-full mb-4">
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
        <SeoAuditTab
          auditResults={auditResults}
          runComprehensiveAudit={runComprehensiveAudit}
          exportAuditReport={exportAuditReport}
          getStatusIcon={getStatusIcon}
        />

        {/* Keyword Tracking Tab */}
        <SeoKeywordsTab
          trackedKeywords={trackedKeywords}
          newKeyword={newKeyword}
          setNewKeyword={setNewKeyword}
          addKeywordToTrack={addKeywordToTrack}
          gscConnected={gscConnected}
          gscProperties={gscProperties}
          gscSyncResults={gscSyncResults}
          selectedProperty={selectedProperty}
          setSelectedProperty={setSelectedProperty}
          isConnectingGSC={isConnectingGSC}
          isSyncingGSC={isSyncingGSC}
          lastSyncedAt={lastSyncedAt}
          connectToGSC={connectToGSC}
          disconnectGSC={disconnectGSC}
          syncGSCData={syncGSCData}
        />

        {/* Competitor Analysis Tab */}
        <SeoCompetitorsTab
          competitorUrl={competitorUrl}
          setCompetitorUrl={setCompetitorUrl}
          competitorResults={competitorResults}
          seoScore={seoScore}
          isAnalyzingCompetitor={isAnalyzingCompetitor}
          analyzeCompetitor={analyzeCompetitor}
          removeCompetitor={removeCompetitor}
          getScoreColor={getScoreColor}
          getStatusIcon={getStatusIcon}
        />

        {/* Pages Tab */}
        <SeoPagesTab
          pageAnalysis={pageAnalysis}
          blogPostsAnalysisResults={blogPostsAnalysisResults}
          isAnalyzingBlogPosts={isAnalyzingBlogPosts}
          analyzeBlogPostsSEO={analyzeBlogPostsSEO}
          setAuditUrl={setAuditUrl}
          runComprehensiveAudit={runComprehensiveAudit}
        />

        {/* Meta Tags Tab */}
        {/* Meta Tags configuration tab (US-553 AC1) */}
        <SeoMetaTab metaTags={metaTags} setMetaTags={setMetaTags} onSave={handleUpdateMetaTags} />

        {/* robots.txt / sitemap.xml / llms.txt editor tabs (US-553 AC1) */}
        <SeoFilesTabs
          robotsTxt={robotsTxt}
          setRobotsTxt={setRobotsTxt}
          sitemapXml={sitemapXml}
          setSitemapXml={setSitemapXml}
          llmsTxt={llmsTxt}
          setLlmsTxt={setLlmsTxt}
          isRegeneratingSitemap={isRegeneratingSitemap}
          regenerateSitemap={regenerateSitemap}
          onCopy={handleCopyToClipboard}
          onDownload={handleDownloadFile}
        />

        {/* Structured Data Tab */}
        {/* Structured Data (JSON-LD) tab (US-553 AC1) */}
        <SeoStructuredDataTab
          structuredData={structuredData}
          setStructuredData={setStructuredData}
          isValidatingStructuredData={isValidatingStructuredData}
          setIsValidatingStructuredData={setIsValidatingStructuredData}
          structuredDataValidationResults={structuredDataValidationResults}
          setStructuredDataValidationResults={setStructuredDataValidationResults}
          onCopy={handleCopyToClipboard}
          onDownload={handleDownloadFile}
        />

        {/* Monitoring & Alerts Tab */}
        <SeoMonitoringTab
          alerts={alerts}
          alertRules={alertRules}
          schedules={schedules}
          notificationPrefs={notificationPrefs}
          activeAlertsCount={activeAlertsCount}
          isLoadingMonitoring={isLoadingMonitoring}
          activeTab={activeTab}
          loadMonitoringData={loadMonitoringData}
          acknowledgeAlert={acknowledgeAlert}
          dismissAlert={dismissAlert}
          toggleSchedule={toggleSchedule}
          saveNotificationPreferences={saveNotificationPreferences}
        />

        {/* Core Web Vitals / Performance Tab */}
        <SeoPerformanceTab />

        {/* backlinks tracking tab (US-553 AC1) */}
        <SeoBacklinksTab />

        {/* broken-link checker tab (US-553 AC1) */}
        <SeoBrokenLinksTab />

        {/* Content Analysis Tab */}
        <SeoContentTab />

        {/* Content Optimizer Tab */}
        <TabsContent value="content-optimizer" className="space-y-4">
          <ContentOptimizer />
        </TabsContent>

        {/* Site Crawler Tab (US-553 AC1) */}
        <SeoSiteCrawlerTab />

        {/* Image Analysis Tab (US-553 AC1) */}
        <SeoImageAnalysisTab />

        {/* Redirects Tab */}
        {/* redirects analysis tab (US-553 AC1) */}
        <SeoRedirectsTab />

        {/* Duplicate Content Tab */}
        {/* duplicate-content analysis tab (US-553 AC1) */}
        <SeoDuplicateContentTab />

        {/* Security Tab */}
        {/* security analysis tab (US-553 AC1) */}
        <SeoSecurityTab />

        {/* Link Structure Tab */}
        {/* link-structure analysis tab (US-553 AC1) */}
        <SeoLinkStructureTab />

        {/* Mobile Check Tab */}
        {/* mobile-check analysis tab (US-553 AC1) */}
        <SeoMobileCheckTab />

        {/* Performance Budget Tab */}
        {/* budget analysis tab (US-553 AC1) */}
        <SeoBudgetTab />
          </div>
        </div>
      </Tabs>
    </div>
  );
}
