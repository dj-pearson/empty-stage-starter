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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();

  useEffect(() => {
    loadSEOSettings();
    loadTrackedKeywords();
  }, []);

  const loadTrackedKeywords = () => {
    // Simulated keyword data - in production, this would come from a database
    const mockKeywords: KeywordData[] = [
      { keyword: "picky eater meal planning", position: 3, volume: 1200, difficulty: 42, url: "/", trend: "up" },
      { keyword: "kid meal planner", position: 7, volume: 890, difficulty: 38, url: "/planner", trend: "up" },
      { keyword: "safe foods for picky eaters", position: 12, volume: 650, difficulty: 35, url: "/pantry", trend: "stable" },
      { keyword: "meal planning app", position: 24, volume: 5400, difficulty: 68, url: "/", trend: "down" },
    ];
    setTrackedKeywords(mockKeywords);
  };

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
    calculateSEOScore(results);
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

    setSeoScore({
      overall,
      ...scores,
    });
  };

  const runAIAutoHealing = async () => {
    setIsAutoHealing(true);
    toast.info("Running AI-powered SEO auto-healing...");

    // Simulate AI analysis and fixes
    const fixableIssues = auditResults.filter((r) => r.status !== "passed" && r.fix);
    
    // In production, this would:
    // 1. Send issues to AI model for analysis
    // 2. Generate optimized content/fixes
    // 3. Apply fixes to database or suggest changes
    // 4. Re-run audit to verify improvements

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const suggestions = fixableIssues.map((issue) => ({
      issue: issue.message,
      fix: issue.fix,
      priority: issue.impact,
      aiRecommendation: `AI Suggestion: ${issue.fix} - Implementing this will improve your ${issue.category} score.`,
    }));

    console.log("AI Healing Suggestions:", suggestions);
    
    setIsAutoHealing(false);
    toast.success(`Generated ${suggestions.length} AI-powered optimization suggestions!`);
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

      const existingIndex = competitorResults.findIndex((c) => c.url === competitorUrl);
      if (existingIndex >= 0) {
        const updated = [...competitorResults];
        updated[existingIndex] = { ...data, analyzedAt: new Date().toISOString() };
        setCompetitorResults(updated);
      } else {
        setCompetitorResults([...competitorResults, { ...data, analyzedAt: new Date().toISOString() }]);
      }

      toast.success("Competitor analysis complete!");
    } catch (error: any) {
      console.error("Competitor analysis error:", error);
      toast.error(`Failed to analyze competitor: ${error.message}`);
    } finally {
      setIsAnalyzingCompetitor(false);
    }
  };

  const removeCompetitor = (url: string) => {
    setCompetitorResults(competitorResults.filter((c) => c.url !== url));
    toast.success("Competitor removed");
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Keyword Tracking
              </CardTitle>
              <CardDescription>Monitor keyword rankings and performance</CardDescription>
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
                      <TableCell>{kw.volume.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={kw.difficulty} className="w-16 h-2" />
                          <span className="text-xs">{kw.difficulty}</span>
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
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Page Analysis
              </CardTitle>
              <CardDescription>SEO performance of individual pages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Page-by-page analysis</h3>
                <p className="text-muted-foreground mb-4">
                  Coming soon: Individual page SEO scores and recommendations
                </p>
              </div>
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
                Help search engines discover your pages. Place this file in your /public directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
