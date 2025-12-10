import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SecurityCheck {
  name: string;
  present: boolean;
  value: string | null;
  score: number;
  severity: "pass" | "low" | "medium" | "high" | "critical";
  message: string;
  recommendation?: string;
}

interface SecurityAnalysis {
  url: string;
  protocol: string;
  isHttps: boolean;
  checks: SecurityCheck[];
  overallScore: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  totalIssues: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    console.log(`Checking security headers for ${url}...`);

    const analysis = await analyzeSecurityHeaders(url);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save to database
    const { data: savedAnalysis, error: saveError } = await supabase
      .from("seo_security_analysis")
      .insert({
        url: analysis.url,
        protocol: analysis.protocol,
        is_https: analysis.isHttps,
        overall_score: analysis.overallScore,
        grade: analysis.grade,
        total_issues: analysis.totalIssues,
        critical_issues: analysis.criticalIssues,
        high_issues: analysis.highIssues,
        medium_issues: analysis.mediumIssues,
        low_issues: analysis.lowIssues,
        security_checks: JSON.stringify(analysis.checks),
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save security analysis:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...analysis,
          analysisId: savedAnalysis?.id,
        },
        message: `Security analysis complete: Grade ${analysis.grade} (${analysis.overallScore}/100)`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-security-headers:", error);
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

async function analyzeSecurityHeaders(url: string): Promise<SecurityAnalysis> {
  const urlObj = new URL(url);
  const protocol = urlObj.protocol;
  const isHttps = protocol === "https:";

  // Fetch the page
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });

  const headers = response.headers;
  const checks: SecurityCheck[] = [];

  // 1. HTTPS Check
  if (!isHttps) {
    checks.push({
      name: "HTTPS",
      present: false,
      value: null,
      score: 0,
      severity: "critical",
      message: "Site is not using HTTPS",
      recommendation: "Enable HTTPS with a valid SSL/TLS certificate",
    });
  } else {
    checks.push({
      name: "HTTPS",
      present: true,
      value: "enabled",
      score: 15,
      severity: "pass",
      message: "HTTPS is enabled",
    });
  }

  // 2. Strict-Transport-Security (HSTS)
  const hsts = headers.get("strict-transport-security");
  if (!hsts && isHttps) {
    checks.push({
      name: "Strict-Transport-Security",
      present: false,
      value: null,
      score: 0,
      severity: "high",
      message: "HSTS header is missing",
      recommendation: "Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
    });
  } else if (hsts) {
    const maxAge = hsts.match(/max-age=(\d+)/);
    const includesSubDomains = hsts.includes("includeSubDomains");
    const preload = hsts.includes("preload");

    let score = 10;
    let severity: "pass" | "low" = "pass";
    let message = "HSTS is configured";

    if (maxAge && parseInt(maxAge[1]) < 31536000) {
      severity = "low";
      message = "HSTS max-age is less than 1 year";
      score = 7;
    }
    if (!includesSubDomains) {
      severity = "low";
      message = "HSTS doesn't include subdomains";
      score = Math.min(score, 7);
    }

    checks.push({
      name: "Strict-Transport-Security",
      present: true,
      value: hsts,
      score,
      severity,
      message,
    });
  }

  // 3. Content-Security-Policy
  const csp = headers.get("content-security-policy");
  if (!csp) {
    checks.push({
      name: "Content-Security-Policy",
      present: false,
      value: null,
      score: 0,
      severity: "medium",
      message: "CSP header is missing",
      recommendation: "Implement a Content Security Policy to prevent XSS attacks",
    });
  } else {
    checks.push({
      name: "Content-Security-Policy",
      present: true,
      value: csp.substring(0, 100) + (csp.length > 100 ? "..." : ""),
      score: 15,
      severity: "pass",
      message: "CSP is configured",
    });
  }

  // 4. X-Frame-Options
  const xFrameOptions = headers.get("x-frame-options");
  if (!xFrameOptions) {
    checks.push({
      name: "X-Frame-Options",
      present: false,
      value: null,
      score: 0,
      severity: "medium",
      message: "X-Frame-Options header is missing",
      recommendation: "Add: X-Frame-Options: DENY or SAMEORIGIN",
    });
  } else {
    checks.push({
      name: "X-Frame-Options",
      present: true,
      value: xFrameOptions,
      score: 10,
      severity: "pass",
      message: "X-Frame-Options is set",
    });
  }

  // 5. X-Content-Type-Options
  const xContentTypeOptions = headers.get("x-content-type-options");
  if (!xContentTypeOptions || xContentTypeOptions !== "nosniff") {
    checks.push({
      name: "X-Content-Type-Options",
      present: false,
      value: xContentTypeOptions,
      score: 0,
      severity: "low",
      message: "X-Content-Type-Options is missing or incorrect",
      recommendation: "Add: X-Content-Type-Options: nosniff",
    });
  } else {
    checks.push({
      name: "X-Content-Type-Options",
      present: true,
      value: xContentTypeOptions,
      score: 10,
      severity: "pass",
      message: "X-Content-Type-Options is set correctly",
    });
  }

  // 6. Referrer-Policy
  const referrerPolicy = headers.get("referrer-policy");
  if (!referrerPolicy) {
    checks.push({
      name: "Referrer-Policy",
      present: false,
      value: null,
      score: 0,
      severity: "low",
      message: "Referrer-Policy header is missing",
      recommendation: "Add: Referrer-Policy: strict-origin-when-cross-origin",
    });
  } else {
    checks.push({
      name: "Referrer-Policy",
      present: true,
      value: referrerPolicy,
      score: 10,
      severity: "pass",
      message: "Referrer-Policy is set",
    });
  }

  // 7. Permissions-Policy (formerly Feature-Policy)
  const permissionsPolicy = headers.get("permissions-policy") || headers.get("feature-policy");
  if (!permissionsPolicy) {
    checks.push({
      name: "Permissions-Policy",
      present: false,
      value: null,
      score: 0,
      severity: "low",
      message: "Permissions-Policy header is missing",
      recommendation: "Add: Permissions-Policy to control browser features",
    });
  } else {
    checks.push({
      name: "Permissions-Policy",
      present: true,
      value: permissionsPolicy.substring(0, 100) + (permissionsPolicy.length > 100 ? "..." : ""),
      score: 10,
      severity: "pass",
      message: "Permissions-Policy is set",
    });
  }

  // 8. X-XSS-Protection (legacy, but still good to check)
  const xssProtection = headers.get("x-xss-protection");
  if (xssProtection === "0") {
    checks.push({
      name: "X-XSS-Protection",
      present: true,
      value: xssProtection,
      score: 5,
      severity: "pass",
      message: "X-XSS-Protection disabled (recommended if CSP is strong)",
    });
  } else if (!xssProtection) {
    checks.push({
      name: "X-XSS-Protection",
      present: false,
      value: null,
      score: 0,
      severity: "low",
      message: "X-XSS-Protection header is missing",
      recommendation: "Add: X-XSS-Protection: 1; mode=block (or 0 if using CSP)",
    });
  } else {
    checks.push({
      name: "X-XSS-Protection",
      present: true,
      value: xssProtection,
      score: 5,
      severity: "pass",
      message: "X-XSS-Protection is enabled",
    });
  }

  // 9. Check for sensitive headers that shouldn't be exposed
  const serverHeader = headers.get("server");
  const xPoweredBy = headers.get("x-powered-by");

  if (serverHeader && serverHeader !== "cloudflare") {
    checks.push({
      name: "Server Header Disclosure",
      present: true,
      value: serverHeader,
      score: 0,
      severity: "low",
      message: "Server header exposes server information",
      recommendation: "Remove or obfuscate Server header",
    });
  }

  if (xPoweredBy) {
    checks.push({
      name: "X-Powered-By Disclosure",
      present: true,
      value: xPoweredBy,
      score: 0,
      severity: "low",
      message: "X-Powered-By header exposes technology stack",
      recommendation: "Remove X-Powered-By header",
    });
  }

  // Calculate overall score
  const maxScore = 100;
  const overallScore = Math.round(
    checks.reduce((sum, check) => sum + check.score, 0)
  );

  // Calculate grade
  let grade: "A+" | "A" | "B" | "C" | "D" | "F";
  if (overallScore >= 95) grade = "A+";
  else if (overallScore >= 85) grade = "A";
  else if (overallScore >= 70) grade = "B";
  else if (overallScore >= 50) grade = "C";
  else if (overallScore >= 30) grade = "D";
  else grade = "F";

  // Count issues by severity
  const criticalIssues = checks.filter((c) => c.severity === "critical").length;
  const highIssues = checks.filter((c) => c.severity === "high").length;
  const mediumIssues = checks.filter((c) => c.severity === "medium").length;
  const lowIssues = checks.filter((c) => c.severity === "low").length;
  const totalIssues = criticalIssues + highIssues + mediumIssues + lowIssues;

  return {
    url,
    protocol,
    isHttps,
    checks,
    overallScore,
    grade,
    totalIssues,
    criticalIssues,
    highIssues,
    mediumIssues,
    lowIssues,
  };
}
