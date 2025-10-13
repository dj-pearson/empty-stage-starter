import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      topic,
      keywords,
      targetAudience,
      autoPublish = false,
      webhookUrl,
      useTitleBank = true,
    } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get suggested title from title bank if enabled
    let suggestedTitle = topic;
    let titleFromBank = false;

    if (useTitleBank && !topic) {
      const { data: titleData, error: titleError } = await supabase.rpc(
        "get_next_blog_title"
      );

      if (!titleError && titleData && titleData.length > 0) {
        suggestedTitle = titleData[0].title;
        titleFromBank = true;
        console.log("Using title from bank:", suggestedTitle);
      } else {
        console.warn("No title available from bank, attempting suggestions fallback...");
        const { data: suggestData, error: suggestError } = await supabase.rpc(
          "get_diverse_title_suggestions",
          { count: 1 }
        );
        if (!suggestError && suggestData && suggestData.length > 0) {
          const candidate = suggestData[0] as any;
          suggestedTitle = candidate.title || candidate;
          titleFromBank = true;
          console.log("Using fallback suggested title:", suggestedTitle);
        }
      }
    }

    if (!suggestedTitle) {
      const today = new Date().toISOString().slice(0, 10);
      if (keywords && String(keywords).trim().length > 0) {
        suggestedTitle = `Fresh strategies for ${String(keywords).trim()} (${today})`;
      } else {
        suggestedTitle = `Practical picky eater tips for families (${today})`;
      }
      console.warn("No title provided; using safe fallback:", suggestedTitle);
    }

    // Check for similar titles to avoid duplicates
    const { data: similarTitles, error: similarError } = await supabase.rpc(
      "check_title_similarity",
      {
        new_title: suggestedTitle,
        threshold: 0.85,
      }
    );

    if (!similarError && similarTitles && similarTitles.length > 0) {
      console.warn("Warning: Similar titles found:", similarTitles);
      // If exact match (similarity > 0.95), reject
      if (similarTitles[0].similarity_score > 0.95) {
        return new Response(
          JSON.stringify({
            error: "This topic is too similar to an existing post",
            similar_posts: similarTitles,
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Get recent generation history to avoid repetitive angles
    const { data: recentHistory } = await supabase
      .from("blog_generation_history")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(10);

    const recentTopics = recentHistory?.map((h) => h.keywords).flat() || [];
    const recentTones =
      recentHistory?.map((h) => h.tone_used).filter(Boolean) || [];
    const recentPerspectives =
      recentHistory?.map((h) => h.perspective_used).filter(Boolean) || [];

    // Get active AI model or use default
    const { data: aiModel } = await supabase
      .from("ai_settings")
      .select("*")
      .eq("is_active", true)
      .single();

    // Use configured AI model or fall back to OpenAI default
    const modelConfig = aiModel || {
      model_name: "gpt-4o-mini",
      endpoint_url: "https://api.openai.com/v1/chat/completions",
      api_key_env_var: "OPENAI_API_KEY",
      auth_type: "bearer",
      temperature: 0.7,
      max_tokens: 4000,
      additional_params: null
    };

    const apiKey = Deno.env.get(modelConfig.api_key_env_var);
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: `API key not configured. Please set ${modelConfig.api_key_env_var} in your edge function secrets.`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Vary the writing approach to create diverse content
    const tones = [
      "conversational",
      "professional",
      "empathetic",
      "direct",
      "storytelling",
    ];
    const perspectives = [
      "evidence-based research",
      "real parent stories",
      "expert pediatric advice",
      "practical step-by-step",
      "myth-busting",
      "problem-solving",
    ];

    // Filter out recently used approaches
    const availableTones = tones.filter((t) => !recentTones.includes(t));
    const availablePerspectives = perspectives.filter(
      (p) => !recentPerspectives.includes(p)
    );

    const selectedTone =
      availableTones.length > 0
        ? availableTones[Math.floor(Math.random() * availableTones.length)]
        : tones[Math.floor(Math.random() * tones.length)];

    const selectedPerspective =
      availablePerspectives.length > 0
        ? availablePerspectives[
            Math.floor(Math.random() * availablePerspectives.length)
          ]
        : perspectives[Math.floor(Math.random() * perspectives.length)];

    console.log(
      `Generating with tone: ${selectedTone}, perspective: ${selectedPerspective}`
    );

    const systemPrompt = `You are an expert content writer specializing in parenting, child nutrition, and family wellness. 

WRITING STYLE FOR THIS ARTICLE:
- Tone: ${selectedTone}
- Approach: ${selectedPerspective}
- Must be completely unique and different from generic parenting advice
- Avoid clichés and overused phrases
- Bring fresh insights and actionable value

Create comprehensive, SEO-optimized blog content that is engaging, informative, and actionable for parents.`;

    const userPrompt = `Create a complete blog article about: ${suggestedTitle}

${keywords ? `Focus on these keywords: ${keywords}` : ""}
${
  targetAudience
    ? `Target audience: ${targetAudience}`
    : "Target audience: Parents of picky eaters and young children"
}

IMPORTANT UNIQUENESS REQUIREMENTS:
- This specific title/topic must be approached from a FRESH angle
- Avoid recently covered topics: ${recentTopics.slice(0, 10).join(", ")}
- Use the ${selectedTone} tone throughout
- Frame the content through ${selectedPerspective}
- Provide specific, actionable advice (not generic platitudes)
- Include unique examples and scenarios

Generate a comprehensive blog post with the following structure:

1. Title: An engaging, SEO-friendly title (60 characters max)
2. SEO Title: Optimized meta title for search engines (60 characters max)
3. SEO Description: Compelling meta description (150-160 characters)
4. Excerpt: A brief summary (150-200 words) that hooks readers
5. Body Content:
   - Introduction (hook the reader)
   - Main content sections with clear headings
   - Practical tips and actionable advice
   - Examples and real-world scenarios
   - Conclusion with call-to-action
   - Target length: ~1000-1400 words
6. FAQ Section: 5-7 frequently asked questions with detailed answers

STRICT OUTPUT REQUIREMENTS:
- Return ONLY valid strict JSON (RFC 8259 compliant)
- Absolutely NO Markdown, NO code fences, NO comments
- No trailing commas anywhere
- Escape all newlines inside string values as \\n
Format your response as JSON with EXACT keys only:
{
  "title": "...",
  "seo_title": "...",
  "seo_description": "...",
  "excerpt": "...",
  "body": "...",
  "faq": [
    {"question": "...", "answer": "..."}
  ],
}`;

    // Build API request
    const authHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add Anthropic version header if using Anthropic API
    if (modelConfig.endpoint_url.includes("anthropic.com")) {
      authHeaders["anthropic-version"] = "2023-06-01";
    }

    if (modelConfig.auth_type === "x-api-key") {
      authHeaders["x-api-key"] = apiKey;
    } else if (modelConfig.auth_type === "bearer") {
      authHeaders["Authorization"] = `Bearer ${apiKey}`;
    } else if (modelConfig.auth_type === "api-key") {
      authHeaders["api-key"] = apiKey;
    }

    // Build provider-specific request body
    let requestBody: any;
    const isAnthropic = modelConfig.endpoint_url.includes("anthropic.com");
    const isOpenAI = modelConfig.endpoint_url.includes("openai.com");

    if (isAnthropic) {
      // Anthropic Messages API: system is top-level and max_tokens is required
      requestBody = {
        model: modelConfig.model_name,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        max_tokens:
          modelConfig.max_tokens && modelConfig.max_tokens > 0
            ? modelConfig.max_tokens
            : 6000,
      };

      if (modelConfig.temperature !== null) {
        requestBody.temperature = modelConfig.temperature;
      }
      if (modelConfig.additional_params) {
        Object.assign(requestBody, modelConfig.additional_params);
      }
    } else {
      // OpenAI-style schema by default
      requestBody = {
        model: modelConfig.model_name,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      };

      if (modelConfig.temperature !== null) {
        requestBody.temperature = modelConfig.temperature;
      }
      if (modelConfig.max_tokens !== null) {
        requestBody.max_tokens = modelConfig.max_tokens;
      }
      if (modelConfig.additional_params) {
        Object.assign(requestBody, modelConfig.additional_params);
      }

      // Handle GPT-5 and newer OpenAI params per requirements
      if (isOpenAI && /^(gpt-5|o3|o4)/.test(modelConfig.model_name)) {
        if (requestBody.max_tokens !== undefined) {
          requestBody.max_completion_tokens = requestBody.max_tokens;
          delete requestBody.max_tokens;
        }
        if ("temperature" in requestBody) {
          delete requestBody.temperature;
        }
      }
    }

    console.log("Calling AI API:", modelConfig.endpoint_url);

    const aiResponse = await fetch(modelConfig.endpoint_url, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ error: `AI API error: ${errorText}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const aiData = await aiResponse.json();
    console.log("AI response received");

    let content = "";
    if (aiData.content && Array.isArray(aiData.content)) {
      content = aiData.content.find((c: any) => c.type === "text")?.text || "";
    } else if (aiData.choices && aiData.choices[0]?.message?.content) {
      content = aiData.choices[0].message.content;
    }

    const stopReason = aiData.stop_reason || aiData.choices?.[0]?.finish_reason;
    if (stopReason) {
      console.log("AI stop reason:", stopReason);
    }

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content received from AI" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Sanitize common AI wrappers like Markdown code fences
    let sanitized = content.trim();
    if (sanitized.startsWith("```")) {
      sanitized = sanitized
        .replace(/^```(?:json|JSON)?\n?/, "")
        .replace(/```$/, "")
        .trim();
    }

    // Parse JSON from response
    let blogContent;
    try {
      // Try to find JSON object in the response
      const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];

        // Clean up common JSON issues from AI responses
        // Remove trailing commas before closing brackets/braces
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");

        blogContent = JSON.parse(jsonStr);
      } else {
        blogContent = JSON.parse(sanitized);
      }
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      console.error("Raw content:", sanitized.substring(0, 1000));
      return new Response(
        JSON.stringify({
          error:
            "Failed to parse AI response. The AI may have returned invalid JSON format.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check content hash for duplicates before saving
    const contentHash = await supabase.rpc("generate_content_hash", {
      content_text: blogContent.body || "",
    });

    if (!contentHash.error && contentHash.data) {
      const { data: duplicateCheck } = await supabase.rpc(
        "check_content_similarity",
        {
          new_content_hash: contentHash.data,
        }
      );

      if (duplicateCheck && duplicateCheck.length > 0) {
        console.warn("Warning: Similar content detected:", duplicateCheck);
        return new Response(
          JSON.stringify({
            error:
              "This content is too similar to an existing post. Please try a different topic or angle.",
            similar_post: duplicateCheck[0],
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Log generation history for future uniqueness
    const keywordArray = keywords
      ? keywords.split(",").map((k: string) => k.trim())
      : [];
    await supabase.from("blog_generation_history").insert({
      title: blogContent.title || suggestedTitle,
      prompt: suggestedTitle,
      keywords: keywordArray,
      tone_used: selectedTone,
      perspective_used: selectedPerspective,
    });

    // If autoPublish is true, create the blog post and publish it
    if (autoPublish) {
      try {
        console.log("Auto-publishing blog post...");

        // Generate slug from title
        const slug = (blogContent.title || suggestedTitle)
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-");

        console.log("Generated slug:", slug);

        // Create the blog post
        const { data: postData, error: postError } = await supabase
          .from("blog_posts")
          .insert([
            {
              title: blogContent.title || suggestedTitle,
              slug: slug,
              content: blogContent.body || "",
              excerpt: blogContent.excerpt || "",
              meta_title: blogContent.seo_title || "",
              meta_description: blogContent.seo_description || "",
              ai_generated: true,
              ai_prompt: suggestedTitle,
              status: "published",
              published_at: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        if (postError) {
          console.error("Error creating blog post:", postError);
          throw postError;
        }

        if (!postData) {
          console.error("No post data returned");
          throw new Error("Failed to create blog post");
        }

        console.log("Blog post created successfully:", postData.id);

        if (postData) {
          const blogUrl = `https://tryeatpal.com/blog/${slug}`;

          // Generate social media content about this blog using AI
          try {
            console.log("Invoking generate-social-content function...");

            const { data: socialData, error: socialError } =
              await supabase.functions.invoke("generate-social-content", {
                body: {
                  topic: blogContent.title || suggestedTitle,
                  excerpt: blogContent.excerpt || "",
                  url: blogUrl,
                  contentGoal: "Promote this blog post to drive website visits",
                  targetAudience: targetAudience || "Parents of picky eaters",
                  autoPublish: false, // We'll handle the webhook here, not in the social function
                },
              });

            if (socialError) {
              console.error("Error generating social content:", socialError);
              throw socialError;
            }

            console.log("Social content generated successfully");
            const socialContent = socialData?.content || {};

            // Send to webhook if provided
            if (webhookUrl) {
              const webhookPayload = {
                type: "blog_published",
                blog_id: postData.id,
                blog_title: blogContent.title || topic,
                blog_url: blogUrl,
                blog_slug: slug,
                blog_excerpt: blogContent.excerpt || "",
                short_form:
                  socialContent.twitter ||
                  `New blog: ${blogContent.title}\n\nRead more: ${blogUrl} #EatPal #PickyEaters #ParentingTips`,
                long_form:
                  socialContent.facebook ||
                  `📝 New blog post: ${blogContent.title}\n\n${blogContent.excerpt}\n\nRead the full article: ${blogUrl}\n\n#EatPal #ParentingTips #PickyEaters`,
                social_title: socialContent.title || blogContent.title,
                hashtags: [
                  "EatPal",
                  "PickyEaters",
                  "ParentingTips",
                  "HealthyKids",
                ],
                published_at: new Date().toISOString(),
              };

              console.log("Sending to webhook:", webhookUrl);
              const webhookResponse = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(webhookPayload),
              });

              const webhookStatus = webhookResponse.status;
              console.log("Webhook response status:", webhookStatus);

              if (!webhookResponse.ok) {
                const webhookText = await webhookResponse.text();
                console.error("Webhook error response:", webhookText);
              }
            }
          } catch (socialError) {
            console.error(
              "Error in social content generation/webhook:",
              socialError
            );
          }
        }
      } catch (autoPublishError) {
        console.error("Auto-publish error:", autoPublishError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        content: blogContent,
        autoPublished: autoPublish,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in generate-blog-content:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
