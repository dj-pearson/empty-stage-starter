// =====================================================
// APPLY SEO FIXES - EDGE FUNCTION
// =====================================================
// Automatically applies SEO fixes based on audit results
// Can apply fixes to database, generate recommendations,
// and track changes over time.
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AuditResult {
  category: string;
  item: string;
  status: "passed" | "warning" | "failed" | "info";
  message: string;
  impact: "high" | "medium" | "low";
  fix?: string;
}

interface ApplyFixRequest {
  auditResults: AuditResult[];
  auditId?: string;
  autoApply?: boolean;
  userId?: string;
}

interface FixSuggestion {
  category: string;
  item: string;
  issue: string;
  fix: string;
  fixType: "database_update" | "file_update" | "code_change" | "manual";
  impact: string;
  canAutoApply: boolean;
  databaseChanges?: {
    table: string;
    field: string;
    oldValue?: string;
    newValue: string;
    condition?: Record<string, any>;
  };
  aiConfidence?: number;
  priority: number;
}

export default async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { auditResults, auditId, autoApply = false, userId } = await req.json() as ApplyFixRequest;

    if (!auditResults || auditResults.length === 0) {
      return new Response(
        JSON.stringify({ error: "No audit results provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate fix suggestions
    const fixSuggestions: FixSuggestion[] = [];

    for (const result of auditResults) {
      if (result.status === "passed" || result.status === "info") {
        continue; // Skip passed and info items
      }

      const suggestion = await generateFixSuggestion(result);
      if (suggestion) {
        fixSuggestions.push(suggestion);
      }
    }

    // Sort by priority (high impact first)
    fixSuggestions.sort((a, b) => b.priority - a.priority);

    const appliedFixes: any[] = [];
    const failedFixes: any[] = [];

    // Apply fixes if autoApply is enabled
    if (autoApply) {
      for (const suggestion of fixSuggestions) {
        if (suggestion.canAutoApply && suggestion.fixType === "database_update") {
          try {
            const result = await applyDatabaseFix(supabaseClient, suggestion);

            // Log the applied fix
            await supabaseClient
              .from("seo_fixes_applied")
              .insert({
                audit_id: auditId,
                issue_category: suggestion.category,
                issue_item: suggestion.item,
                issue_description: suggestion.issue,
                fix_description: suggestion.fix,
                fix_type: "automatic",
                fix_status: "applied",
                impact_level: suggestion.impact,
                changes_made: suggestion.databaseChanges,
                ai_confidence: suggestion.aiConfidence,
                applied_by_user_id: userId,
                applied_via: "api",
              });

            appliedFixes.push({
              ...suggestion,
              appliedAt: new Date().toISOString(),
              result,
            });
          } catch (error: any) {
            console.error(`Failed to apply fix for ${suggestion.item}:`, error);
            failedFixes.push({
              ...suggestion,
              error: error.message,
            });
          }
        }
      }
    }

    // Return results
    return new Response(
      JSON.stringify({
        success: true,
        totalSuggestions: fixSuggestions.length,
        autoApplyEnabled: autoApply,
        appliedFixes: appliedFixes.length,
        failedFixes: failedFixes.length,
        suggestions: fixSuggestions,
        applied: appliedFixes,
        failed: failedFixes,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in apply-seo-fixes:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function generateFixSuggestion(result: AuditResult): Promise<FixSuggestion | null> {
  const { category, item, message, impact, fix } = result;

  // Priority scoring: high=3, medium=2, low=1
  const impactScore = impact === "high" ? 3 : impact === "medium" ? 2 : 1;

  // Determine fix type and auto-apply capability based on the issue
  const suggestion: FixSuggestion = {
    category,
    item,
    issue: message,
    fix: fix || "Manual review required",
    fixType: "manual",
    impact,
    canAutoApply: false,
    priority: impactScore * 100,
  };

  // Meta Description Fixes
  if (item === "Meta Description" && message.includes("Missing")) {
    suggestion.fixType = "database_update";
    suggestion.canAutoApply = true;
    suggestion.databaseChanges = {
      table: "seo_settings",
      field: "description",
      newValue: "Plan weekly meals for picky eaters with safe foods and daily try bites. Auto-generate grocery lists and track meal results with EatPal.",
      condition: { id: "00000000-0000-0000-0000-000000000001" },
    };
    suggestion.aiConfidence = 85;
  } else if (item === "Meta Description" && message.includes("should be 120-160")) {
    suggestion.fixType = "database_update";
    suggestion.canAutoApply = true;
    // AI would optimize this, for now use a default optimized version
    suggestion.databaseChanges = {
      table: "seo_settings",
      field: "description",
      newValue: "Plan weekly meals for picky eaters with safe foods and daily try bites. Auto-generate grocery lists and track meal results with EatPal's intuitive meal planning app.",
      condition: { id: "00000000-0000-0000-0000-000000000001" },
    };
    suggestion.aiConfidence = 80;
  }

  // Open Graph Fixes
  else if (item === "Open Graph" && message.includes("Missing")) {
    suggestion.fixType = "database_update";
    suggestion.canAutoApply = true;
    const missing = extractMissingOGTags(message);
    suggestion.databaseChanges = {
      table: "seo_settings",
      field: "og_title", // Would need to handle multiple fields
      newValue: "EatPal - Picky Eater Solutions",
      condition: { id: "00000000-0000-0000-0000-000000000001" },
    };
    suggestion.aiConfidence = 90;
  }

  // Twitter Card Fixes
  else if (item === "Twitter Cards" && message.includes("Missing")) {
    suggestion.fixType = "database_update";
    suggestion.canAutoApply = true;
    suggestion.databaseChanges = {
      table: "seo_settings",
      field: "twitter_card",
      newValue: "summary_large_image",
      condition: { id: "00000000-0000-0000-0000-000000000001" },
    };
    suggestion.aiConfidence = 95;
  }

  // Canonical URL
  else if (item === "Canonical URL" && message.includes("Missing")) {
    suggestion.fixType = "code_change";
    suggestion.fix = "Add <link rel=\"canonical\" href=\"{{CURRENT_URL}}\" /> to the <head> section of your pages";
    suggestion.canAutoApply = false;
  }

  // Structured Data
  else if (item === "Structured Data" && message.includes("No structured data")) {
    suggestion.fixType = "database_update";
    suggestion.canAutoApply = true;
    suggestion.databaseChanges = {
      table: "seo_settings",
      field: "structured_data",
      newValue: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "EatPal",
        "applicationCategory": "LifestyleApplication",
        "operatingSystem": "Web Browser",
        "description": "Meal planning application for parents of picky eaters",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        }
      }),
      condition: { id: "00000000-0000-0000-0000-000000000001" },
    };
    suggestion.aiConfidence = 85;
  }

  // Image Alt Text
  else if (item === "Image Alt Text") {
    suggestion.fixType = "manual";
    suggestion.fix = "Add descriptive alt text to all images. Use the format: 'Description of image content for accessibility and SEO'";
    suggestion.canAutoApply = false;
  }

  // robots.txt
  else if (message.includes("robots")) {
    suggestion.fixType = "file_update";
    suggestion.fix = "Update robots.txt file in /public directory";
    suggestion.canAutoApply = false;
  }

  return suggestion;
}

function extractMissingOGTags(message: string): string[] {
  const match = message.match(/Missing Open Graph tags: (.+)/);
  if (match) {
    return match[1].split(", ");
  }
  return [];
}

async function applyDatabaseFix(
  supabaseClient: any,
  suggestion: FixSuggestion
): Promise<any> {
  if (!suggestion.databaseChanges) {
    throw new Error("No database changes defined");
  }

  const { table, field, newValue, condition } = suggestion.databaseChanges;

  // Build the update query
  let query = supabaseClient
    .from(table)
    .update({ [field]: newValue });

  // Apply conditions
  if (condition) {
    for (const [key, value] of Object.entries(condition)) {
      query = query.eq(key, value);
    }
  }

  const { data, error } = await query.select();

  if (error) {
    throw error;
  }

  return data;
}

// =====================================================
// AI-POWERED FIX GENERATION (Future Enhancement)
// =====================================================
// This would integrate with OpenAI or Anthropic to generate
// intelligent, context-aware SEO fixes based on:
// - Current content analysis
// - Competitor analysis
// - Industry best practices
// - Historical performance data
// =====================================================
