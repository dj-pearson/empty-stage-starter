import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MobileCheck {
  name: string;
  passed: boolean;
  score: number;
  severity: "pass" | "low" | "medium" | "high";
  message: string;
  details?: string;
}

interface MobileAnalysis {
  url: string;
  checks: MobileCheck[];
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  totalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    console.log(`Checking mobile-first compliance for ${url}...`);

    const analysis = await analyzeMobileFriendliness(url);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save to database
    const { data: savedAnalysis, error: saveError } = await supabase
      .from("seo_mobile_analysis")
      .insert({
        url: analysis.url,
        overall_score: analysis.overallScore,
        grade: analysis.grade,
        total_issues: analysis.totalIssues,
        high_issues: analysis.highIssues,
        medium_issues: analysis.mediumIssues,
        low_issues: analysis.lowIssues,
        mobile_checks: JSON.stringify(analysis.checks),
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save mobile analysis:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...analysis,
          analysisId: savedAnalysis?.id,
        },
        message: `Mobile analysis complete: Grade ${analysis.grade} (${analysis.overallScore}/100)`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-mobile-first:", error);
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

async function analyzeMobileFriendliness(url: string): Promise<MobileAnalysis> {
  // Fetch the page
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status}`);
  }

  const html = await response.text();
  const checks: MobileCheck[] = [];

  // 1. Viewport Meta Tag
  const viewportRegex = /<meta[^>]+name=["']viewport["'][^>]*>/i;
  const viewportMatch = html.match(viewportRegex);

  if (!viewportMatch) {
    checks.push({
      name: "Viewport Meta Tag",
      passed: false,
      score: 0,
      severity: "high",
      message: "Missing viewport meta tag",
      details: 'Add: <meta name="viewport" content="width=device-width, initial-scale=1">',
    });
  } else {
    const viewport = viewportMatch[0];
    const hasDeviceWidth = /width=device-width/i.test(viewport);
    const hasInitialScale = /initial-scale=1/i.test(viewport);

    if (!hasDeviceWidth || !hasInitialScale) {
      checks.push({
        name: "Viewport Meta Tag",
        passed: false,
        score: 5,
        severity: "medium",
        message: "Viewport meta tag is incomplete",
        details: viewport,
      });
    } else {
      checks.push({
        name: "Viewport Meta Tag",
        passed: true,
        score: 15,
        severity: "pass",
        message: "Viewport meta tag is properly configured",
      });
    }
  }

  // 2. Text Readability
  const fontSizeRegex = /font-size:\s*(\d+)px/gi;
  const fontSizes: number[] = [];
  let match;

  while ((match = fontSizeRegex.exec(html)) !== null) {
    fontSizes.push(parseInt(match[1]));
  }

  const minFontSize = fontSizes.length > 0 ? Math.min(...fontSizes) : 16;

  if (minFontSize < 12) {
    checks.push({
      name: "Text Readability",
      passed: false,
      score: 0,
      severity: "high",
      message: `Font size too small (${minFontSize}px, recommend 16px minimum)`,
    });
  } else if (minFontSize < 14) {
    checks.push({
      name: "Text Readability",
      passed: false,
      score: 5,
      severity: "medium",
      message: `Font size could be larger (${minFontSize}px, recommend 16px)`,
    });
  } else {
    checks.push({
      name: "Text Readability",
      passed: true,
      score: 10,
      severity: "pass",
      message: "Font sizes are mobile-friendly",
    });
  }

  // 3. Touch Elements Spacing
  const hasMediaQueries = /@media[^{]+\{/i.test(html);

  if (!hasMediaQueries) {
    checks.push({
      name: "Responsive Design",
      passed: false,
      score: 0,
      severity: "high",
      message: "No CSS media queries detected",
      details: "Page may not adapt to different screen sizes",
    });
  } else {
    // Check for mobile-specific breakpoints
    const mobileBreakpoints = html.match(/@media[^{]+\(max-width:\s*(\d+)px\)/gi);
    const hasMobileBreakpoint = mobileBreakpoints && mobileBreakpoints.some((bp) => {
      const width = bp.match(/(\d+)px/);
      return width && parseInt(width[1]) <= 768;
    });

    if (!hasMobileBreakpoint) {
      checks.push({
        name: "Responsive Design",
        passed: false,
        score: 5,
        severity: "medium",
        message: "No mobile-specific breakpoints found (≤768px)",
      });
    } else {
      checks.push({
        name: "Responsive Design",
        passed: true,
        score: 15,
        severity: "pass",
        message: "Responsive design with mobile breakpoints detected",
      });
    }
  }

  // 4. Touch Target Sizes
  const buttonPaddingRegex = /button[^{]*\{[^}]*padding:\s*(\d+)px/gi;
  const buttonPaddings: number[] = [];

  while ((match = buttonPaddingRegex.exec(html)) !== null) {
    buttonPaddings.push(parseInt(match[1]));
  }

  const minPadding = buttonPaddings.length > 0 ? Math.min(...buttonPaddings) : 10;

  if (minPadding < 8) {
    checks.push({
      name: "Touch Target Size",
      passed: false,
      score: 0,
      severity: "medium",
      message: "Touch targets may be too small (recommend 44x44px minimum)",
    });
  } else {
    checks.push({
      name: "Touch Target Size",
      passed: true,
      score: 10,
      severity: "pass",
      message: "Touch targets appear adequately sized",
    });
  }

  // 5. Responsive Images
  const imgTags = html.match(/<img[^>]+>/gi) || [];
  const responsiveImages = imgTags.filter((img) =>
    /srcset=/i.test(img) || /sizes=/i.test(img) || /loading=["']lazy["']/i.test(img)
  ).length;

  const responsivePercentage = imgTags.length > 0
    ? (responsiveImages / imgTags.length) * 100
    : 100;

  if (responsivePercentage < 50) {
    checks.push({
      name: "Responsive Images",
      passed: false,
      score: 0,
      severity: "medium",
      message: `Only ${Math.round(responsivePercentage)}% of images use responsive attributes`,
      details: "Use srcset and sizes attributes for responsive images",
    });
  } else if (responsivePercentage < 80) {
    checks.push({
      name: "Responsive Images",
      passed: false,
      score: 5,
      severity: "low",
      message: `${Math.round(responsivePercentage)}% of images use responsive attributes`,
    });
  } else {
    checks.push({
      name: "Responsive Images",
      passed: true,
      score: 10,
      severity: "pass",
      message: "Most images use responsive attributes",
    });
  }

  // 6. Fixed Width Elements
  const fixedWidthRegex = /width:\s*(\d{3,})px(?![^}]*@media)/gi;
  const fixedWidths: number[] = [];

  while ((match = fixedWidthRegex.exec(html)) !== null) {
    fixedWidths.push(parseInt(match[1]));
  }

  const hasWideFixedWidths = fixedWidths.some((w) => w > 768);

  if (hasWideFixedWidths) {
    checks.push({
      name: "Fixed Width Elements",
      passed: false,
      score: 0,
      severity: "high",
      message: "Fixed-width elements wider than mobile screens detected",
      details: "Use percentage or max-width instead of fixed widths",
    });
  } else {
    checks.push({
      name: "Fixed Width Elements",
      passed: true,
      score: 10,
      severity: "pass",
      message: "No problematic fixed-width elements detected",
    });
  }

  // 7. Horizontal Scrolling
  const overflowX = /overflow-x:\s*scroll/i.test(html);

  if (overflowX) {
    checks.push({
      name: "Horizontal Scrolling",
      passed: false,
      score: 0,
      severity: "low",
      message: "Horizontal scrolling detected (overflow-x: scroll)",
      details: "Avoid horizontal scrolling on mobile",
    });
  } else {
    checks.push({
      name: "Horizontal Scrolling",
      passed: true,
      score: 5,
      severity: "pass",
      message: "No horizontal scrolling detected",
    });
  }

  // 8. Mobile-Friendly Navigation
  const hasHamburgerMenu = /<button[^>]*class=["'][^"']*(?:menu|hamburger|nav-toggle)[^"']*["']/i.test(html);
  const hasAccordion = /<[^>]+(?:accordion|collaps)/i.test(html);

  if (!hasHamburgerMenu && !hasAccordion) {
    checks.push({
      name: "Mobile Navigation",
      passed: false,
      score: 0,
      severity: "medium",
      message: "No mobile-friendly navigation pattern detected",
      details: "Consider adding hamburger menu or collapsible navigation",
    });
  } else {
    checks.push({
      name: "Mobile Navigation",
      passed: true,
      score: 10,
      severity: "pass",
      message: "Mobile-friendly navigation detected",
    });
  }

  // 9. Flash/Plugins
  const hasFlash = /<object[^>]+type=["']application\/x-shockwave-flash["']/i.test(html);

  if (hasFlash) {
    checks.push({
      name: "Flash Content",
      passed: false,
      score: 0,
      severity: "high",
      message: "Flash content detected - not supported on mobile",
    });
  } else {
    checks.push({
      name: "Flash Content",
      passed: true,
      score: 5,
      severity: "pass",
      message: "No Flash content detected",
    });
  }

  // 10. Form Elements
  const inputTags = html.match(/<input[^>]+>/gi) || [];
  const mobileOptimizedInputs = inputTags.filter((input) =>
    /type=["'](?:tel|email|number|date)["']/i.test(input)
  ).length;

  if (inputTags.length > 0) {
    const mobileInputPercentage = (mobileOptimizedInputs / inputTags.length) * 100;

    if (mobileInputPercentage < 50) {
      checks.push({
        name: "Mobile Form Inputs",
        passed: false,
        score: 0,
        severity: "low",
        message: "Form inputs could use mobile-specific types (tel, email, etc.)",
      });
    } else {
      checks.push({
        name: "Mobile Form Inputs",
        passed: true,
        score: 5,
        severity: "pass",
        message: "Form inputs use mobile-friendly input types",
      });
    }
  }

  // Calculate overall score
  const maxScore = 100;
  const overallScore = Math.round(
    checks.reduce((sum, check) => sum + check.score, 0)
  );

  // Calculate grade
  let grade: "A" | "B" | "C" | "D" | "F";
  if (overallScore >= 85) grade = "A";
  else if (overallScore >= 70) grade = "B";
  else if (overallScore >= 55) grade = "C";
  else if (overallScore >= 40) grade = "D";
  else grade = "F";

  // Count issues by severity
  const highIssues = checks.filter((c) => c.severity === "high").length;
  const mediumIssues = checks.filter((c) => c.severity === "medium").length;
  const lowIssues = checks.filter((c) => c.severity === "low").length;
  const totalIssues = highIssues + mediumIssues + lowIssues;

  return {
    url,
    checks,
    overallScore,
    grade,
    totalIssues,
    highIssues,
    mediumIssues,
    lowIssues,
  };
}
