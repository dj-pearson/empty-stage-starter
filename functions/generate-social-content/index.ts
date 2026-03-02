/**
 * Generate Social Content Edge Function (Legacy serve() pattern)
 *
 * Generates brand-aligned, platform-specific social media posts
 * with EatPal's ARFID/food chaining positioning.
 *
 * POST /generate-social-content
 * Body: {
 *   "content_summary": "string",
 *   "blog_post_id"?: "uuid",
 *   "target_platforms": ["twitter", "instagram", "facebook"]
 * }
 * Auth: JWT via Authorization header
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
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';

const PLATFORM_LIMITS: Record<string, number> = {
  twitter: 280,
  instagram: 2200,
  facebook: 63206,
};

/** Brand-aligned hashtags reflecting EatPal's ARFID/food chaining positioning */
const BRAND_HASHTAGS: Record<string, string[]> = {
  twitter: ['#EatPal', '#ARFID', '#FoodChaining', '#PickyEaters'],
  instagram: ['#EatPal', '#ARFID', '#FoodChaining', '#PickyEaters', '#FeedingTherapy', '#SensoryEating', '#FeedingDisorders'],
  facebook: ['#EatPal', '#ARFID', '#FoodChaining', '#FeedingTherapy'],
};

/** EatPal brand-aligned system prompt */
const BRAND_SYSTEM_PROMPT = `You are the social media manager for EatPal, an evidence-based, AI-powered meal planning app built on food chaining science for families dealing with ARFID, extreme picky eating, and feeding challenges.

BRAND VOICE:
- Calm, hopeful, evidence-based — never use miracle claims
- Empathetic and non-blaming toward parents
- Reference food chaining and feeding therapy naturally
- Avoid clichés like "Raise your hand if...", "Real talk", etc.

Return valid JSON only.`;

function generateTwitterPost(summary: string): { text: string; hashtags: string[] } {
  const hashtags = BRAND_HASHTAGS.twitter;
  const hashtagStr = hashtags.join(' ');
  const maxTextLen = PLATFORM_LIMITS.twitter - hashtagStr.length - 2;
  const text = summary.length > maxTextLen
    ? summary.slice(0, maxTextLen - 3) + '...'
    : summary;

  return { text: `${text}\n\n${hashtagStr}`, hashtags };
}

function generateInstagramPost(summary: string): { caption: string; hashtags: string[] } {
  const hashtags = BRAND_HASHTAGS.instagram;
  const caption = `${summary}\n\nEvidence-based food chaining strategies for families navigating ARFID and extreme picky eating. Try EatPal's free 5-day personalized plan.\n\n${hashtags.join(' ')}`;

  return { caption, hashtags };
}

function generateFacebookPost(summary: string): { text: string; hashtags: string[] } {
  const hashtags = BRAND_HASHTAGS.facebook;
  const text = `${summary}\n\nEatPal uses food chaining science to help families with ARFID and extreme picky eating take small, safe steps toward expanding their child's diet.\n\nTry a free 5-day personalized plan at tryeatpal.com\n\n${hashtags.join(' ')}`;

  return { text, hashtags };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  // Authenticate request
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

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

    const claudeApiKey = Deno.env.get('CLAUDE_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    let generationCost = { tokens: 0, cost_cents: 0, method: 'template' };

    const posts: Record<string, unknown> = {};

    const userPrompt = `Generate social media posts for these platforms: ${target_platforms.join(', ')}.
Content summary: "${content_summary}"
For each platform, return JSON with platform name as key, containing "text" (or "caption" for Instagram) and "hashtags" array.
Respect character limits: Twitter (280), Instagram (2200), Facebook (63206).
Include hashtags relevant to ARFID, food chaining, and feeding therapy. Always include #EatPal.
Frame content around evidence-based feeding strategies, not generic parenting advice.`;

    if (claudeApiKey) {
      // Prefer Claude/Anthropic
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: Deno.env.get('LIGHTWEIGHT_AI_MODEL') || 'claude-haiku-4-5-20251001',
          system: BRAND_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: 1000,
          temperature: 0.8,
        }),
      });

      if (anthropicResponse.ok) {
        const result = await anthropicResponse.json();
        const content = result.content?.[0]?.text ?? '';
        const usage = result.usage ?? {};

        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(
            jsonMatch ? jsonMatch[0].replace(/,(\s*[}\]])/g, '$1') : content
          );
          Object.assign(posts, parsed);
        } catch {
          // Fallback to template on parse failure
        }

        generationCost = {
          tokens: ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)) as number,
          cost_cents: Math.round((((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)) / 1000000) * 15 * 100) / 100,
          method: 'anthropic',
        };
      }
    } else if (openaiApiKey) {
      // Fallback to OpenAI
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: BRAND_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
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
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(
            jsonMatch ? jsonMatch[0].replace(/,(\s*[}\]])/g, '$1') : content
          );
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

    // Fill in any missing platforms with brand-aligned template generation
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
          posts[platform] = { text: content_summary, hashtags: ['#EatPal', '#ARFID', '#FoodChaining'] };
      }
    }

    return new Response(
      JSON.stringify({ posts, generation_cost: generationCost }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('generate-social-content error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
