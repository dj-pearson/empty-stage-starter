import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ResourceMetrics {
  type: string;
  count: number;
  totalSize: number;
  avgSize: number;
  largestResource: string | null;
  largestSize: number;
}

interface PerformanceBudget {
  maxPageSize?: number; // bytes
  maxJsSize?: number;
  maxCssSize?: number;
  maxImageSize?: number;
  maxFonts?: number;
  maxRequests?: number;
  maxThirdParty?: number;
}

interface BudgetViolation {
  metric: string;
  budget: number;
  actual: number;
  overBy: number;
  severity: "low" | "medium" | "high";
  message: string;
}

interface PerformanceAnalysis {
  url: string;
  totalPageSize: number;
  totalRequests: number;
  resourceMetrics: Record<string, ResourceMetrics>;
  thirdPartyResources: number;
  violations: BudgetViolation[];
  passedBudget: boolean;
  score: number;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      url,
      budget = {
        maxPageSize: 3 * 1024 * 1024, // 3MB
        maxJsSize: 1 * 1024 * 1024, // 1MB
        maxCssSize: 200 * 1024, // 200KB
        maxImageSize: 1.5 * 1024 * 1024, // 1.5MB
        maxFonts: 4,
        maxRequests: 50,
        maxThirdParty: 10,
      },
    } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    console.log(`Monitoring performance budget for ${url}...`);

    const analysis = await analyzePerformanceBudget(url, budget);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save to database
    const { data: savedAnalysis, error: saveError } = await supabase
      .from("seo_performance_budget")
      .insert({
        url: analysis.url,
        total_page_size: analysis.totalPageSize,
        total_requests: analysis.totalRequests,
        third_party_resources: analysis.thirdPartyResources,
        violations_count: analysis.violations.length,
        passed_budget: analysis.passedBudget,
        score: analysis.score,
        resource_metrics: JSON.stringify(analysis.resourceMetrics),
        violations: JSON.stringify(analysis.violations),
        budget_settings: JSON.stringify(budget),
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save performance budget analysis:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...analysis,
          analysisId: savedAnalysis?.id,
        },
        message: analysis.passedBudget
          ? `Performance budget passed (${analysis.violations.length} violations)`
          : `Performance budget exceeded with ${analysis.violations.length} violations`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in monitor-performance-budget:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

async function analyzePerformanceBudget(
  url: string,
  budget: PerformanceBudget
): Promise<PerformanceAnalysis> {
  const baseUrl = new URL(url);
  const domain = baseUrl.origin;

  // Fetch the main HTML
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Performance-Budget-Monitor/1.0",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status}`);
  }

  const html = await response.text();
  const htmlSize = new Blob([html]).size;

  // Track resources by type
  const resources: Array<{ url: string; type: string; size: number; isThirdParty: boolean }> = [];

  // Add HTML as a resource
  resources.push({
    url,
    type: "html",
    size: htmlSize,
    isThirdParty: false,
  });

  // Extract and fetch all resources
  const resourcePromises: Promise<void>[] = [];

  // Extract CSS
  const cssRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
  let match;

  while ((match = cssRegex.exec(html)) !== null) {
    const resourceUrl = resolveUrl(match[1], url);
    resourcePromises.push(
      fetchResourceSize(resourceUrl, "css", domain).then((resource) => {
        if (resource) resources.push(resource);
      })
    );
  }

  // Extract JavaScript
  const jsRegex = /<script[^>]+src=["']([^"']+)["']/gi;

  while ((match = jsRegex.exec(html)) !== null) {
    const resourceUrl = resolveUrl(match[1], url);
    resourcePromises.push(
      fetchResourceSize(resourceUrl, "js", domain).then((resource) => {
        if (resource) resources.push(resource);
      })
    );
  }

  // Extract Images
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;

  while ((match = imgRegex.exec(html)) !== null) {
    const resourceUrl = resolveUrl(match[1], url);
    resourcePromises.push(
      fetchResourceSize(resourceUrl, "image", domain).then((resource) => {
        if (resource) resources.push(resource);
      })
    );
  }

  // Extract Fonts
  const fontRegex = /@font-face[^}]*url\(["']?([^"')]+)["']?\)/gi;

  while ((match = fontRegex.exec(html)) !== null) {
    const resourceUrl = resolveUrl(match[1], url);
    resourcePromises.push(
      fetchResourceSize(resourceUrl, "font", domain).then((resource) => {
        if (resource) resources.push(resource);
      })
    );
  }

  // Also check for fonts in link tags
  const fontLinkRegex = /<link[^>]+href=["']([^"']+\.(?:woff2?|ttf|eot|otf))["']/gi;

  while ((match = fontLinkRegex.exec(html)) !== null) {
    const resourceUrl = resolveUrl(match[1], url);
    resourcePromises.push(
      fetchResourceSize(resourceUrl, "font", domain).then((resource) => {
        if (resource) resources.push(resource);
      })
    );
  }

  // Wait for all resources to be fetched
  await Promise.all(resourcePromises);

  // Calculate metrics by type
  const resourceMetrics: Record<string, ResourceMetrics> = {};
  const types = ["html", "css", "js", "image", "font", "other"];

  for (const type of types) {
    const typeResources = resources.filter((r) => r.type === type);
    const totalSize = typeResources.reduce((sum, r) => sum + r.size, 0);

    if (typeResources.length > 0) {
      const largest = typeResources.reduce((max, r) => (r.size > max.size ? r : max));

      resourceMetrics[type] = {
        type,
        count: typeResources.length,
        totalSize,
        avgSize: Math.round(totalSize / typeResources.length),
        largestResource: largest.url,
        largestSize: largest.size,
      };
    }
  }

  // Calculate totals
  const totalPageSize = resources.reduce((sum, r) => sum + r.size, 0);
  const totalRequests = resources.length;
  const thirdPartyResources = resources.filter((r) => r.isThirdParty).length;

  // Check budget violations
  const violations: BudgetViolation[] = [];

  // Check total page size
  if (budget.maxPageSize && totalPageSize > budget.maxPageSize) {
    violations.push({
      metric: "Total Page Size",
      budget: budget.maxPageSize,
      actual: totalPageSize,
      overBy: totalPageSize - budget.maxPageSize,
      severity: totalPageSize > budget.maxPageSize * 1.5 ? "high" : "medium",
      message: `Page size ${formatBytes(totalPageSize)} exceeds budget ${formatBytes(budget.maxPageSize)}`,
    });
  }

  // Check JS size
  const jsSize = resourceMetrics["js"]?.totalSize || 0;
  if (budget.maxJsSize && jsSize > budget.maxJsSize) {
    violations.push({
      metric: "JavaScript Size",
      budget: budget.maxJsSize,
      actual: jsSize,
      overBy: jsSize - budget.maxJsSize,
      severity: jsSize > budget.maxJsSize * 1.5 ? "high" : "medium",
      message: `JS size ${formatBytes(jsSize)} exceeds budget ${formatBytes(budget.maxJsSize)}`,
    });
  }

  // Check CSS size
  const cssSize = resourceMetrics["css"]?.totalSize || 0;
  if (budget.maxCssSize && cssSize > budget.maxCssSize) {
    violations.push({
      metric: "CSS Size",
      budget: budget.maxCssSize,
      actual: cssSize,
      overBy: cssSize - budget.maxCssSize,
      severity: cssSize > budget.maxCssSize * 1.5 ? "high" : "medium",
      message: `CSS size ${formatBytes(cssSize)} exceeds budget ${formatBytes(budget.maxCssSize)}`,
    });
  }

  // Check image size
  const imageSize = resourceMetrics["image"]?.totalSize || 0;
  if (budget.maxImageSize && imageSize > budget.maxImageSize) {
    violations.push({
      metric: "Image Size",
      budget: budget.maxImageSize,
      actual: imageSize,
      overBy: imageSize - budget.maxImageSize,
      severity: imageSize > budget.maxImageSize * 1.5 ? "high" : "medium",
      message: `Image size ${formatBytes(imageSize)} exceeds budget ${formatBytes(budget.maxImageSize)}`,
    });
  }

  // Check font count
  const fontCount = resourceMetrics["font"]?.count || 0;
  if (budget.maxFonts && fontCount > budget.maxFonts) {
    violations.push({
      metric: "Font Count",
      budget: budget.maxFonts,
      actual: fontCount,
      overBy: fontCount - budget.maxFonts,
      severity: fontCount > budget.maxFonts * 1.5 ? "medium" : "low",
      message: `${fontCount} fonts exceeds budget of ${budget.maxFonts}`,
    });
  }

  // Check total requests
  if (budget.maxRequests && totalRequests > budget.maxRequests) {
    violations.push({
      metric: "Total Requests",
      budget: budget.maxRequests,
      actual: totalRequests,
      overBy: totalRequests - budget.maxRequests,
      severity: totalRequests > budget.maxRequests * 1.5 ? "high" : "medium",
      message: `${totalRequests} requests exceeds budget of ${budget.maxRequests}`,
    });
  }

  // Check third-party resources
  if (budget.maxThirdParty && thirdPartyResources > budget.maxThirdParty) {
    violations.push({
      metric: "Third-Party Resources",
      budget: budget.maxThirdParty,
      actual: thirdPartyResources,
      overBy: thirdPartyResources - budget.maxThirdParty,
      severity: thirdPartyResources > budget.maxThirdParty * 2 ? "medium" : "low",
      message: `${thirdPartyResources} third-party resources exceeds budget of ${budget.maxThirdParty}`,
    });
  }

  // Calculate score (0-100)
  const score = Math.max(
    0,
    100 - violations.reduce((penalty, v) => {
      if (v.severity === "high") return penalty + 20;
      if (v.severity === "medium") return penalty + 10;
      return penalty + 5;
    }, 0)
  );

  return {
    url,
    totalPageSize,
    totalRequests,
    resourceMetrics,
    thirdPartyResources,
    violations,
    passedBudget: violations.length === 0,
    score,
  };
}

async function fetchResourceSize(
  url: string,
  type: string,
  domain: string
): Promise<{ url: string; type: string; size: number; isThirdParty: boolean } | null> {
  try {
    const resourceUrl = new URL(url);
    const isThirdParty = resourceUrl.origin !== domain;

    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const contentLength = response.headers.get("content-length");
    const size = contentLength ? parseInt(contentLength) : 0;

    return {
      url,
      type,
      size,
      isThirdParty,
    };
  } catch (e) {
    console.warn(`Failed to fetch resource ${url}:`, e.message);
    return null;
  }
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    if (href.startsWith("http://") || href.startsWith("https://")) {
      return href;
    } else if (href.startsWith("//")) {
      return `https:${href}`;
    } else if (href.startsWith("/")) {
      const base = new URL(baseUrl);
      return `${base.origin}${href}`;
    } else {
      return new URL(href, baseUrl).href;
    }
  } catch (e) {
    return href;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / (1024 * 1024) * 10) / 10}MB`;
}
