import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      post_id,
      session_id,
      event_type,
      user_agent,
      referrer,
      user_id,
      metadata,
    } = await req.json();

    if (!post_id || !event_type) {
      return new Response(
        JSON.stringify({ error: "post_id and event_type are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Store engagement event
    const { error: eventError } = await supabase
      .from("blog_engagement_events")
      .insert({
        post_id,
        session_id,
        event_type,
        user_agent,
        referrer,
        user_id,
        event_timestamp: new Date().toISOString(),
      });

    if (eventError) {
      console.error("Error storing engagement event:", eventError);
    }

    // Update reading behavior if this is a completion event
    if (user_id && (event_type === "scroll_100" || event_type === "read_completed")) {
      const { data: behavior } = await supabase
        .from("blog_user_reading_behavior")
        .select("*")
        .eq("user_id", user_id)
        .eq("post_id", post_id)
        .order("read_at", { ascending: false })
        .limit(1)
        .single();

      if (behavior) {
        // Update existing behavior
        await supabase
          .from("blog_user_reading_behavior")
          .update({
            read_percentage: 100,
            completed: true,
            time_spent_seconds: metadata?.time_spent || behavior.time_spent_seconds,
          })
          .eq("id", behavior.id);
      } else {
        // Create new behavior record
        await supabase.from("blog_user_reading_behavior").insert({
          user_id,
          post_id,
          read_percentage: 100,
          completed: true,
          time_spent_seconds: metadata?.time_spent || 0,
          device_type: getDeviceType(user_agent || ""),
        });
      }
    }

    // Track CTA clicks
    if (event_type === "cta_clicked") {
      // Update today's analytics
      const today = new Date().toISOString().split("T")[0];

      const { data: existing } = await supabase
        .from("blog_analytics")
        .select("*")
        .eq("post_id", post_id)
        .eq("date", today)
        .single();

      if (existing) {
        await supabase
          .from("blog_analytics")
          .update({
            cta_clicks: existing.cta_clicks + 1,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("blog_analytics").insert({
          post_id,
          date: today,
          cta_clicks: 1,
          pageviews: 1,
        });
      }
    }

    // Track conversions
    if (event_type.includes("conversion_") && user_id) {
      const conversionType = event_type.replace("conversion_", "");

      await supabase.from("blog_conversions").insert({
        post_id,
        user_id,
        conversion_type: conversionType,
        conversion_value: metadata?.value || null,
        session_id,
        converted_at: new Date().toISOString(),
      });

      // Update today's analytics conversion count
      const today = new Date().toISOString().split("T")[0];

      const { data: existing } = await supabase
        .from("blog_analytics")
        .select("*")
        .eq("post_id", post_id)
        .eq("date", today)
        .single();

      if (existing) {
        await supabase
          .from("blog_analytics")
          .update({
            conversions: existing.conversions + 1,
          })
          .eq("id", existing.id);
      }
    }

    // Track A/B test variants
    if (metadata?.ab_variant && metadata?.ab_test_id) {
      const variantField =
        metadata.ab_variant === "a"
          ? "variant_a_views"
          : "variant_b_views";

      if (event_type === "pageview") {
        await supabase
          .from("blog_ab_tests")
          .update({
            [variantField]: supabase.rpc("increment", { amount: 1 }),
          })
          .eq("id", metadata.ab_test_id);
      } else if (event_type.includes("click")) {
        const clickField =
          metadata.ab_variant === "a"
            ? "variant_a_clicks"
            : "variant_b_clicks";

        await supabase
          .from("blog_ab_tests")
          .update({
            [clickField]: supabase.rpc("increment", { amount: 1 }),
          })
          .eq("id", metadata.ab_test_id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Event tracked successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error tracking engagement:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getDeviceType(userAgent: string): string {
  if (/mobile|android|iphone|ipad|ipod/i.test(userAgent)) {
    if (/ipad|tablet/i.test(userAgent)) {
      return "tablet";
    }
    return "mobile";
  }
  return "desktop";
}
