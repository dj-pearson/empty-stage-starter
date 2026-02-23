/**
 * Generate Social Content Edge Function
 *
 * Generates platform-specific social media posts for blog content promotion.
 *
 * POST /generate-social-content
 * Body: {
 *   "content_summary": "string",
 *   "blog_post_id"?: "uuid",
 *   "target_platforms": ["twitter", "instagram", "facebook"]
 * }
 * Auth: No JWT (internal use)
 *
 * Response (200):
 * {
 *   "posts": {
 *     "twitter": { "text": "...", "hashtags": [...] },
 *     "instagram": { "caption": "...", "hashtags": [...] },
 *     "facebook": { "text": "...", "hashtags": [...] }
 *   },
 *   "generation_cost": { "tokens": 0, "cost_cents": 0 }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLATFORM_LIMITS: Record<string, number> = {
  twitter: 280,
  instagram: 2200,
  facebook: 63206,
};

const DEFAULT_HASHTAGS: Record<string, string[]> = {
  twitter: ['#EatPal', '#MealPlanning', '#FamilyNutrition', '#HealthyKids'],
  instagram: ['#EatPal', '#MealPlanning', '#FamilyNutrition', '#HealthyKids', '#MealPrep', '#HealthyFamily', '#KidFood'],
  facebook: ['#EatPal', '#MealPlanning', '#FamilyNutrition'],
};

function generateTwitterPost(summary: string): { text: string; hashtags: string[] } {
  const hashtags = DEFAULT_HASHTAGS.twitter;
  const hashtagStr = hashtags.join(' ');
  const maxTextLen = PLATFORM_LIMITS.twitter - hashtagStr.length - 2;
  const text = summary.length > maxTextLen
    ? summary.slice(0, maxTextLen - 3) + '...'
    : summary;

  return { text: `${text}\n\n${hashtagStr}`, hashtags };
}

function generateInstagramPost(summary: string): { caption: string; hashtags: string[] } {
  const hashtags = DEFAULT_HASHTAGS.instagram;
  const caption = `${summary}\n\n🍎 Ready to transform your family's meal planning? Try EatPal today!\n\n${hashtags.join(' ')}`;

  return { caption, hashtags };
}

function generateFacebookPost(summary: string): { text: string; hashtags: string[] } {
  const hashtags = DEFAULT_HASHTAGS.facebook;
  const text = `${summary}\n\n👨‍👩‍👧‍👦 Discover how EatPal helps families plan healthier meals, track nutrition, and make grocery shopping easier.\n\n🔗 Learn more at tryeatpal.com\n\n${hashtags.join(' ')}`;

  return { text, hashtags };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const body = await req.json();
    const {
      content_summary,
      target_platforms = ['twitter', 'instagram', 'facebook'],
    } = body;

    if (!content_summary || typeof content_summary !== 'string') {
      return new Response(
        JSON.stringify({ error: 'content_summary is required and must be a string' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!Array.isArray(target_platforms) || target_platforms.length === 0) {
      return new Response(
        JSON.stringify({ error: 'target_platforms must be a non-empty array' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    let generationCost = { tokens: 0, cost_cents: 0, method: 'template' };

    const posts: Record<string, unknown> = {};

    if (openaiApiKey) {
      // AI-powered generation
      const prompt = `Generate social media posts for these platforms: ${target_platforms.join(', ')}.
Content summary: "${content_summary}"
For each platform, return JSON with platform name as key, containing "text" (or "caption" for Instagram) and "hashtags" array.
Respect character limits: Twitter (280), Instagram (2200), Facebook (63206).
Include relevant hashtags. Brand: EatPal (family meal planning app).`;

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a social media manager for EatPal, a family meal planning app. Return valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1000,
          temperature: 0.8,
        }),
      });

      if (openaiResponse.ok) {
        const result = await openaiResponse.json();
        const content = result.choices?.[0]?.message?.content ?? '';
        const usage = result.usage ?? {};

        try {
          const parsed = JSON.parse(content);
          Object.assign(posts, parsed);
        } catch {
          // Fallback to template on parse failure
        }

        generationCost = {
          tokens: (usage.total_tokens ?? 0) as number,
          cost_cents: Math.round(((usage.total_tokens ?? 0) / 1000000) * 15 * 100) / 100,
          method: 'openai',
        };
      }
    }

    // Fill in any missing platforms with template generation
    for (const platform of target_platforms) {
      if (posts[platform]) continue;

      switch (platform) {
        case 'twitter':
          posts.twitter = generateTwitterPost(content_summary);
          break;
        case 'instagram':
          posts.instagram = generateInstagramPost(content_summary);
          break;
        case 'facebook':
          posts.facebook = generateFacebookPost(content_summary);
          break;
        default:
          posts[platform] = { text: content_summary, hashtags: ['#EatPal'] };
      }
    }

    return new Response(
      JSON.stringify({ posts, generation_cost: generationCost }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('generate-social-content error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
