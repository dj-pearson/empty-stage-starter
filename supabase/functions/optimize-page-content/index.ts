import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { requireAdmin } from '../_shared/require-admin.ts';
import { meterAdminRequest, rejectNonPost } from '../_shared/ai-gate.ts';
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';
import { fetchRecipePage } from '../_shared/url-validator.ts';
import { extractTextContent } from '../_shared/htmlText.ts';
import { PublicError, publicMessage, publicStatus } from '../_shared/errors.ts';
import { parseModelJsonObject, parsePageOptimizationRequest } from '../_shared/seoContentRequest.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function extractElements(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "gi");
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    matches.push(match[1].trim());
  }
  return matches;
}

function extractMetaTag(html: string, property: string): string {
  const metaRegex = new RegExp(
    `<meta[^>]*(?:name|property)=["']${property}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i"
  );
  const match = html.match(metaRegex);
  return match ? match[1] : "";
}

interface CompetitorSummary {
  url: string;
  wordCount: number;
  h2Topics: string[];
  h3Topics: string[];
}

/** One competitor page, fetched under the SSRF guards; null on any failure. */
async function summarizeCompetitor(compUrl: string): Promise<CompetitorSummary | null> {
  try {
    const page = await fetchRecipePage(compUrl);
    if (!page.ok) {
      console.error(`Failed to fetch competitor ${compUrl}: ${page.status} ${page.error}`);
      return null;
    }
    const compText = extractTextContent(page.html);
    return {
      url: compUrl,
      wordCount: (compText.match(/\b\w+\b/g) || []).length,
      h2Topics: extractElements(page.html, "h2"),
      h3Topics: extractElements(page.html, "h3"),
    };
  } catch (e) {
    console.error(`Failed to fetch competitor ${compUrl}:`, e);
    return null;
  }
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // US-618: this endpoint spends model tokens and the runtime is
  // --no-verify-jwt, so in-function auth is the only gate.
  const notPost = rejectNonPost(req, corsHeaders);
  if (notPost) return notPost;

  // Admin-only: the sole caller is src/components/admin/ContentOptimizer.tsx
  // (the SEO tab of the admin dashboard). requireAdmin also admits the
  // service-role key for server-to-server callers.
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(
      JSON.stringify({ error: gate.error ?? 'Unauthorized' }),
      { status: gate.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // US-870: the budget the rate_limit_config rows describe and nothing in
  // the deployed tree enforced. Skipped for service-role callers.
  const limited = await meterAdminRequest(gate, 'optimize-page-content', corsHeaders);
  if (limited) return limited;

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      throw new PublicError("Request body must be valid JSON");
    }
    const parsed = parsePageOptimizationRequest(rawBody);
    if (!parsed.ok) throw new PublicError(parsed.error);
    const { url, targetKeyword, competitorUrls, includeContentGapAnalysis } = parsed.value;

    // requireAdmin hands back its service-role client on success.
    const supabase = gate.admin;
    if (!supabase) throw new Error("requireAdmin returned no client");

    console.log(`Optimizing content for ${url}...`);

    // Fetch the target page under the same SSRF guards as the recipe
    // importers: https only, public hosts only, capped size.
    const page = await fetchRecipePage(url);
    if (!page.ok) {
      console.error(`Failed to fetch ${url}: ${page.status} ${page.error}`);
      throw new PublicError("Could not fetch the page to optimize", page.status);
    }
    const html = page.html;

    // Extract content elements
    const text = extractTextContent(html);
    const title = extractMetaTag(html, "title") || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
    const metaDescription = extractMetaTag(html, "description");
    const h1Elements = extractElements(html, "h1");
    const h2Elements = extractElements(html, "h2");
    const h3Elements = extractElements(html, "h3");

    const words = text.match(/\b\w+\b/g) || [];
    const wordCount = words.length;

    // Centralized AI configuration: provider, model and API key come from
    // the environment, as for every other AIServiceV2 caller.
    const aiService = new AIServiceV2();

    // Prepare competitor analysis data (if requested). The parser already
    // capped the list at three.
    let competitorData = "";
    if (includeContentGapAnalysis && competitorUrls.length > 0) {
      console.log("Analyzing competitor content...");
      const competitors = (await Promise.all(competitorUrls.map(summarizeCompetitor))).filter(
        (c): c is CompetitorSummary => c !== null,
      );

      if (competitors.length > 0) {
        competitorData = `\n\nCOMPETITOR ANALYSIS:\n${competitors
          .map(
            (c, i) =>
              `Competitor ${i + 1}:\n- Word Count: ${c.wordCount}\n- H2 Topics: ${c.h2Topics.join(", ")}\n- H3 Topics: ${c.h3Topics.join(", ")}`
          )
          .join("\n\n")}`;
      }
    }

    // Create comprehensive AI prompt for content optimization
    const systemPrompt = `You are an expert SEO content optimizer with deep knowledge of on-page SEO, content strategy, and user engagement optimization.

Your task is to analyze web page content and provide SPECIFIC, ACTIONABLE optimization suggestions with concrete before/after examples.

Focus on:
1. Title tag optimization (50-60 characters, keyword placement)
2. Meta description optimization (150-160 characters, compelling CTAs)
3. H1, H2, H3 heading improvements (structure, keywords, readability)
4. LSI (Latent Semantic Indexing) keywords for topic depth
5. Semantic keyword clusters for content relevance
6. Content structure improvements (sections to add/expand/remove)
7. Content gap analysis (missing topics compared to competitors)
8. Specific rewrite suggestions for key sections

IMPORTANT OUTPUT FORMAT:
Return valid JSON with the exact structure provided. Include specific before/after examples for all suggestions.`;

    const userPrompt = `Analyze this page content and provide comprehensive optimization suggestions:

URL: ${url}
TARGET KEYWORD: ${targetKeyword || "Not specified"}

CURRENT CONTENT:
- Title: ${title}
- Meta Description: ${metaDescription}
- H1: ${h1Elements.join(", ") || "None"}
- H2 Headings: ${h2Elements.length > 0 ? h2Elements.slice(0, 5).join(", ") : "None"}
- H3 Headings: ${h3Elements.length > 0 ? h3Elements.slice(0, 5).join(", ") : "None"}
- Word Count: ${wordCount}
- Content Sample: ${text.substring(0, 1000)}...
${competitorData}

Provide optimization suggestions in strict JSON format:
{
  "titleOptimization": {
    "current": "...",
    "suggested": "...",
    "reasoning": "..."
  },
  "metaDescriptionOptimization": {
    "current": "...",
    "suggested": "...",
    "reasoning": "..."
  },
  "headingOptimizations": [
    {
      "type": "h1|h2|h3",
      "current": "...",
      "suggested": "...",
      "reasoning": "..."
    }
  ],
  "lsiKeywords": [
    {
      "keyword": "...",
      "relevance": "high|medium|low",
      "placement": "..."
    }
  ],
  "semanticClusters": [
    {
      "cluster": "...",
      "keywords": ["...", "..."],
      "howToUse": "..."
    }
  ],
  "contentGaps": [
    {
      "topic": "...",
      "priority": "high|medium|low",
      "suggestedContent": "...",
      "placement": "..."
    }
  ],
  "structureImprovements": [
    {
      "type": "add|expand|rewrite|remove",
      "section": "...",
      "suggestion": "...",
      "priority": "high|medium|low"
    }
  ],
  "keyRewriteSuggestions": [
    {
      "section": "...",
      "currentText": "...",
      "suggestedText": "...",
      "improvement": "..."
    }
  ],
  "overallScore": 0-100,
  "priorityActions": ["...", "...", "..."]
}`;

    console.log("Calling AI API for content optimization...");

    const reply = await aiService.generateContent(
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 8000,
        temperature: 0.5,
      },
      "standard", // Content optimization is complex
    );
    const content = reply.content;

    if (!content) {
      throw new PublicError("No content received from AI", 502);
    }

    const optimizations = parseModelJsonObject(content);
    if (!optimizations) {
      console.error("Failed to parse AI response:", content.substring(0, 500));
      throw new PublicError("Failed to parse AI optimization suggestions", 502);
    }

    const suggestedOf = (key: string): string | null => {
      const section = optimizations[key];
      if (typeof section !== "object" || section === null) return null;
      const suggested = (section as Record<string, unknown>).suggested;
      return typeof suggested === "string" ? suggested : null;
    };
    const score = optimizations.overallScore;

    // Save optimization results to database
    const optimizationData = {
      page_url: url,
      target_keyword: targetKeyword,
      current_title: title,
      suggested_title: suggestedOf("titleOptimization"),
      current_meta_description: metaDescription,
      suggested_meta_description: suggestedOf("metaDescriptionOptimization"),
      heading_optimizations: JSON.stringify(
        optimizations.headingOptimizations ?? []
      ),
      lsi_keywords: JSON.stringify(optimizations.lsiKeywords ?? []),
      semantic_clusters: JSON.stringify(optimizations.semanticClusters ?? []),
      content_gaps: JSON.stringify(optimizations.contentGaps ?? []),
      structure_improvements: JSON.stringify(
        optimizations.structureImprovements ?? []
      ),
      key_rewrites: JSON.stringify(optimizations.keyRewriteSuggestions ?? []),
      overall_score: typeof score === "number" && Number.isFinite(score) ? score : 0,
      priority_actions: JSON.stringify(optimizations.priorityActions ?? []),
      competitor_urls: JSON.stringify(competitorUrls),
      analyzed_at: new Date().toISOString(),
    };

    const { data: insertedData, error: insertError } = await supabase
      .from("seo_content_optimization")
      .insert(optimizationData)
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(
        `Failed to save optimization results: ${insertError.message}`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url,
          optimizations,
          id: insertedData.id,
        },
        message: "Content optimization completed successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error in optimize-page-content:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: publicMessage(error),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: publicStatus(error),
      }
    );
  }
}
