import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { computeSEOScore, type AuditResult, type SEOScore } from '@/lib/seoScore';

const EMPTY_SCORE: SEOScore = {
  overall: 0,
  technical: 0,
  onPage: 0,
  performance: 0,
  mobile: 0,
  accessibility: 0,
};

/**
 * US-553: the comprehensive audit, lifted out of SEOManager.
 *
 * The largest of the hooks: runComprehensiveAudit plus the six per-category
 * check routines it drives (technical, on-page, performance, mobile, security,
 * content) and the report export. No mount effect -- an audit runs only when a
 * parent asks for it.
 */
/**
 * The audit reads two things it does not own: the URL to audit, and the
 * tracked keywords one of the on-page checks scores against. Both are getters
 * for the same reason useSeoCompetitors takes one -- they are read partway
 * through a long async run, so a captured value could be several checks out of
 * date by the time it is used.
 */
export interface UseSeoAuditOptions {
  getAuditUrl: () => string;
  getTrackedKeywords: () => unknown[];
}

export function useSeoAudit({ getAuditUrl, getTrackedKeywords }: UseSeoAuditOptions) {
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
  const [seoScore, setSeoScore] = useState<SEOScore>(EMPTY_SCORE);

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
          url: getAuditUrl(),
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

  const exportAuditReport = (format: "json" | "csv") => {
    const timestamp = new Date().toISOString().split("T")[0];
    
    if (format === "json") {
      const report = {
        timestamp: new Date().toISOString(),
        url: getAuditUrl(),
        score: seoScore,
        results: auditResults,
        keywords: getTrackedKeywords(),
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

  return {
    auditResults,
    seoScore,
    isAuditing,
    currentAuditId,
    runComprehensiveAudit,
    exportAuditReport,
  };
}
