import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt } = await req.json();

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get active AI model settings
    const { data: models, error: modelsError } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (modelsError) throw modelsError;
    if (!models) {
      return new Response(
        JSON.stringify({ error: 'No active AI model configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = Deno.env.get(models.api_key_env_var);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: `API key not found: ${models.api_key_env_var}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Build headers based on auth type
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (models.auth_type === 'x-api-key') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01'; // Required for Claude
    } else if (models.auth_type === 'bearer') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (models.auth_type === 'api-key') {
      headers['api-key'] = apiKey;
    }

    // Build request body based on provider
    let requestBody: any;
    
    if (models.provider === 'claude') {
      requestBody = {
        model: models.model_name,
        max_tokens: models.max_tokens || 1024,
        messages: [
          {
            role: 'user',
            content: prompt || 'Hello! Please respond with "Test successful" to confirm you are working.'
          }
        ]
      };
      if (models.temperature !== null && models.temperature !== undefined) {
        requestBody.temperature = models.temperature;
      }
    } else if (models.provider === 'openai') {
      requestBody = {
        model: models.model_name,
        messages: [
          {
            role: 'user',
            content: prompt || 'Hello! Please respond with "Test successful" to confirm you are working.'
          }
        ],
        max_tokens: models.max_tokens || 1024,
      };
      if (models.temperature !== null && models.temperature !== undefined) {
        requestBody.temperature = models.temperature;
      }
    } else if (models.provider === 'gemini') {
      requestBody = {
        contents: [{
          parts: [{
            text: prompt || 'Hello! Please respond with "Test successful" to confirm you are working.'
          }]
        }],
        generationConfig: {
          temperature: models.temperature || 0.7,
          maxOutputTokens: models.max_tokens || 1024,
        }
      };
    }

    console.log(`Testing AI model: ${models.name} (${models.provider})`);

    // Make request to AI API
    const response = await fetch(models.endpoint_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error (${response.status}):`, errorText);
      return new Response(
        JSON.stringify({ error: `AI API error: ${errorText}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
      );
    }

    const data = await response.json();
    console.log('AI response:', data);

    // Extract response text based on provider
    let responseText = '';
    
    if (models.provider === 'claude') {
      responseText = data.content?.[0]?.text || 'No response';
    } else if (models.provider === 'openai') {
      responseText = data.choices?.[0]?.message?.content || 'No response';
    } else if (models.provider === 'gemini') {
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: responseText,
        model: models.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in test-ai-model function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
