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
    const { topic, contentGoal, targetAudience } = await req.json();

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

    const systemPrompt = `You are a viral social media content creator specializing in parenting and child nutrition. Create engaging, shareable content that drives website visits and conversions. Focus on emotional hooks, practical value, and relatable scenarios that parents face with picky eaters.`;

    const userPrompt = `Create a viral social media post about: ${topic}

${contentGoal ? `Content goal: ${contentGoal}` : 'Content goal: Drive website visits and increase conversions'}
${targetAudience ? `Target audience: ${targetAudience}` : 'Target audience: Parents struggling with picky eaters and child meal planning'}

Generate engaging social media content with:

1. **Title**: A compelling, attention-grabbing title for the post
2. **Facebook Version**: 
   - 150-250 words of engaging content
   - Hook with a relatable parent struggle or question
   - Provide actionable value and tips
   - End with a clear call-to-action to visit the website
   - Include 3-5 relevant hashtags
   - Should feel conversational and authentic

3. **Twitter Version**: 
   - Maximum 280 characters
   - Punchy, attention-grabbing opening
   - Single powerful tip or insight
   - Clear call-to-action with link placeholder
   - 2-3 hashtags
   - Must create curiosity to drive clicks

Make the content:
- Emotionally resonant (empathy with parent struggles)
- Actionable (practical tips they can use immediately)
- Shareable (worth passing along to other parents)
- Conversational (like advice from a friend)
- Optimized for engagement and virality

Format your response as JSON:
{
  "title": "...",
  "facebook": "...",
  "twitter": "..."
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
        max_tokens: aiModel.max_tokens ?? 1024,
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
        // Use max_completion_tokens and remove temperature
        if (requestBody.max_tokens !== undefined) {
          requestBody.max_completion_tokens = requestBody.max_tokens;
          delete requestBody.max_tokens;
        }
        if ('temperature' in requestBody) {
          delete requestBody.temperature;
        }
      }
    }

    console.log('Calling AI API for social content:', aiModel.endpoint_url);

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
    console.log('AI response received for social content');

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
    let socialContent;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        socialContent = JSON.parse(jsonMatch[0]);
      } else {
        socialContent = JSON.parse(content);
      }
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', e);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        content: socialContent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in generate-social-content:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
