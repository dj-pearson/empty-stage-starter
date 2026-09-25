import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { requireAdmin } from '../_shared/require-admin.ts';
import { meterAdminRequest, rejectNonPost } from '../_shared/ai-gate.ts';
import { AIServiceV2 } from '../_shared/ai-service-v2.ts';
import { fetchRecipePage } from '../_shared/url-validator.ts';
import { extractTextContent } from '../_shared/htmlText.ts';
import { PublicError, publicMessage, publicStatus } from '../_shared/errors.ts';
import { parseModelJsonObject, parseSemanticKeywordsRequest } from '../_shared/seoContentRequest.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  const limited = await meterAdminRequest(gate, 'analyze-semantic-keywords', corsHeaders);
  if (limited) return limited;

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      throw new PublicError("Request body must be valid JSON");
    }
    const parsed = parseSemanticKeywordsRequest(rawBody);
    if (!parsed.ok) throw new PublicError(parsed.error);
    const { url, targetKeyword, contentText } = parsed.value;

    // requireAdmin hands back its service-role client on success.
    const supabase = gate.admin;
    if (!supabase) throw new Error("requireAdmin returned no client");

    console.log(`Analyzing semantic keywords...`);

    let text = contentText ?? "";

    // Fetch the page if no content was pasted. Same SSRF guards as the
    // recipe importers: https only, public hosts only, capped size.
    if (url && !contentText) {
      const page = await fetchRecipePage(url);
      if (!page.ok) {
        console.error(`Failed to fetch ${url}: ${page.status} ${page.error}`);
        throw new PublicError("Could not fetch the page to analyze", page.status);
      }
      text = extractTextContent(page.html);
    }

    // Centralized AI configuration: provider, model and API key come from
    // the environment, as for every other AIServiceV2 caller.
    const aiService = new AIServiceV2();

    const systemPrompt = `You are an expert SEO analyst specializing in semantic SEO, LSI (Latent Semantic Indexing) keywords, and entity extraction.

Analyze content and identify:
1. LSI Keywords - semantically related terms that add context and depth
2. Entity Extraction - important people, places, organizations, concepts
3. Topic Clusters - groups of related concepts
4. Semantic Gaps - missing related terms that should be included
5. Search Intent Signals - what the content reveals about user intent

Provide actionable keyword suggestions that will improve topical relevance and SEO.`;

    const userPrompt = `Analyze this content for semantic keywords and entities:

${targetKeyword ? `TARGET KEYWORD: ${targetKeyword}\n\n` : ""}CONTENT (first 2000 characters):
${text.substring(0, 2000)}...

Return valid JSON with this exact structure:
{
  "lsiKeywords": [
    {
      "keyword": "specific keyword phrase",
      "relevance": "high|medium|low",
      "currentMentions": 0,
      "suggestedMentions": 2,
      "context": "where and how to use this keyword"
    }
  ],
  "entities": [
    {
      "entity": "entity name",
      "type": "person|place|organization|concept|product",
      "importance": "high|medium|low",
      "currentMentions": 0,
      "suggestion": "how to incorporate this entity"
    }
  ],
  "topicClusters": [
    {
      "cluster": "cluster name",
      "keywords": ["keyword1", "keyword2"],
      "coverage": "covered|partially-covered|missing",
      "suggestion": "how to improve coverage"
    }
  ],
  "semanticGaps": [
    {
      "missingTerm": "term that should be included",
      "reason": "why this term is important",
      "priority": "high|medium|low",
      "howToInclude": "specific suggestion"
    }
  ],
  "intentSignals": {
    "primaryIntent": "informational|commercial|transactional|navigational",
    "confidence": "high|medium|low",
    "intentKeywords": ["keyword1", "keyword2"],
    "optimizationTips": ["tip1", "tip2"]
  },
  "overallSemanticScore": 0-100,
  "topRecommendations": ["rec1", "rec2", "rec3"]
}`;

    console.log("Calling AI API for semantic analysis...");

    const reply = await aiService.generateContent(
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 4000,
        temperature: 0.3,
      },
      "lightweight", // Semantic analysis is fast
    );
    const content = reply.content;

    if (!content) {
      throw new PublicError("No content received from AI", 502);
    }

    const semanticAnalysis = parseModelJsonObject(content);
    if (!semanticAnalysis) {
      console.error("Failed to parse AI response:", content.substring(0, 500));
      throw new PublicError("Failed to parse semantic analysis", 502);
    }

    const score = semanticAnalysis.overallSemanticScore;

    // Save semantic analysis to database
    const analysisData = {
      page_url: url,
      target_keyword: targetKeyword,
      lsi_keywords: JSON.stringify(semanticAnalysis.lsiKeywords ?? []),
      entities: JSON.stringify(semanticAnalysis.entities ?? []),
      topic_clusters: JSON.stringify(semanticAnalysis.topicClusters ?? []),
      semantic_gaps: JSON.stringify(semanticAnalysis.semanticGaps ?? []),
      intent_signals: JSON.stringify(semanticAnalysis.intentSignals ?? {}),
      semantic_score: typeof score === "number" && Number.isFinite(score) ? score : 0,
      top_recommendations: JSON.stringify(
        semanticAnalysis.topRecommendations ?? []
      ),
      analyzed_at: new Date().toISOString(),
    };

    const { data: insertedData, error: insertError } = await supabase
      .from("seo_semantic_analysis")
      .insert(analysisData)
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(
        `Failed to save semantic analysis: ${insertError.message}`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url: url || "content",
          analysis: semanticAnalysis,
          id: insertedData.id,
        },
        message: "Semantic analysis completed successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error in analyze-semantic-keywords:", error);
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
