// =====================================================
// GSC FETCH PROPERTIES - EDGE FUNCTION
// =====================================================
// Fetches list of verified properties from Google Search Console
// and saves them to the database
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";

export default async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get OAuth credentials
    const { data: credentials, error: credError } = await supabaseClient
      .from("gsc_oauth_credentials")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (credError || !credentials) {
      return new Response(
        JSON.stringify({ error: "No GSC credentials found. Please authenticate first." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expired
    if (new Date(credentials.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Access token expired. Please refresh." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch properties from GSC API
    const url = `${GSC_API_BASE}/sites`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${credentials.access_token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("GSC API error:", errorText);
      return new Response(
        JSON.stringify({ error: `Failed to fetch properties: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const properties = data.siteEntry || [];

    // Save properties to database
    const savedProperties = [];

    for (const prop of properties) {
      // Determine property type
      let propertyType = "URL_PREFIX";
      if (prop.siteUrl.startsWith("sc-domain:")) {
        propertyType = "DOMAIN";
      }

      // Check if this is the first property (make it primary)
      const { data: existingProperties } = await supabaseClient
        .from("gsc_properties")
        .select("id")
        .eq("user_id", userId);

      const isPrimary = !existingProperties || existingProperties.length === 0;

      // Upsert property
      const { data: savedProperty, error: saveError } = await supabaseClient
        .from("gsc_properties")
        .upsert({
          user_id: userId,
          property_url: prop.siteUrl,
          property_type: propertyType,
          display_name: prop.siteUrl.replace("sc-domain:", ""),
          is_verified: true,
          permission_level: prop.permissionLevel || "OWNER",
          is_primary: isPrimary,
          sync_enabled: true,
        }, {
          onConflict: "property_url,user_id"
        })
        .select()
        .single();

      if (saveError) {
        console.error("Error saving property:", saveError);
      } else {
        savedProperties.push(savedProperty);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        propertiesFound: properties.length,
        propertiesSaved: savedProperties.length,
        properties: savedProperties,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in gsc-fetch-properties:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
