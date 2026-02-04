import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function extractTextContent(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

  if (mainMatch) {
    text = mainMatch[1];
  } else if (articleMatch) {
    text = articleMatch[1];
  }

  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  text = text.replace(/\s+/g, " ").trim();
  return text;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, targetKeyword, contentText } = await req.json();

    if (!url && !contentText) {
      throw new Error("Either URL or contentText is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Analyzing semantic keywords...`);

    let text = contentText;

    // Fetch the page if URL is provided
    if (url && !contentText) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch page: ${response.status}`);
      }

      const html = await response.text();
      text = extractTextContent(html);
    }

    // Get AI model configuration
    const { data: aiModel } = await supabase
      .from("ai_settings")
      .select("*")
      .eq("is_active", true)
      .single();

    const modelConfig = aiModel || {
      model_name: "gpt-4o-mini",
      endpoint_url: "https://api.openai.com/v1/chat/completions",
      api_key_env_var: "OPENAI_API_KEY",
      auth_type: "bearer",
      temperature: 0.3,
      max_tokens: 2000,
    };

    const apiKey = Deno.env.get(modelConfig.api_key_env_var);
    if (!apiKey) {
      throw new Error(
        `API key not configured. Please set ${modelConfig.api_key_env_var}`
      );
    }

    // Create AI prompt for semantic analysis
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

    // Build API request
    const authHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const isAnthropic = modelConfig.endpoint_url.includes("anthropic.com");

    if (isAnthropic) {
      authHeaders["anthropic-version"] = "2023-06-01";
    }

    if (modelConfig.auth_type === "x-api-key") {
      authHeaders["x-api-key"] = apiKey;
    } else if (modelConfig.auth_type === "bearer") {
      authHeaders["Authorization"] = `Bearer ${apiKey}`;
    } else if (modelConfig.auth_type === "api-key") {
      authHeaders["api-key"] = apiKey;
    }

    let requestBody: any;
    if (isAnthropic) {
      requestBody = {
        model: modelConfig.model_name,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        max_tokens: 4000,
        temperature: 0.3,
      };
    } else {
      requestBody = {
        model: modelConfig.model_name,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      };
    }

    console.log("Calling AI API for semantic analysis...");

    const aiResponse = await fetch(modelConfig.endpoint_url, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI API error: ${errorText}`);
    }

    const aiData = await aiResponse.json();

    let content = "";
    if (aiData.content && Array.isArray(aiData.content)) {
      content = aiData.content.find((c: any) => c.type === "text")?.text || "";
    } else if (aiData.choices && aiData.choices[0]?.message?.content) {
      content = aiData.choices[0].message.content;
    }

    if (!content) {
      throw new Error("No content received from AI");
    }

    // Parse AI response
    let sanitized = content.trim();
    if (sanitized.startsWith("```")) {
      sanitized = sanitized
        .replace(/^```(?:json|JSON)?\n?/, "")
        .replace(/```$/, "")
        .trim();
    }

    let semanticAnalysis;
    try {
      const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");
        semanticAnalysis = JSON.parse(jsonStr);
      } else {
        semanticAnalysis = JSON.parse(sanitized);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      console.error("Raw content:", sanitized.substring(0, 500));
      throw new Error("Failed to parse semantic analysis");
    }

    // Save semantic analysis to database
    const analysisData = {
      page_url: url || null,
      target_keyword: targetKeyword || null,
      lsi_keywords: JSON.stringify(semanticAnalysis.lsiKeywords || []),
      entities: JSON.stringify(semanticAnalysis.entities || []),
      topic_clusters: JSON.stringify(semanticAnalysis.topicClusters || []),
      semantic_gaps: JSON.stringify(semanticAnalysis.semanticGaps || []),
      intent_signals: JSON.stringify(semanticAnalysis.intentSignals || {}),
      semantic_score: semanticAnalysis.overallSemanticScore || 0,
      top_recommendations: JSON.stringify(
        semanticAnalysis.topRecommendations || []
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
  } catch (error: any) {
    console.error("Error in analyze-semantic-keywords:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
}
