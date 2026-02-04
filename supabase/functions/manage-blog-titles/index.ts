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
    const { titles, action = "populate", count: requestedCount } = await req.json();

    if (action !== "get_insights" && action !== "get_suggestions" && (!titles || !Array.isArray(titles))) {
      return new Response(
        JSON.stringify({ error: "Titles array is required for populate action" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "populate") {
      // Use the database function to populate title bank
      const { data, error } = await supabase.rpc("populate_title_bank", {
        titles_json: titles,
      });

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          inserted: data,
          message: `Successfully added ${data} new titles to the title bank`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (action === "get_insights") {
      // Get generation insights
      const { data, error } = await supabase.rpc(
        "get_blog_generation_insights"
      );

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, insights: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "get_suggestions") {
      // Get diverse title suggestions
      const count = requestedCount || 10;
      const { data, error } = await supabase.rpc(
        "get_diverse_title_suggestions",
        { count }
      );

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, suggestions: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in manage-blog-titles:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
