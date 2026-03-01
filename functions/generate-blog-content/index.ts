/**
 * Generate Blog Content Edge Function
 *
 * Generates blog post content using AI (OpenAI) or returns a structured
 * template when AI is not configured.
 *
 * POST /generate-blog-content
 * Body: {
 *   "topic": "string",
 *   "target_keywords": ["keyword1", "keyword2"],
 *   "tone"?: "informative" | "conversational" | "professional",
 *   "word_count"?: number
 * }
 * Auth: No JWT (internal use, protected by other means)
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
      tone = 'informative',
      word_count = 800,
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

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    let title: string;
    let excerpt: string;
    let blogBody: string;
    let generationCost = { tokens: 0, cost_cents: 0, method: 'template' };

    if (openaiApiKey) {
      // Use OpenAI for generation
      const prompt = `Write a ${word_count}-word blog post about "${topic}" in a ${tone} tone.
Target keywords: ${target_keywords.join(', ')}.
Return JSON with: title, excerpt (2 sentences), body (HTML with h2, h3, p, ul, li tags).`;

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a professional blog writer for a family meal planning app called EatPal. Return valid JSON only.' },
            { role: 'user', content: prompt },
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
          const parsed = JSON.parse(content);
          title = parsed.title ?? `${safeTopic} - A Complete Guide`;
          excerpt = parsed.excerpt ?? `Learn everything about ${safeTopic} in this comprehensive guide.`;
          blogBody = parsed.body ?? `<p>Content about ${safeTopic}.</p>`;
        } catch {
          title = `${safeTopic} - A Complete Guide`;
          excerpt = `Learn everything about ${safeTopic} in this comprehensive guide.`;
          blogBody = `<p>${escapeHtml(content)}</p>`;
        }

        generationCost = {
          tokens: (usage.total_tokens ?? 0) as number,
          cost_cents: Math.round(((usage.total_tokens ?? 0) / 1000000) * 15 * 100) / 100,
          method: 'openai',
        };
      } else {
        // Fallback to template if OpenAI fails
        title = `${safeTopic} - A Complete Guide`;
        excerpt = `Discover everything you need to know about ${safeTopic} for your family's nutrition journey.`;
        blogBody = generateTemplateBlogBody(safeTopic, safeKeywords, tone);
      }
    } else {
      // Template-based generation
      title = `${safeTopic} - A Complete Guide`;
      excerpt = `Discover everything you need to know about ${safeTopic} for your family's nutrition journey.`;
      blogBody = generateTemplateBlogBody(safeTopic, safeKeywords, tone);
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

function generateTemplateBlogBody(topic: string, keywords: string[], tone: string): string {
  const keywordsList = keywords.length > 0
    ? keywords.map((k) => `<li>${k}</li>`).join('\n')
    : '<li>Healthy eating</li>\n<li>Family nutrition</li>';

  return `
<h2>Introduction to ${topic}</h2>
<p>Understanding ${topic} is essential for families looking to improve their nutrition and meal planning. In this guide, we'll cover everything you need to know.</p>

<h2>Why ${topic} Matters</h2>
<p>For busy parents, ${topic} can make a significant difference in daily meal preparation and overall family health.</p>

<h3>Key Benefits</h3>
<ul>
${keywordsList}
</ul>

<h2>Getting Started</h2>
<p>Here are practical steps to incorporate ${topic} into your family's routine.</p>

<h3>Step 1: Assess Your Current Situation</h3>
<p>Start by evaluating where you are today and identifying areas for improvement.</p>

<h3>Step 2: Create a Plan</h3>
<p>Use EatPal's meal planning tools to create a structured approach to ${topic}.</p>

<h3>Step 3: Track Your Progress</h3>
<p>Monitor your family's progress and adjust your approach as needed.</p>

<h2>Conclusion</h2>
<p>${topic} doesn't have to be overwhelming. With the right tools and approach, any family can improve their nutrition and meal planning habits.</p>
`.trim();
}
