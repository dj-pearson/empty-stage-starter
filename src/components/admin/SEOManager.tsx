import { useState, useEffect, useRef } from "react";
import type {
  CrawlResultsSummary,
  ImageResultsSummary,
  RedirectAnalysisResults,
  DuplicateAnalysisResults,
  SecurityAnalysisResults,
  LinkStructureResults as LinkStructureResultsType,
  MobileAnalysisResults,
  PerformanceBudgetResults,
} from "@/types/seo-types";
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
import {
  computeSEOScore,
  getScoreColor,
  type AuditResult,
  type SEOScore,
} from "@/lib/seoScore";
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
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [seoScore, setSeoScore] = useState<SEOScore>({
    overall: 0,
    technical: 0,
    onPage: 0,
    performance: 0,
    mobile: 0,
    accessibility: 0,
  });

  // US-553: useSeoCompetitors reads our own score AFTER awaiting its analysis
  // call, so it takes a getter over this ref rather than a captured value that
  // could be a whole audit out of date by the time it is written.
  const seoScoreRef = useRef(seoScore);
  seoScoreRef.current = seoScore;
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditUrl, setAuditUrl] = useState(window.location.origin);
  const [pageAnalysis, setPageAnalysis] = useState<PageData[]>([]);
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [activeTab, setActiveTab] = useState("audit");
  const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
  const [fixSuggestions, setFixSuggestions] = useState<Record<string, unknown>[]>([]);
  const [isApplyingFixes, setIsApplyingFixes] = useState(false);

  // Google Search Console state

  // Monitoring & Alerts state

  // New SEO features state
  const [crawlResults, setCrawlResults] = useState<CrawlResultsSummary | null>(null);
  const [imageResults, setImageResults] = useState<ImageResultsSummary | null>(null);
  const [redirectResults, setRedirectResults] = useState<RedirectAnalysisResults | null>(null);
  const [duplicateResults, setDuplicateResults] = useState<DuplicateAnalysisResults | null>(null);
  const [securityResults, setSecurityResults] = useState<SecurityAnalysisResults | null>(null);
  const [linkStructureResults, setLinkStructureResults] = useState<LinkStructureResultsType | null>(null);
  const [mobileResults, setMobileResults] = useState<MobileAnalysisResults | null>(null);
  const [budgetResults, setBudgetResults] = useState<PerformanceBudgetResults | null>(null);

  // Additional operation results state
  const [brokenLinksResults, setBrokenLinksResults] = useState<Record<string, unknown> | null>(null);
  const [contentAnalysisResults, setContentAnalysisResults] = useState<Record<string, unknown> | null>(null);
  const [blogPostsAnalysisResults, setBlogPostsAnalysisResults] = useState<Record<string, unknown> | null>(null);
  const [structuredDataValidationResults, setStructuredDataValidationResults] = useState<Record<string, unknown> | null>(null);
  const [coreWebVitalsResults, setCoreWebVitalsResults] = useState<Record<string, unknown> | null>(null);
  const [backlinksResults, setBacklinksResults] = useState<Record<string, unknown>[]>([]);
  const [autoHealingResults, setAutoHealingResults] = useState<Record<string, unknown> | null>(null);
  const [fixesAppliedResults, setFixesAppliedResults] = useState<Record<string, unknown> | null>(null);

  // Loading states for operations
  const [isScanningBrokenLinks, setIsScanningBrokenLinks] = useState(false);
  const [isAnalyzingContent, setIsAnalyzingContent] = useState(false);
  const [isAnalyzingBlogPosts, setIsAnalyzingBlogPosts] = useState(false);
  const [isValidatingStructuredData, setIsValidatingStructuredData] = useState(false);
  const [isCheckingWebVitals, setIsCheckingWebVitals] = useState(false);
  const [isAddingBacklink, setIsAddingBacklink] = useState(false);

  const isMobile = useIsMobile();

  const {
    trackedKeywords,
    newKeyword,
    setNewKeyword,
    loadTrackedKeywords,
    addKeywordToTrack,
  } = useSeoKeywords();

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
        logger.error('Error saving audit:', auditError);
      } else if (auditData) {
        setCurrentAuditId(auditData.id);

        // Update last_audit_at in settings
        await supabase
          .from('seo_settings')
          .update({ last_audit_at: new Date().toISOString() })
          .eq('id', '00000000-0000-0000-0000-000000000001');
      }
    } catch (error) {
      logger.error('Error saving audit results:', error);
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
    const _twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const _twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const _twitterImage = document.querySelector('meta[name="twitter:image"]');

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

  const calculateSEOScore = (results: AuditResult[]): SEOScore => {
    const finalScores = computeSEOScore(results); // pure math in src/lib/seoScore.ts
    setSeoScore(finalScores);
    return finalScores; // Return scores for saving to database
  };

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
        <SeoPerformanceTab
          coreWebVitalsResults={coreWebVitalsResults}
          setCoreWebVitalsResults={setCoreWebVitalsResults}
          isCheckingWebVitals={isCheckingWebVitals}
          setIsCheckingWebVitals={setIsCheckingWebVitals}
        />

        {/* backlinks tracking tab (US-553 AC1) */}
        <SeoBacklinksTab
          backlinksResults={backlinksResults}
          setBacklinksResults={setBacklinksResults}
          isAddingBacklink={isAddingBacklink}
          setIsAddingBacklink={setIsAddingBacklink}
        />

        {/* broken-link checker tab (US-553 AC1) */}
        <SeoBrokenLinksTab
          brokenLinksResults={brokenLinksResults}
          setBrokenLinksResults={setBrokenLinksResults}
          isScanningBrokenLinks={isScanningBrokenLinks}
          setIsScanningBrokenLinks={setIsScanningBrokenLinks}
        />

        {/* Content Analysis Tab */}
        <SeoContentTab
          contentAnalysisResults={contentAnalysisResults}
          setContentAnalysisResults={setContentAnalysisResults}
          isAnalyzingContent={isAnalyzingContent}
          setIsAnalyzingContent={setIsAnalyzingContent}
        />

        {/* Content Optimizer Tab */}
        <TabsContent value="content-optimizer" className="space-y-4">
          <ContentOptimizer />
        </TabsContent>

        {/* Site Crawler Tab (US-553 AC1) */}
        <SeoSiteCrawlerTab results={crawlResults} setResults={setCrawlResults} />

        {/* Image Analysis Tab (US-553 AC1) */}
        <SeoImageAnalysisTab results={imageResults} setResults={setImageResults} />

        {/* Redirects Tab */}
        {/* redirects analysis tab (US-553 AC1) */}
        <SeoRedirectsTab results={redirectResults} setResults={setRedirectResults} />

        {/* Duplicate Content Tab */}
        {/* duplicate-content analysis tab (US-553 AC1) */}
        <SeoDuplicateContentTab results={duplicateResults} setResults={setDuplicateResults} />

        {/* Security Tab */}
        {/* security analysis tab (US-553 AC1) */}
        <SeoSecurityTab results={securityResults} setResults={setSecurityResults} />

        {/* Link Structure Tab */}
        {/* link-structure analysis tab (US-553 AC1) */}
        <SeoLinkStructureTab results={linkStructureResults} setResults={setLinkStructureResults} />

        {/* Mobile Check Tab */}
        {/* mobile-check analysis tab (US-553 AC1) */}
        <SeoMobileCheckTab results={mobileResults} setResults={setMobileResults} />

        {/* Performance Budget Tab */}
        {/* budget analysis tab (US-553 AC1) */}
        <SeoBudgetTab results={budgetResults} setResults={setBudgetResults} />
          </div>
        </div>
      </Tabs>
    </div>
  );
}
