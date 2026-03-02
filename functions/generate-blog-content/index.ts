/**
 * Generate Blog Content Edge Function (Legacy serve() pattern)
 *
 * Generates brand-aligned blog post content using AI with EatPal's
 * evidence-based, food-chaining positioning for ARFID and extreme picky eating.
 *
 * POST /generate-blog-content
 * Body: {
 *   "topic": "string",
 *   "target_keywords": ["keyword1", "keyword2"],
 *   "tone"?: "empathetic" | "evidence-based" | "conversational" | "direct" | "storytelling",
 *   "word_count"?: number
 * }
 * Auth: JWT via Authorization header
 *
 * Response (200):
 * {
 *   "title": "...",
 *   "excerpt": "...",
 *   "body": "<html>...</html>",
 *   "meta_tags": { "description": "...", "keywords": "..." },
 *   "generation_cost": { "tokens": 0, "cost_cents": 0 }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/auth.ts';

/** Escape HTML special characters to prevent stored XSS */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** EatPal brand-aligned system prompt for AI content generation */
const BRAND_SYSTEM_PROMPT = `You are an expert content writer for EatPal, an evidence-based meal planning app built on food chaining science for families dealing with extreme picky eating, ARFID (Avoidant/Restrictive Food Intake Disorder), and related feeding challenges.

BRAND VOICE:
- Calm, grounded, and hopeful — never use hype or miracle claims
- Evidence-based — reference food chaining science confidently
- Parent-first empathy — speak directly to caregivers
- Non-blaming — feeding difficulties are not the parent's fault
- Include specific food chaining examples and sensory-aware strategies

Return valid JSON only.`;

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
      topic,
      target_keywords = [],
      tone = 'empathetic',
      word_count = 1000,
    } = body;

    if (!topic || typeof topic !== 'string') {
      return new Response(
        JSON.stringify({ error: 'topic is required and must be a string' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Escape user input before interpolation into HTML templates
    const safeTopic = escapeHtml(topic);
    const safeKeywords = target_keywords.map((k: string) => escapeHtml(String(k)));

    const claudeApiKey = Deno.env.get('CLAUDE_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    let title: string;
    let excerpt: string;
    let blogBody: string;
    let generationCost = { tokens: 0, cost_cents: 0, method: 'template' };

    const userPrompt = `Write a ${word_count}-word blog post about "${topic}" in a ${tone} tone for parents of children with ARFID or extreme picky eating.
Target keywords: ${target_keywords.join(', ')}.
Include food chaining examples and a CTA for EatPal's 5-day personalized plan.
Return JSON with: title, excerpt (2 sentences about feeding challenges), body (HTML with h2, h3, p, ul, li tags).`;

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
          model: Deno.env.get('DEFAULT_AI_MODEL') || 'claude-sonnet-4-5-20250929',
          system: BRAND_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: Math.max(word_count * 2, 2000),
          temperature: 0.7,
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
          title = parsed.title ?? `${safeTopic} - An Evidence-Based Guide`;
          excerpt = parsed.excerpt ?? `Evidence-based strategies for families dealing with ${safeTopic} and feeding challenges.`;
          blogBody = parsed.body ?? `<p>Content about ${safeTopic}.</p>`;
        } catch {
          title = `${safeTopic} - An Evidence-Based Guide`;
          excerpt = `Evidence-based strategies for families dealing with ${safeTopic} and feeding challenges.`;
          blogBody = `<p>${escapeHtml(content)}</p>`;
        }

        generationCost = {
          tokens: ((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)) as number,
          cost_cents: Math.round((((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)) / 1000000) * 15 * 100) / 100,
          method: 'anthropic',
        };
      } else {
        title = `${safeTopic} - An Evidence-Based Guide`;
        excerpt = `Evidence-based strategies for families dealing with ${safeTopic} through food chaining science.`;
        blogBody = generateTemplateBlogBody(safeTopic, safeKeywords);
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
          max_tokens: Math.max(word_count * 2, 2000),
          temperature: 0.7,
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
          title = parsed.title ?? `${safeTopic} - An Evidence-Based Guide`;
          excerpt = parsed.excerpt ?? `Evidence-based strategies for families dealing with ${safeTopic} and feeding challenges.`;
          blogBody = parsed.body ?? `<p>Content about ${safeTopic}.</p>`;
        } catch {
          title = `${safeTopic} - An Evidence-Based Guide`;
          excerpt = `Evidence-based strategies for families dealing with ${safeTopic} and feeding challenges.`;
          blogBody = `<p>${escapeHtml(content)}</p>`;
        }

        generationCost = {
          tokens: (usage.total_tokens ?? 0) as number,
          cost_cents: Math.round(((usage.total_tokens ?? 0) / 1000000) * 15 * 100) / 100,
          method: 'openai',
        };
      } else {
        title = `${safeTopic} - An Evidence-Based Guide`;
        excerpt = `Evidence-based strategies for families dealing with ${safeTopic} through food chaining science.`;
        blogBody = generateTemplateBlogBody(safeTopic, safeKeywords);
      }
    } else {
      // Template-based generation (no AI keys configured)
      title = `${safeTopic} - An Evidence-Based Guide`;
      excerpt = `Evidence-based strategies for families dealing with ${safeTopic} through food chaining science.`;
      blogBody = generateTemplateBlogBody(safeTopic, safeKeywords);
    }

    const metaTags = {
      description: excerpt,
      keywords: safeKeywords.join(', '),
      og_title: title,
      og_description: excerpt,
    };

    return new Response(
      JSON.stringify({
        title,
        excerpt,
        body: blogBody,
        meta_tags: metaTags,
        generation_cost: generationCost,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('generate-blog-content error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});

function generateTemplateBlogBody(topic: string, keywords: string[]): string {
  const keywordsList = keywords.length > 0
    ? keywords.map((k) => `<li>${k}</li>`).join('\n')
    : '<li>Food chaining strategies</li>\n<li>ARFID-friendly meal ideas</li>\n<li>Sensory-aware feeding tips</li>';

  return `
<h2>Understanding ${topic}</h2>
<p>For families navigating ARFID, extreme picky eating, or sensory-related feeding challenges, ${topic} can feel overwhelming. You're not alone, and your child's eating difficulties are not your fault. This guide uses evidence-based food chaining principles to help you take small, safe steps forward.</p>

<h2>Why This Matters for Feeding Challenges</h2>
<p>Standard meal planning advice often assumes children will "just try it" — but for kids with ARFID or severe picky eating, that approach increases anxiety and refusals. ${topic} requires a different, more compassionate strategy grounded in food chaining science.</p>

<h3>Key Strategies</h3>
<ul>
${keywordsList}
</ul>

<h2>Food Chaining in Practice</h2>
<p>Food chaining works by creating tiny, manageable bridges from your child's safe foods to similar new foods. For example, if your child eats plain crackers, the next step might be crackers with a thin spread — not a completely unfamiliar food.</p>

<h3>Step 1: Map Your Child's Safe Foods</h3>
<p>Start by listing every food your child currently accepts, including specific brands, textures, and temperatures. This becomes the foundation for building food chains.</p>

<h3>Step 2: Identify Bridges</h3>
<p>Look for tiny similarities between safe foods and potential new foods — same color, similar texture, or the same brand in a different flavor.</p>

<h3>Step 3: Track Progress with EatPal</h3>
<p>Use EatPal's AI-powered meal planning tools to generate personalized food chains based on your child's specific safe foods and sensory preferences. Our app creates 5-day plans that make food chaining practical for real family life.</p>

<h2>Working with Your Feeding Therapist</h2>
<p>If your child works with a feeding therapist, sharing your EatPal data helps keep everyone aligned. Progress tracked at home gives therapists valuable insight into what's working between sessions.</p>

<h2>Taking the Next Step</h2>
<p>${topic} doesn't require perfection — it requires consistency and compassion. Every tiny step counts. Try EatPal's free 5-day personalized plan to see how food chaining can work for your family's unique situation.</p>
`.trim();
}
