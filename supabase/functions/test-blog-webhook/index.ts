import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin/service only: this test tool POSTs to an arbitrary URL (SSRF / open relay).
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error ?? 'Unauthorized' }), {
      status: gate.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { webhookUrl } = await req.json();

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: 'webhookUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sample payload matching exactly what blog publish sends
    const testPayload = {
      type: 'blog_published',
      blog_id: 'test-uuid-12345',
      blog_title: '10 Creative Ways to Get Toddlers to Eat Vegetables',
      blog_url: 'https://tryeatpal.com/blog/creative-ways-toddlers-eat-vegetables',
      blog_excerpt: 'Discover proven strategies to make vegetables appealing to your picky eater. From fun presentation ideas to sneaky recipes, these tips will transform mealtime battles into successes.',
      short_form: '🥦 Struggling with a veggie-refusing toddler? Our latest guide shares 10 game-changing strategies to make vegetables fun & delicious! From colorful presentations to hidden veggie recipes. Read more: https://tryeatpal.com/blog/creative-ways-toddlers-eat-vegetables #EatPal #PickyEater #ParentingTips',
      long_form: '🥦 New on the EatPal blog! If you\'re battling a toddler who refuses to eat vegetables, you\'re not alone. We\'ve compiled 10 creative, proven strategies that actually work!\n\n✨ What you\'ll learn:\n• Fun presentation techniques that make veggies irresistible\n• Sneaky recipes that hide nutrition in plain sight\n• Science-backed strategies for introducing new foods\n• Age-appropriate portion sizes and expectations\n\nTransform mealtime battles into victories! Read the full guide now.\n\n👉 https://tryeatpal.com/blog/creative-ways-toddlers-eat-vegetables\n\n#EatPal #PickyEaters #ParentingTips #ToddlerNutrition #HealthyKids #MomLife #DadLife',
      hashtags: ['EatPal', 'PickyEaters', 'ParentingTips', 'ToddlerNutrition', 'HealthyKids', 'MomLife', 'DadLife'],
      published_at: new Date().toISOString()
    };

    console.log('Sending test webhook to:', webhookUrl);
    console.log('Test payload:', JSON.stringify(testPayload, null, 2));

    // Send to the webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });

    console.log('Webhook response status:', response.status);

    let responseText = '';
    try {
      responseText = await response.text();
      console.log('Webhook response body:', responseText);
    } catch (e) {
      console.log('Could not read webhook response body');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test webhook sent successfully',
        webhookStatus: response.status,
        webhookResponse: responseText,
        payloadSent: testPayload
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Error in test-blog-webhook function:', error);
    return new Response(
      JSON.stringify({ 
        error: error?.message || 'Unknown error',
        details: 'Failed to send test webhook'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}
