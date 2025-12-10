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
    let needsAITitleGeneration = false;
    let existingTitlesForAI: string[] = [];

    if (useTitleBank && !topic) {
      const { data: titleData, error: titleError } = await supabase.rpc(
        "get_next_blog_title"
      );

      if (!titleError && titleData && titleData.length > 0) {
        suggestedTitle = titleData[0].title;
        titleFromBank = true;
        console.log("Using title from bank:", suggestedTitle);
      } else {
        console.log("No unused titles in bank, will generate new title with AI...");
        needsAITitleGeneration = true;
        
        // Get all titles from bank to understand the style/pattern
        const { data: allTitles } = await supabase
          .from("blog_title_bank")
          .select("title")
          .limit(20);
        
        existingTitlesForAI = allTitles?.map((t: any) => t.title) || [];
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

    // Generate AI title if needed (after modelConfig is defined)
    if (needsAITitleGeneration) {
      const titlePrompt = existingTitlesForAI.length > 0
        ? `Generate ONE unique blog post title for parents of picky eaters. Base the style on these examples: ${existingTitlesForAI.slice(0, 5).join(", ")}. Return ONLY the title, no quotes or extra text.`
        : `Generate ONE unique blog post title about helping parents with picky eaters. Focus on practical advice. Return ONLY the title, no quotes or extra text.`;
      
      try {
        const authHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (modelConfig.auth_type === "x-api-key") {
          authHeaders["x-api-key"] = apiKey;
        } else if (modelConfig.auth_type === "bearer") {
          authHeaders["Authorization"] = `Bearer ${apiKey}`;
        } else if (modelConfig.auth_type === "api-key") {
          authHeaders["api-key"] = apiKey;
        }

        const titleResponse = await fetch(modelConfig.endpoint_url, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            model: modelConfig.model_name,
            messages: [{ role: "user", content: titlePrompt }],
            max_tokens: 100,
            temperature: 0.9,
          }),
        });
        
        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          const generatedTitle = titleData.choices?.[0]?.message?.content?.trim() || 
                                titleData.content?.[0]?.text?.trim();
          
          if (generatedTitle) {
            suggestedTitle = generatedTitle.replace(/^["']|["']$/g, "");
            console.log("AI-generated new title:", suggestedTitle);
            
            // Add the new title to the bank for future use
            await supabase.from("blog_title_bank").insert({ title: suggestedTitle });
            titleFromBank = true;
          }
        }
      } catch (error) {
        console.error("Error generating title with AI:", error);
      }
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
            : 16000,
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

      // Retry once with a shorter target length to avoid truncation
      try {
        console.log("Retrying generation with condensed length due to parse failure...");

        const isAnthropicRetry = modelConfig.endpoint_url.includes("anthropic.com");
        const isOpenAIRetry = modelConfig.endpoint_url.includes("openai.com");

        const retryUserPrompt = userPrompt.replace(
          /Target length:\s*~?\d+\s*-\s*\d+\s*words/i,
          "Target length: ~700-900 words"
        );

        const retryHeaders: Record<string, string> = { "Content-Type": "application/json" };
        if (modelConfig.auth_type === "x-api-key") retryHeaders["x-api-key"] = apiKey;
        else if (modelConfig.auth_type === "bearer") retryHeaders["Authorization"] = `Bearer ${apiKey}`;
        else if (modelConfig.auth_type === "api-key") retryHeaders["api-key"] = apiKey;

        let retryBody: any;
        if (isAnthropicRetry) {
          retryBody = {
            model: modelConfig.model_name,
            system: systemPrompt,
            messages: [{ role: "user", content: retryUserPrompt }],
            max_tokens: modelConfig.max_tokens && modelConfig.max_tokens > 0 ? Math.min(modelConfig.max_tokens, 12000) : 8000,
          };
          if (modelConfig.temperature !== null) retryBody.temperature = modelConfig.temperature;
          if (modelConfig.additional_params) Object.assign(retryBody, modelConfig.additional_params);
        } else {
          retryBody = {
            model: modelConfig.model_name,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: retryUserPrompt },
            ],
            max_tokens: modelConfig.max_tokens ?? 4000,
          };
          if (modelConfig.temperature !== null) retryBody.temperature = modelConfig.temperature;
          if (modelConfig.additional_params) Object.assign(retryBody, modelConfig.additional_params);
          if (isOpenAIRetry && /^(gpt-5|o3|o4)/.test(modelConfig.model_name)) {
            if (retryBody.max_tokens !== undefined) {
              retryBody.max_completion_tokens = retryBody.max_tokens;
              delete retryBody.max_tokens;
            }
            if ("temperature" in retryBody) delete retryBody.temperature;
          }
        }

        const retryResp = await fetch(modelConfig.endpoint_url, {
          method: "POST",
          headers: retryHeaders,
          body: JSON.stringify(retryBody),
        });

        if (!retryResp.ok) {
          const t = await retryResp.text();
          console.error("Retry AI API error:", retryResp.status, t);
          return new Response(
            JSON.stringify({ error: "AI retry failed: " + t }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const retryData = await retryResp.json();
        let retryContent = "";
        if (retryData.content && Array.isArray(retryData.content)) {
          retryContent = retryData.content.find((c: any) => c.type === "text")?.text || "";
        } else if (retryData.choices && retryData.choices[0]?.message?.content) {
          retryContent = retryData.choices[0].message.content;
        }
        let retrySanitized = retryContent.trim();
        if (retrySanitized.startsWith("```") ) {
          retrySanitized = retrySanitized.replace(/^```(?:json|JSON)?\n?/, "").replace(/```$/, "").trim();
        }

        const retryMatch = retrySanitized.match(/\{[\s\S]*\}/);
        const retryJsonStr = (retryMatch ? retryMatch[0] : retrySanitized).replace(/,(\s*[}\]])/g, "$1");
        blogContent = JSON.parse(retryJsonStr);
        console.log("Retry succeeded with condensed content");
      } catch (retryErr) {
        console.error("Retry parse/generation failed:", retryErr);
        return new Response(
          JSON.stringify({ error: "Failed to parse AI response after retry. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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

    // Always create the blog post in database
    let postData: any = null;
    try {
      console.log("Creating blog post in database...");

      // Generate unique slug from title
      const baseSlug = (blogContent.title || suggestedTitle)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      let slug = baseSlug;

      // Ensure slug uniqueness by appending numeric suffix when needed
      const { data: existingSlugRows, error: existingSlugError } = await supabase
        .from("blog_posts")
        .select("slug")
        .ilike("slug", `${baseSlug}%`);

      if (existingSlugError) {
        console.warn("Slug uniqueness check failed, proceeding with base slug:", existingSlugError);
      } else if (existingSlugRows && existingSlugRows.length > 0) {
        const existingSet = new Set(existingSlugRows.map((r: any) => r.slug));
        if (existingSet.has(baseSlug)) {
          let i = 2;
          while (existingSet.has(`${baseSlug}-${i}`)) i++;
          slug = `${baseSlug}-${i}`;
        }
      }

      console.log("Final unique slug:", slug);

      // Create the blog post
      const { data: postResult, error: postError } = await supabase
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
            status: autoPublish ? "published" : "draft",
            published_at: autoPublish ? new Date().toISOString() : null,
          },
        ])
        .select()
        .single();

      if (postError) {
        console.error("Error creating blog post:", postError);
        throw postError;
      }

      if (!postResult) {
        console.error("No post data returned");
        throw new Error("Failed to create blog post");
      }

      postData = postResult;
      console.log("Blog post created successfully:", postData.id);

      if (postData && autoPublish) {
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
    } catch (saveError: any) {
      console.error("Error saving blog post:", saveError);
      return new Response(
        JSON.stringify({ error: `Failed to save blog post: ${saveError?.message || 'Unknown error'}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        content: blogContent,
        autoPublished: autoPublish,
        postId: postData?.id,
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
