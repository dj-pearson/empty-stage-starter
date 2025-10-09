import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, keywords, targetAudience } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: 'Topic is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get active AI model
    const { data: aiModel, error: aiError } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('is_active', true)
      .single();

    if (aiError || !aiModel) {
      return new Response(
        JSON.stringify({ error: 'No active AI model configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get(aiModel.api_key_env_var);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `API key not configured: ${aiModel.api_key_env_var}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an expert content writer specializing in parenting, child nutrition, and family wellness. Create comprehensive, SEO-optimized blog content that is engaging, informative, and actionable for parents.`;

    const userPrompt = `Create a complete blog article about: ${topic}

${keywords ? `Focus on these keywords: ${keywords}` : ''}
${targetAudience ? `Target audience: ${targetAudience}` : 'Target audience: Parents of picky eaters and young children'}

Generate a comprehensive blog post with the following structure:

1. **Title**: An engaging, SEO-friendly title (60 characters max)
2. **SEO Title**: Optimized meta title for search engines (60 characters max)
3. **SEO Description**: Compelling meta description (150-160 characters)
4. **Excerpt**: A brief summary (150-200 words) that hooks readers
5. **Body Content**: 
   - Introduction (hook the reader)
   - Main content sections with clear headings
   - Practical tips and actionable advice
   - Examples and real-world scenarios
   - Conclusion with call-to-action
   - Minimum 1500 words
6. **FAQ Section**: 5-7 frequently asked questions with detailed answers
7. **Social Media Versions**:
   - **Twitter Version**: Engaging 280-character post that drives clicks to the article
   - **Facebook Version**: 2-3 paragraph engaging post (150-200 words) that provides value while encouraging article visits

Format your response as JSON:
{
  "title": "...",
  "seo_title": "...",
  "seo_description": "...",
  "excerpt": "...",
  "body": "...",
  "faq": [
    {"question": "...", "answer": "..."}
  ],
  "social": {
    "twitter": "...",
    "facebook": "..."
  }
}`;

    // Build API request
    const authHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add Anthropic version header if using Anthropic API
    if (aiModel.endpoint_url.includes('anthropic.com')) {
      authHeaders['anthropic-version'] = '2023-06-01';
    }

    if (aiModel.auth_type === 'x-api-key') {
      authHeaders['x-api-key'] = apiKey;
    } else if (aiModel.auth_type === 'bearer') {
      authHeaders['Authorization'] = `Bearer ${apiKey}`;
    } else if (aiModel.auth_type === 'api-key') {
      authHeaders['api-key'] = apiKey;
    }

    // Build provider-specific request body
    let requestBody: any;
    const isAnthropic = aiModel.endpoint_url.includes('anthropic.com');
    const isOpenAI = aiModel.endpoint_url.includes('openai.com');

    if (isAnthropic) {
      // Anthropic Messages API: system is top-level and max_tokens is required
      requestBody = {
        model: aiModel.model_name,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        max_tokens: aiModel.max_tokens ?? 2048,
      };

      if (aiModel.temperature !== null) {
        requestBody.temperature = aiModel.temperature;
      }
      if (aiModel.additional_params) {
        Object.assign(requestBody, aiModel.additional_params);
      }
    } else {
      // OpenAI-style schema by default
      requestBody = {
        model: aiModel.model_name,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      };

      if (aiModel.temperature !== null) {
        requestBody.temperature = aiModel.temperature;
      }
      if (aiModel.max_tokens !== null) {
        requestBody.max_tokens = aiModel.max_tokens;
      }
      if (aiModel.additional_params) {
        Object.assign(requestBody, aiModel.additional_params);
      }

      // Handle GPT-5 and newer OpenAI params per requirements
      if (isOpenAI && /^(gpt-5|o3|o4)/.test(aiModel.model_name)) {
        if (requestBody.max_tokens !== undefined) {
          requestBody.max_completion_tokens = requestBody.max_tokens;
          delete requestBody.max_tokens;
        }
        if ('temperature' in requestBody) {
          delete requestBody.temperature;
        }
      }
    }

    console.log('Calling AI API:', aiModel.endpoint_url);

    const aiResponse = await fetch(aiModel.endpoint_url, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI API error: ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    console.log('AI response received');

    let content = '';
    if (aiData.content && Array.isArray(aiData.content)) {
      content = aiData.content.find((c: any) => c.type === 'text')?.text || '';
    } else if (aiData.choices && aiData.choices[0]?.message?.content) {
      content = aiData.choices[0].message.content;
    }

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'No content received from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON from response
    let blogContent;
    try {
      // Try to find JSON object in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        
        // Clean up common JSON issues from AI responses
        // Remove trailing commas before closing brackets/braces
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
        
        blogContent = JSON.parse(jsonStr);
      } else {
        blogContent = JSON.parse(content);
      }
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', e);
      console.error('Raw content:', content.substring(0, 1000));
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response. The AI may have returned invalid JSON format.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        content: blogContent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in generate-blog-content:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
