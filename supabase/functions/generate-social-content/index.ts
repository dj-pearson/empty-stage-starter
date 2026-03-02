import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIServiceV2 } from "../_shared/ai-service-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Content angles aligned with EatPal's brand positioning from prd_image.md.
 * Rotated to ensure variety across posts.
 */
const CONTENT_ANGLES = [
  "food chaining success story",
  "ARFID awareness and education",
  "mealtime stress reduction tip",
  "sensory-friendly food suggestion",
  "therapist-backed feeding strategy",
  "evidence-based nutrition insight",
  "parent encouragement and validation",
  "safe food expansion micro-step",
  "texture bridge between safe and new foods",
  "calm mealtime routine idea",
];

/**
 * Standalone topics for when no topic/title is provided.
 * Drawn from EatPal's content pillars.
 */
const STANDALONE_TOPICS = [
  "How food chaining helps kids move from chicken nuggets to real chicken",
  "One small step: bridging from smooth yogurt to fruit-on-the-bottom",
  "Why 'just try one bite' backfires for kids with ARFID",
  "The difference between picky eating and a feeding disorder",
  "Sensory-friendly swaps that make mealtime calmer",
  "What feeding therapists want parents to know about progress",
  "Building a safe food list that actually grows over time",
  "Texture bridges: from crunchy to soft without the stress",
  "How EatPal uses AI to suggest the next safe food step",
  "Mealtime scripts that reduce pressure for anxious eaters",
];

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      topic,
      contentGoal,
      targetAudience,
      title,
      excerpt,
      url,
      autoPublish = false,
      webhookUrl,
    } = await req.json();

    let topicToUse = topic || title;

    // If no topic provided, pick from standalone topics
    if (!topicToUse) {
      topicToUse =
        STANDALONE_TOPICS[
          Math.floor(Math.random() * STANDALONE_TOPICS.length)
        ];
      console.log("No topic provided, using standalone:", topicToUse);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize centralized AI service (reads config from env vars)
    const aiService = new AIServiceV2();

    // ─── Deduplication: Check Recent Social Posts ──────────────────────
    const { data: recentSocial } = await supabase
      .from("social_posts")
      .select("title, content")
      .order("created_at", { ascending: false })
      .limit(10);

    const recentSocialTitles =
      recentSocial?.map((p: any) => p.title) || [];

    // Select a unique content angle and tone
    const selectedAngle =
      CONTENT_ANGLES[Math.floor(Math.random() * CONTENT_ANGLES.length)];

    const tones = [
      "empathetic and warm",
      "confident and evidence-based",
      "gently humorous",
      "honest and hopeful",
      "direct and practical",
    ];
    const selectedTone =
      tones[Math.floor(Math.random() * tones.length)];

    console.log(
      `Social content angle: ${selectedAngle}, tone: ${selectedTone}`
    );

    // ─── Generate Social Content with AIServiceV2 ─────────────────────
    const systemPrompt = `You are EatPal's social media content creator. EatPal is an evidence-based, AI-powered meal planning app built on food chaining science for families dealing with ARFID (Avoidant/Restrictive Food Intake Disorder), extreme picky eating, and feeding challenges.

BRAND VOICE:
- Calm, hopeful, and grounded — never use hype or miracle claims
- Empathetic and non-blaming toward parents and caregivers
- Reference food chaining science and feeding therapy naturally
- Use plain-language clinical terms (explain ARFID once, then use it)
- Avoid: "Raise your hand if...", "I was THAT mom", "Real talk", "Let's be honest" and similar clichés

CONTENT APPROACH:
- Angle: ${selectedAngle}
- Tone: ${selectedTone}
- Each post must feel fresh, original, and specifically relevant to feeding disorders
- Include specific, concrete examples — not vague advice
- Always connect back to EatPal's evidence-based, food-chaining approach`;

    const linkUrl = url || "https://tryeatpal.com";

    const userPrompt = `Create a unique social media post about: ${topicToUse}

${excerpt ? `Context/excerpt: ${excerpt}` : ""}
${contentGoal ? `Content goal: ${contentGoal}` : "Content goal: Build brand awareness and drive website visits for EatPal"}
${targetAudience ? `Target audience: ${targetAudience}` : "Target audience: Parents of children with ARFID, extreme picky eating, or autism-related feeding challenges"}

AVOID repeating these recent post topics:
${recentSocialTitles.slice(0, 5).map((t: string) => `- ${t}`).join("\n") || "- (none yet)"}

Generate:
1. **title**: Compelling social media headline (under 70 chars)

2. **facebook**: 150-250 words
   - Open with a unique hook about a specific feeding challenge scenario
   - Share a specific, actionable food chaining tip or sensory-aware strategy
   - Acknowledge the parent's struggle without blame
   - End with CTA: "Try EatPal's free 5-day personalized plan" and include link: ${linkUrl}
   - Include 4-5 hashtags: #EatPal #ARFID #FoodChaining + relevant ones

3. **twitter**: Maximum 280 characters
   - One punchy insight about feeding challenges or food chaining
   - Include link: ${linkUrl}
   - Include 2-3 hashtags
   - Must create curiosity to drive clicks

STRICT OUTPUT: Return ONLY valid JSON (RFC 8259), no markdown, no code fences, no trailing commas:
{"title": "...", "facebook": "...", "twitter": "..."}`;

    console.log("Generating social content with AIServiceV2...");

    const content = await aiService.generateSimpleContent(userPrompt, {
      systemPrompt,
      taskType: "lightweight",
      maxTokens: 2000,
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

    // ─── Parse Response ────────────────────────────────────────────────
    let sanitized = content.trim();
    if (sanitized.startsWith("```")) {
      sanitized = sanitized
        .replace(/^```(?:json|JSON)?\n?/, "")
        .replace(/```$/, "")
        .trim();
    }

    let socialContent;
    try {
      const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0].replace(/,(\s*[}\]])/g, "$1");
        socialContent = JSON.parse(jsonStr);
      } else {
        socialContent = JSON.parse(sanitized);
      }
    } catch (e) {
      console.error("Failed to parse social AI response:", e);
      console.error("Raw:", sanitized.substring(0, 500));
      return new Response(
        JSON.stringify({
          error: "Failed to parse AI response. Please try again.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Ensure brand hashtags are present
    if (socialContent.facebook && !socialContent.facebook.includes("#EatPal")) {
      socialContent.facebook += "\n\n#EatPal #ARFID #FoodChaining";
    }
    if (socialContent.twitter && !socialContent.twitter.includes("#EatPal")) {
      socialContent.twitter += " #EatPal #ARFID";
    }

    // Replace any link placeholders with the actual URL
    if (socialContent.facebook) {
      socialContent.facebook = socialContent.facebook.replace(
        /\[link\]|\{link\}|\[URL\]|\{URL\}/gi,
        linkUrl
      );
    }
    if (socialContent.twitter) {
      socialContent.twitter = socialContent.twitter.replace(
        /\[link\]|\{link\}|\[URL\]|\{URL\}/gi,
        linkUrl
      );
    }

    // ─── Auto-Publish & Webhook ────────────────────────────────────────
    if (autoPublish) {
      try {
        const hashtagMatches =
          (
            socialContent.facebook ||
            socialContent.twitter ||
            ""
          ).match(/#\w+/g) || [];
        const hashtags = hashtagMatches.map((tag: string) =>
          tag.substring(1)
        );

        const { data: postData, error: postError } = await supabase
          .from("social_posts")
          .insert([
            {
              title: socialContent.title || topicToUse,
              content:
                socialContent.facebook || socialContent.twitter || "",
              short_form_content: socialContent.twitter || "",
              long_form_content: socialContent.facebook || "",
              platforms: ["facebook", "twitter", "linkedin"],
              status: "published",
              published_at: new Date().toISOString(),
              link_url: linkUrl,
              hashtags,
            },
          ])
          .select()
          .single();

        if (postError) {
          console.error("Error saving social post:", postError);
        } else if (postData && webhookUrl) {
          // Send to webhook for social media distribution
          try {
            const webhookPayload = {
              type: "social_post_published",
              post_id: postData.id,
              title: socialContent.title || "",
              short_form: socialContent.twitter || "",
              long_form: socialContent.facebook || "",
              url: linkUrl,
              hashtags:
                hashtags.length > 0
                  ? hashtags
                  : [
                      "EatPal",
                      "ARFID",
                      "FoodChaining",
                      "FeedingTherapy",
                    ],
              published_at: new Date().toISOString(),
            };

            console.log("Sending social webhook:", webhookUrl);
            const webhookResponse = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(webhookPayload),
            });

            console.log(
              "Social webhook response:",
              webhookResponse.status
            );
            if (!webhookResponse.ok) {
              console.error(
                "Social webhook error:",
                await webhookResponse.text()
              );
            }
          } catch (webhookError) {
            console.error("Social webhook error:", webhookError);
          }
        }
      } catch (publishError) {
        console.error("Auto-publish error:", publishError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        content: socialContent,
        autoPublished: autoPublish,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in generate-social-content:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};
