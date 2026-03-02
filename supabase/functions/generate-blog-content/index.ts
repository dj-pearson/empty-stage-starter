import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIServiceV2 } from "../_shared/ai-service-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * EatPal brand content pillars derived from prd_image.md
 * Used to seed topic generation when no topic is provided.
 */
const CONTENT_PILLARS = [
  {
    name: "ARFID & Feeding Disorders 101",
    topics: [
      "ARFID vs picky eating: what parents need to know",
      "Signs your child's eating goes beyond typical picky eating",
      "What to expect from feeding therapy and how EatPal supports it",
      "Understanding sensory food aversion in children",
      "When to seek professional help for your child's eating",
    ],
  },
  {
    name: "Food Chaining in Real Life",
    topics: [
      "What is food chaining? A therapist-backed guide for parents",
      "Real food chains starting from chicken nuggets",
      "Food chains starting from mac and cheese",
      "Food chains from yogurt to new dairy foods",
      "Common mistakes that stall food chaining progress",
      "Building bridges between safe foods and new foods",
    ],
  },
  {
    name: "Meal Planning for Selective Eaters",
    topics: [
      "Weekly grocery list for kids with ARFID who only eat beige foods",
      "How to build a meal rotation when your child eats fewer than 10 foods",
      "Busy-week survival plan: protecting feeding progress when life gets chaotic",
      "Nutrition strategies when your child's diet is extremely limited",
      "Backup meal planning for high-anxiety mealtime days",
    ],
  },
  {
    name: "Autism, Sensory Challenges & Mealtime Routines",
    topics: [
      "Why many autistic kids struggle with eating and what actually helps",
      "Sensory-friendly meal routines that support food chaining",
      "Visual supports for mealtimes: charts, timers, and scripts",
      "Managing texture sensitivities at the dinner table",
      "Creating a calm mealtime environment for sensory-sensitive children",
    ],
  },
  {
    name: "Therapist & Clinical Perspectives",
    topics: [
      "Standardizing food logs and chains across your feeding team",
      "From spreadsheets to structured data: how clinics scale feeding therapy",
      "ARFID care coordination: what therapists wish parents tracked",
      "Evidence-based approaches to expanding a child's food repertoire",
      "The role of data in modern feeding therapy",
    ],
  },
];

export default async (req: Request) => {
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

    // Initialize centralized AI service (reads config from env vars)
    const aiService = new AIServiceV2();

    // ─── Title Selection ───────────────────────────────────────────────
    let suggestedTitle = topic;
    let titleFromBank = false;

    if (useTitleBank && !topic) {
      // Try the title bank first
      const { data: titleData, error: titleError } = await supabase.rpc(
        "get_next_blog_title"
      );

      if (!titleError && titleData && titleData.length > 0) {
        suggestedTitle = titleData[0].title;
        titleFromBank = true;
        console.log("Using title from bank:", suggestedTitle);
      } else {
        // Generate a new title from our content pillars using AI
        console.log(
          "No unused titles in bank, generating from content pillars..."
        );

        const { data: allTitles } = await supabase
          .from("blog_title_bank")
          .select("title")
          .limit(20);

        const existingTitles = allTitles?.map((t: any) => t.title) || [];

        // Pick a random content pillar and topic seed for inspiration
        const pillar =
          CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];
        const topicSeed =
          pillar.topics[Math.floor(Math.random() * pillar.topics.length)];

        const titlePrompt = `Generate ONE unique blog post title for EatPal, an evidence-based meal planning app for families dealing with ARFID, extreme picky eating, and feeding challenges.

Content pillar: "${pillar.name}"
Topic inspiration: "${topicSeed}"

Existing titles to AVOID duplicating:
${existingTitles.slice(0, 10).map((t: string) => `- ${t}`).join("\n")}

Requirements:
- Must be relevant to families with feeding disorders, ARFID, or extreme picky eating
- Should reference food chaining, sensory challenges, or evidence-based feeding strategies
- Tone: calm, hopeful, evidence-based (never miracle claims or parent-blaming)
- 50-65 characters ideal for SEO
- Return ONLY the title text, no quotes or extra formatting`;

        try {
          const generatedTitle = await aiService.generateSimpleContent(
            titlePrompt,
            { taskType: "lightweight" }
          );

          if (generatedTitle) {
            suggestedTitle = generatedTitle
              .trim()
              .replace(/^["']|["']$/g, "");
            console.log("AI-generated new title:", suggestedTitle);

            await supabase
              .from("blog_title_bank")
              .insert({ title: suggestedTitle });
            titleFromBank = true;
          }
        } catch (error) {
          console.error("Error generating title with AI:", error);
        }
      }
    }

    // Fallback title from content pillars
    if (!suggestedTitle) {
      const pillar =
        CONTENT_PILLARS[Math.floor(Math.random() * CONTENT_PILLARS.length)];
      suggestedTitle =
        pillar.topics[Math.floor(Math.random() * pillar.topics.length)];
      console.warn("Using content pillar fallback title:", suggestedTitle);
    }

    // ─── Deduplication: Title Similarity ───────────────────────────────
    const { data: similarTitles, error: similarError } = await supabase.rpc(
      "check_title_similarity",
      { new_title: suggestedTitle, threshold: 0.85 }
    );

    if (!similarError && similarTitles && similarTitles.length > 0) {
      console.warn("Similar titles found:", similarTitles);
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

    // ─── Content Variety: Check Generation History ─────────────────────
    const { data: recentHistory } = await supabase
      .from("blog_generation_history")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(10);

    const recentTopics =
      recentHistory?.map((h: any) => h.keywords).flat() || [];
    const recentTones =
      recentHistory?.map((h: any) => h.tone_used).filter(Boolean) || [];
    const recentPerspectives =
      recentHistory?.map((h: any) => h.perspective_used).filter(Boolean) || [];

    // Rotate tones and perspectives to ensure variety
    const tones = [
      "empathetic",
      "evidence-based",
      "conversational",
      "direct",
      "storytelling",
    ];
    const perspectives = [
      "parent experience and real-life scenarios",
      "clinical evidence and research findings",
      "practical step-by-step guidance",
      "food chaining strategies with specific examples",
      "therapist insights and professional advice",
      "myth-busting common feeding misconceptions",
    ];

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

    // ─── AI Content Generation ─────────────────────────────────────────
    const systemPrompt = `You are an expert content writer for EatPal, an evidence-based meal planning app built on food chaining science for families dealing with extreme picky eating, ARFID (Avoidant/Restrictive Food Intake Disorder), and related feeding challenges.

BRAND VOICE (strictly follow):
- Calm, grounded, and hopeful — never use hype or miracle claims
- Evidence-based — reference food chaining science and clinical approaches confidently
- Parent-first empathy — speak directly to caregivers with high understanding
- Non-blaming — clearly communicate that feeding difficulties are not the parent's fault
- Plain-language clinical — explain terms like ARFID and food chaining simply, then use them naturally

WRITING APPROACH FOR THIS ARTICLE:
- Tone: ${selectedTone}
- Perspective: ${selectedPerspective}
- Must be completely unique and provide fresh, actionable insights
- Avoid clichés, generic parenting platitudes, and overused phrases
- Include specific food chaining examples, sensory considerations, or therapy-aligned strategies where relevant

NEVER include:
- Miracle claims ("cure picky eating in 7 days")
- Parent-blaming language ("if you just tried harder")
- Generic advice that ignores the reality of feeding disorders
- Content that contradicts evidence-based feeding therapy principles`;

    const userPrompt = `Create a complete blog article about: ${suggestedTitle}

${keywords ? `Focus on these keywords: ${keywords}` : "Focus on keywords relevant to ARFID, food chaining, and picky eating"}
${targetAudience ? `Target audience: ${targetAudience}` : "Target audience: Parents of children with ARFID, extreme picky eating, or autism-related feeding challenges"}

UNIQUENESS REQUIREMENTS:
- Approach this topic from a FRESH angle different from these recent topics: ${recentTopics.slice(0, 10).join(", ") || "none yet"}
- Use the ${selectedTone} tone throughout
- Frame through ${selectedPerspective}
- Include specific, actionable food chaining examples or sensory-aware strategies
- Reference evidence-based feeding therapy principles

CONTENT REQUIREMENTS:
1. Title: An engaging, SEO-friendly title (50-65 characters)
2. SEO Title: Optimized meta title for search engines (50-60 characters)
3. SEO Description: Compelling meta description mentioning EatPal (150-160 characters)
4. Excerpt: A brief summary (150-200 words) that hooks parents dealing with feeding challenges
5. Body Content:
   - Opening that acknowledges the parent's struggle with empathy
   - Main sections with clear headings covering the topic
   - Specific food chaining examples or sensory-aware meal strategies
   - Practical, actionable steps families can take today
   - Mention of how EatPal's AI-powered tools support this approach
   - Conclusion with a hopeful, encouraging call-to-action
   - Target length: ~1000-1400 words
6. FAQ Section: 5-7 frequently asked questions with evidence-informed answers

Each article must include:
- At least one mention of food chaining as a strategy
- At least one reference to working with feeding therapists
- A CTA directing readers to try EatPal's free 5-day personalized meal plan

STRICT OUTPUT REQUIREMENTS:
- Return ONLY valid strict JSON (RFC 8259 compliant)
- Absolutely NO Markdown, NO code fences, NO comments
- No trailing commas anywhere
- Escape all newlines inside string values as \\n
Format:
{
  "title": "...",
  "seo_title": "...",
  "seo_description": "...",
  "excerpt": "...",
  "body": "...",
  "faq": [{"question": "...", "answer": "..."}]
}`;

    console.log("Generating blog content with AIServiceV2...");

    const content = await aiService.generateSimpleContent(userPrompt, {
      systemPrompt,
      taskType: "standard",
      maxTokens: 16000,
    });

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content received from AI" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ─── Parse AI Response ─────────────────────────────────────────────
    let sanitized = content.trim();
    if (sanitized.startsWith("```")) {
      sanitized = sanitized
        .replace(/^```(?:json|JSON)?\n?/, "")
        .replace(/```$/, "")
        .trim();
    }

    let blogContent;
    try {
      const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0].replace(/,(\s*[}\]])/g, "$1");
        blogContent = JSON.parse(jsonStr);
      } else {
        blogContent = JSON.parse(sanitized);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error(
        "Raw content (first 1000 chars):",
        sanitized.substring(0, 1000)
      );

      // Retry with shorter target length
      try {
        console.log("Retrying with condensed length...");
        const retryPrompt = userPrompt.replace(
          /Target length:\s*~?\d+\s*-\s*\d+\s*words/i,
          "Target length: ~700-900 words"
        );

        const retryContent = await aiService.generateSimpleContent(
          retryPrompt,
          {
            systemPrompt,
            taskType: "standard",
            maxTokens: 8000,
          }
        );

        let retrySanitized = retryContent.trim();
        if (retrySanitized.startsWith("```")) {
          retrySanitized = retrySanitized
            .replace(/^```(?:json|JSON)?\n?/, "")
            .replace(/```$/, "")
            .trim();
        }

        const retryMatch = retrySanitized.match(/\{[\s\S]*\}/);
        const retryJsonStr = (
          retryMatch ? retryMatch[0] : retrySanitized
        ).replace(/,(\s*[}\]])/g, "$1");
        blogContent = JSON.parse(retryJsonStr);
        console.log("Retry succeeded");
      } catch (retryErr) {
        console.error("Retry failed:", retryErr);
        return new Response(
          JSON.stringify({
            error: "Failed to parse AI response after retry. Please try again.",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // ─── Deduplication: Content Hash Check ─────────────────────────────
    const contentHash = await supabase.rpc("generate_content_hash", {
      content_text: blogContent.body || "",
    });

    if (!contentHash.error && contentHash.data) {
      const { data: duplicateCheck } = await supabase.rpc(
        "check_content_similarity",
        { new_content_hash: contentHash.data }
      );

      if (duplicateCheck && duplicateCheck.length > 0) {
        console.warn("Similar content detected:", duplicateCheck);
        return new Response(
          JSON.stringify({
            error:
              "Content too similar to an existing post. Try a different topic or angle.",
            similar_post: duplicateCheck[0],
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // ─── Log Generation History ────────────────────────────────────────
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

    // ─── Save Blog Post ────────────────────────────────────────────────
    let postData: any = null;
    try {
      // Generate unique slug
      const baseSlug = (blogContent.title || suggestedTitle)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      let slug = baseSlug;

      const { data: existingSlugRows, error: existingSlugError } =
        await supabase
          .from("blog_posts")
          .select("slug")
          .ilike("slug", `${baseSlug}%`);

      if (existingSlugError) {
        console.warn("Slug uniqueness check failed:", existingSlugError);
      } else if (existingSlugRows && existingSlugRows.length > 0) {
        const existingSet = new Set(
          existingSlugRows.map((r: any) => r.slug)
        );
        if (existingSet.has(baseSlug)) {
          let i = 2;
          while (existingSet.has(`${baseSlug}-${i}`)) i++;
          slug = `${baseSlug}-${i}`;
        }
      }

      console.log("Saving blog post with slug:", slug);

      const { data: postResult, error: postError } = await supabase
        .from("blog_posts")
        .insert([
          {
            title: blogContent.title || suggestedTitle,
            slug,
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

      if (postError) throw postError;
      if (!postResult) throw new Error("No post data returned");

      postData = postResult;
      console.log("Blog post saved:", postData.id);

      // ─── Auto-Publish: Generate Social Content & Webhook ───────────
      if (autoPublish) {
        const blogUrl = `https://tryeatpal.com/blog/${slug}`;

        try {
          console.log("Generating social content for blog promotion...");

          // Generate social content directly with AIServiceV2
          // (avoids supabase.functions.invoke which doesn't work in self-hosted Docker)
          const socialSystemPrompt = `You are EatPal's social media content creator. EatPal is an evidence-based, AI-powered meal planning app built on food chaining science for families dealing with ARFID, extreme picky eating, and feeding challenges.

BRAND VOICE:
- Calm, hopeful, evidence-based — never use miracle claims
- Empathetic and non-blaming toward parents
- Reference food chaining and feeding therapy naturally
- Include a clear call-to-action to read the blog post

NEVER use: "Raise your hand if...", "I was THAT mom", "Real talk", generic parenting clichés`;

          const socialPrompt = `Create social media posts promoting this blog article:

Title: "${blogContent.title || suggestedTitle}"
Excerpt: "${blogContent.excerpt || ""}"
URL: ${blogUrl}

Generate:
1. **title**: A compelling social media headline
2. **facebook**: 150-250 words, empathetic hook about feeding challenges, specific insight from the article, CTA to read more, 3-5 hashtags including #EatPal #ARFID #FoodChaining
3. **twitter**: Max 280 chars, punchy insight + link + 2-3 hashtags

STRICT OUTPUT: Return ONLY valid JSON, no markdown, no code fences:
{"title": "...", "facebook": "...", "twitter": "..."}`;

          const socialContent = await aiService.generateSimpleContent(
            socialPrompt,
            {
              systemPrompt: socialSystemPrompt,
              taskType: "lightweight",
              maxTokens: 2000,
            }
          );

          let parsedSocial: any = {};
          try {
            let socialSanitized = socialContent.trim();
            if (socialSanitized.startsWith("```")) {
              socialSanitized = socialSanitized
                .replace(/^```(?:json|JSON)?\n?/, "")
                .replace(/```$/, "")
                .trim();
            }
            const socialMatch = socialSanitized.match(/\{[\s\S]*\}/);
            if (socialMatch) {
              parsedSocial = JSON.parse(
                socialMatch[0].replace(/,(\s*[}\]])/g, "$1")
              );
            } else {
              parsedSocial = JSON.parse(socialSanitized);
            }
          } catch {
            console.error(
              "Failed to parse social content, using branded fallback"
            );
            parsedSocial = {
              title: blogContent.title || suggestedTitle,
              twitter: `New on the EatPal blog: ${blogContent.title}\n\nEvidence-based strategies for families with picky eaters.\n\n${blogUrl}\n\n#EatPal #ARFID #FoodChaining`,
              facebook: `New on the EatPal blog!\n\n${blogContent.excerpt || ""}\n\nRead the full article for evidence-based strategies grounded in food chaining science.\n\n${blogUrl}\n\n#EatPal #ARFID #FoodChaining #PickyEaters #FeedingTherapy`,
            };
          }

          // Save social post to database
          const hashtagMatches =
            (parsedSocial.facebook || "").match(/#\w+/g) || [];
          const hashtags = hashtagMatches.map((tag: string) =>
            tag.substring(1)
          );

          await supabase.from("social_posts").insert([
            {
              title: parsedSocial.title || blogContent.title,
              content: parsedSocial.facebook || "",
              short_form_content: parsedSocial.twitter || "",
              long_form_content: parsedSocial.facebook || "",
              platforms: ["facebook", "twitter", "linkedin"],
              status: "published",
              published_at: new Date().toISOString(),
              link_url: blogUrl,
              hashtags,
            },
          ]);

          // Send to webhook for social media distribution
          if (webhookUrl) {
            const webhookPayload = {
              type: "blog_published",
              blog_id: postData.id,
              blog_title: blogContent.title || suggestedTitle,
              blog_url: blogUrl,
              blog_slug: slug,
              blog_excerpt: blogContent.excerpt || "",
              social_title:
                parsedSocial.title || blogContent.title,
              short_form:
                parsedSocial.twitter ||
                `New: ${blogContent.title}\n${blogUrl}\n#EatPal #ARFID #FoodChaining`,
              long_form:
                parsedSocial.facebook ||
                `${blogContent.excerpt}\n\nRead more: ${blogUrl}\n\n#EatPal #ARFID #FoodChaining #FeedingTherapy`,
              hashtags:
                hashtags.length > 0
                  ? hashtags
                  : [
                      "EatPal",
                      "ARFID",
                      "FoodChaining",
                      "PickyEaters",
                      "FeedingTherapy",
                    ],
              published_at: new Date().toISOString(),
            };

            console.log("Sending to webhook:", webhookUrl);
            const webhookResponse = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(webhookPayload),
            });

            console.log("Webhook response:", webhookResponse.status);
            if (!webhookResponse.ok) {
              console.error(
                "Webhook error:",
                await webhookResponse.text()
              );
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
        JSON.stringify({
          error: `Failed to save blog post: ${saveError?.message || "Unknown error"}`,
        }),
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
        titleFromBank,
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
};
