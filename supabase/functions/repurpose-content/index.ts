import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_SPECS = {
  twitter_thread: {
    max_tweets: 10,
    chars_per_tweet: 280,
    style: "concise, punchy, engaging",
  },
  instagram_carousel: {
    max_slides: 10,
    chars_per_slide: 2200,
    style: "visual, inspirational, actionable",
  },
  linkedin_article: {
    max_length: 1300,
    style: "professional, insightful, authoritative",
  },
  youtube_description: {
    max_length: 5000,
    style: "engaging, detailed, SEO-optimized",
  },
  newsletter: {
    max_length: 3000,
    style: "conversational, value-focused, personal",
  },
  email_sequence: {
    num_emails: 5,
    chars_per_email: 800,
    style: "educational, progressive, actionable",
  },
  tiktok_script: {
    duration_seconds: 60,
    style: "hook-first, fast-paced, trendy",
  },
  pinterest_description: {
    max_length: 500,
    style: "keyword-rich, aspirational, clear CTA",
  },
};

async function repurposeForPlatform(
  post: any,
  platform: string,
  aiModel: any
): Promise<any> {
  const spec = PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS];

  if (!spec) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const apiKey = Deno.env.get(aiModel.api_key_env_var);
  if (!apiKey) {
    throw new Error(`API key not configured for ${aiModel.api_key_env_var}`);
  }

  // Build platform-specific prompt
  const prompt = buildRepurposePrompt(post, platform, spec);

  // Call AI API
  const authHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (aiModel.auth_type === "x-api-key") {
    authHeaders["x-api-key"] = apiKey;
  } else if (aiModel.auth_type === "bearer") {
    authHeaders["Authorization"] = `Bearer ${apiKey}`;
  } else if (aiModel.auth_type === "api-key") {
    authHeaders["api-key"] = apiKey;
  }

  const response = await fetch(aiModel.endpoint_url, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      model: aiModel.model_name,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API returned ${response.status}`);
  }

  const data = await response.json();
  const generatedContent =
    data.choices?.[0]?.message?.content || data.content?.[0]?.text || "";

  // Parse and format based on platform
  return formatForPlatform(generatedContent, platform);
}

function buildRepurposePrompt(post: any, platform: string, spec: any): string {
  const baseContext = `
Original Blog Post:
Title: ${post.title}
Content: ${post.content.substring(0, 2000)}...

Platform: ${platform}
Style: ${spec.style}
`;

  const platformPrompts: Record<string, string> = {
    twitter_thread: `${baseContext}

Create an engaging Twitter thread (${spec.max_tweets} tweets max, ${spec.chars_per_tweet} chars each).

Requirements:
- Start with a hook tweet that grabs attention
- Break down key points into individual tweets
- Use emojis strategically (not excessively)
- Include actionable tips
- End with a CTA to read the full article
- Add relevant hashtags (2-3 max per tweet)

Format each tweet as:
TWEET 1: [content]
TWEET 2: [content]
...`,

    instagram_carousel: `${baseContext}

Create Instagram carousel content (${spec.max_slides} slides).

Requirements:
- Slide 1: Eye-catching hook/title
- Slides 2-8: Key points with actionable advice
- Slide 9: Summary/key takeaways
- Slide 10: CTA and link in bio
- Each slide should be self-contained
- Use line breaks for readability
- Include relevant hashtags at the end

Format:
SLIDE 1:
[content]

SLIDE 2:
[content]
...`,

    linkedin_article: `${baseContext}

Transform this into a LinkedIn article (${spec.max_length} words).

Requirements:
- Professional, thought-leadership tone
- Start with industry insight or statistic
- Include 3-5 key takeaways
- Use storytelling where appropriate
- End with discussion question
- No emojis, professional language only`,

    youtube_description: `${baseContext}

Create a YouTube video description.

Requirements:
- Attention-grabbing first 2 lines (visible before "show more")
- Detailed chapter markers with timestamps (00:00 format)
- Key takeaways list
- Related resources/links
- SEO keywords naturally integrated
- CTA to visit blog for full article
- Social media links
- Don't include actual timestamps, just placeholders`,

    newsletter: `${baseContext}

Transform into an email newsletter section.

Requirements:
- Conversational, friendly tone
- Strong subject line suggestion
- Personal greeting
- 3-4 paragraph summary of key points
- Actionable tips readers can use today
- Clear CTA to read full article
- P.S. with additional value or tease`,

    email_sequence: `${baseContext}

Create a 5-email drip sequence teaching this topic.

Each email should:
- Build on previous email
- Teach one specific concept
- Include one actionable task
- Be ${spec.chars_per_email} chars max
- End with teaser for next email

Format:
EMAIL 1 - SUBJECT: [subject]
[content]

EMAIL 2 - SUBJECT: [subject]
[content]
...`,

    tiktok_script: `${baseContext}

Create a ${spec.duration_seconds}-second TikTok script.

Requirements:
- HOOK (0-3 seconds): Attention-grabbing question or statement
- CONTENT (3-50 seconds): 3-5 quick tips
- CTA (50-60 seconds): Call to action
- Use [TEXT OVERLAY] for on-screen text
- Use [VISUAL] for B-roll suggestions
- Keep language casual and energetic
- Trending audio suggestion`,

    pinterest_description: `${baseContext}

Create a Pinterest pin description (${spec.max_length} chars).

Requirements:
- Start with benefit/result
- Include target keyword in first line
- 3-5 quick tips or points
- Strong CTA
- Relevant hashtags (5-10)
- SEO-optimized for Pinterest search`,
  };

  return platformPrompts[platform] || baseContext;
}

function formatForPlatform(content: string, platform: string): any {
  switch (platform) {
    case "twitter_thread":
      const tweets = content.split(/TWEET \d+:/i).filter((t) => t.trim());
      return {
        type: "twitter_thread",
        tweets: tweets.map((t) => t.trim().substring(0, 280)),
        total_tweets: tweets.length,
      };

    case "instagram_carousel":
      const slides = content.split(/SLIDE \d+:/i).filter((s) => s.trim());
      return {
        type: "instagram_carousel",
        slides: slides.map((s) => s.trim()),
        total_slides: slides.length,
      };

    case "email_sequence":
      const emails = content.split(/EMAIL \d+/i).filter((e) => e.trim());
      return {
        type: "email_sequence",
        emails: emails.map((email) => {
          const [subject, ...body] = email.split("\n");
          return {
            subject: subject.replace(/SUBJECT:\s*/i, "").trim(),
            body: body.join("\n").trim(),
          };
        }),
      };

    default:
      return {
        type: platform,
        content: content.trim(),
      };
  }
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { post_id, platforms = [], save_to_db = true } = await req.json();

    if (!post_id) {
      return new Response(JSON.stringify({ error: "post_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!platforms || platforms.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one platform is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the blog post
    const { data: post, error: postError } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("id", post_id)
      .single();

    if (postError || !post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active AI model
    const { data: aiModel } = await supabase
      .from("ai_settings")
      .select("*")
      .eq("is_active", true)
      .single();

    if (!aiModel) {
      return new Response(
        JSON.stringify({ error: "No active AI model configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate content for each platform
    const results: Record<string, any> = {};

    for (const platform of platforms) {
      try {
        const repurposedContent = await repurposeForPlatform(
          post,
          platform,
          aiModel
        );
        results[platform] = repurposedContent;

        // Save to database if requested
        if (save_to_db) {
          await supabase.from("blog_repurposed_content").insert({
            source_post_id: post_id,
            repurpose_type: platform,
            content: repurposedContent,
            auto_generated: true,
          });
        }
      } catch (error: any) {
        console.error(`Error repurposing for ${platform}:`, error);
        results[platform] = { error: error.message };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        post_title: post.title,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error repurposing content:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
