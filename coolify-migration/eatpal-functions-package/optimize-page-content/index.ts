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

function extractElements(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, "gi");
  const matches = [];
  let match;
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

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      url,
      targetKeyword,
      competitorUrls = [],
      includeContentGapAnalysis = true,
    } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Optimizing content for ${url}...`);

    // Fetch the target page
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();

    // Extract content elements
    const text = extractTextContent(html);
    const title = extractMetaTag(html, "title") || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
    const metaDescription = extractMetaTag(html, "description");
    const h1Elements = extractElements(html, "h1");
    const h2Elements = extractElements(html, "h2");
    const h3Elements = extractElements(html, "h3");

    const words = text.match(/\b\w+\b/g) || [];
    const wordCount = words.length;

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
      temperature: 0.7,
      max_tokens: 4000,
    };

    const apiKey = Deno.env.get(modelConfig.api_key_env_var);
    if (!apiKey) {
      throw new Error(
        `API key not configured. Please set ${modelConfig.api_key_env_var}`
      );
    }

    // Prepare competitor analysis data (if requested)
    let competitorData = "";
    if (includeContentGapAnalysis && competitorUrls.length > 0) {
      console.log("Analyzing competitor content...");
      const competitorPromises = competitorUrls.slice(0, 3).map(async (compUrl: string) => {
        try {
          const compResponse = await fetch(compUrl);
          if (!compResponse.ok) return null;

          const compHtml = await compResponse.text();
          const compText = extractTextContent(compHtml);
          const compH2s = extractElements(compHtml, "h2");
          const compH3s = extractElements(compHtml, "h3");

          return {
            url: compUrl,
            wordCount: (compText.match(/\b\w+\b/g) || []).length,
            h2Topics: compH2s,
            h3Topics: compH3s,
            contentSample: compText.substring(0, 500),
          };
        } catch (e) {
          console.error(`Failed to fetch competitor ${compUrl}:`, e);
          return null;
        }
      });

      const competitors = (await Promise.all(competitorPromises)).filter(Boolean);

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
        max_tokens: modelConfig.max_tokens || 8000,
        temperature: 0.5,
      };
    } else {
      requestBody = {
        model: modelConfig.model_name,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
      };

      if (modelConfig.max_tokens) {
        requestBody.max_tokens = modelConfig.max_tokens;
      }
    }

    console.log("Calling AI API for content optimization...");

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

    let optimizations;
    try {
      const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");
        optimizations = JSON.parse(jsonStr);
      } else {
        optimizations = JSON.parse(sanitized);
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      console.error("Raw content:", sanitized.substring(0, 500));
      throw new Error("Failed to parse AI optimization suggestions");
    }

    // Save optimization results to database
    const optimizationData = {
      page_url: url,
      target_keyword: targetKeyword,
      current_title: title,
      suggested_title: optimizations.titleOptimization?.suggested || null,
      current_meta_description: metaDescription,
      suggested_meta_description:
        optimizations.metaDescriptionOptimization?.suggested || null,
      heading_optimizations: JSON.stringify(
        optimizations.headingOptimizations || []
      ),
      lsi_keywords: JSON.stringify(optimizations.lsiKeywords || []),
      semantic_clusters: JSON.stringify(optimizations.semanticClusters || []),
      content_gaps: JSON.stringify(optimizations.contentGaps || []),
      structure_improvements: JSON.stringify(
        optimizations.structureImprovements || []
      ),
      key_rewrites: JSON.stringify(optimizations.keyRewriteSuggestions || []),
      overall_score: optimizations.overallScore || 0,
      priority_actions: JSON.stringify(optimizations.priorityActions || []),
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
  } catch (error: any) {
    console.error("Error in optimize-page-content:", error);
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
});
