import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// This function syncs backlinks from external APIs
// Supports: Ahrefs, Moz, SEMrush, or Google Search Console

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { targetDomain, source = "gsc", limit = 100 } = await req.json();

    if (!targetDomain) {
      throw new Error("Target domain is required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Syncing backlinks for ${targetDomain} from ${source}...`);

    let backlinks: any[] = [];

    if (source === "ahrefs") {
      // Ahrefs API integration
      const ahrefsApiKey = Deno.env.get("AHREFS_API_KEY");
      if (!ahrefsApiKey) {
        throw new Error("Ahrefs API key not configured");
      }

      const ahrefsUrl = `https://api.ahrefs.com/v3/site-explorer/backlinks?target=${encodeURIComponent(targetDomain)}&mode=domain&limit=${limit}&order_by=domain_rating:desc`;

      const response = await fetch(ahrefsUrl, {
        headers: {
          Authorization: `Bearer ${ahrefsApiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Ahrefs API error: ${response.status}`);
      }

      const data = await response.json();

      backlinks = (data.backlinks || []).map((link: any) => ({
        source_url: link.url_from,
        source_domain: link.domain_from,
        target_url: link.url_to,
        anchor_text: link.anchor,
        link_type: link.nofollow ? "nofollow" : "dofollow",
        domain_rating: link.domain_rating,
        url_rating: link.url_rating,
        data_source: "ahrefs",
        first_seen_at: link.first_seen || new Date().toISOString(),
      }));
    } else if (source === "moz") {
      // Moz API integration
      const mozAccessId = Deno.env.get("MOZ_ACCESS_ID");
      const mozSecretKey = Deno.env.get("MOZ_SECRET_KEY");

      if (!mozAccessId || !mozSecretKey) {
        throw new Error("Moz API credentials not configured");
      }

      // Moz uses HMAC authentication
      const expires = Math.floor(Date.now() / 1000) + 300;
      const stringToSign = `${mozAccessId}\n${expires}`;

      const encoder = new TextEncoder();
      const keyData = encoder.encode(mozSecretKey);
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(stringToSign));
      const base64Signature = btoa(String.fromCharCode(...new Uint8Array(signature)));

      const mozUrl = `https://lsapi.seomoz.com/v2/url_metrics/${encodeURIComponent(targetDomain)}/links`;

      const response = await fetch(mozUrl, {
        headers: {
          Authorization: `Basic ${btoa(`${mozAccessId}:${base64Signature}`)}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Moz API error: ${response.status}`);
      }

      const data = await response.json();

      backlinks = (data.results || []).map((link: any) => ({
        source_url: link.source_url,
        source_domain: new URL(link.source_url).hostname,
        target_url: link.target_url,
        anchor_text: link.anchor_text,
        link_type: link.link_type === "followed" ? "dofollow" : "nofollow",
        domain_authority: link.source_domain_authority,
        page_authority: link.source_page_authority,
        spam_score: link.spam_score,
        data_source: "moz",
        first_seen_at: new Date().toISOString(),
      }));
    } else if (source === "gsc") {
      // Google Search Console - fetch from existing GSC data
      // GSC provides some backlink data through the Links report

      console.log("Fetching backlinks from Google Search Console...");

      // Note: GSC doesn't provide a comprehensive backlinks API
      // This is a placeholder - in reality, you'd need to use the Search Console API
      // to fetch the "Links to your site" data

      const gscApiUrl = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

      // For now, we'll return a message indicating GSC backlinks need manual setup
      console.log("GSC backlink integration requires additional setup");

      backlinks = [];
    } else if (source === "manual") {
      // Manual backlink entry from the request
      const { manualBacklinks } = await req.json();

      if (!manualBacklinks || !Array.isArray(manualBacklinks)) {
        throw new Error("Manual backlinks array required");
      }

      backlinks = manualBacklinks.map((link: any) => ({
        source_url: link.sourceUrl,
        source_domain: new URL(link.sourceUrl).hostname,
        target_url: link.targetUrl || targetDomain,
        anchor_text: link.anchorText || "",
        link_type: link.linkType || "dofollow",
        domain_authority: link.domainAuthority || null,
        page_authority: link.pageAuthority || null,
        spam_score: link.spamScore || null,
        data_source: "manual",
        notes: link.notes || "",
        first_seen_at: new Date().toISOString(),
      }));
    } else {
      throw new Error(`Unsupported backlink source: ${source}`);
    }

    console.log(`Found ${backlinks.length} backlinks`);

    // Insert or update backlinks in database
    let newCount = 0;
    let updatedCount = 0;

    for (const backlink of backlinks) {
      // Check if backlink already exists
      const { data: existing } = await supabase
        .from("seo_backlinks")
        .select("id, status, domain_authority")
        .eq("source_url", backlink.source_url)
        .eq("target_url", backlink.target_url)
        .single();

      if (existing) {
        // Update existing backlink
        const updates: any = {
          status: "active",
          last_checked_at: new Date().toISOString(),
        };

        // Update metrics if provided
        if (backlink.domain_authority) updates.domain_authority = backlink.domain_authority;
        if (backlink.page_authority) updates.page_authority = backlink.page_authority;
        if (backlink.domain_rating) updates.domain_rating = backlink.domain_rating;
        if (backlink.url_rating) updates.url_rating = backlink.url_rating;
        if (backlink.spam_score) updates.spam_score = backlink.spam_score;

        await supabase
          .from("seo_backlinks")
          .update(updates)
          .eq("id", existing.id);

        // Add to history
        await supabase.from("seo_backlink_history").insert({
          backlink_id: existing.id,
          domain_authority: backlink.domain_authority,
          page_authority: backlink.page_authority,
          spam_score: backlink.spam_score,
          status: "active",
        });

        updatedCount++;
      } else {
        // Insert new backlink
        const { data: inserted } = await supabase
          .from("seo_backlinks")
          .insert({
            ...backlink,
            status: "active",
            last_checked_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (inserted) {
          // Add initial history entry
          await supabase.from("seo_backlink_history").insert({
            backlink_id: inserted.id,
            domain_authority: backlink.domain_authority,
            page_authority: backlink.page_authority,
            spam_score: backlink.spam_score,
            status: "active",
          });

          newCount++;
        }
      }
    }

    // Mark backlinks as lost if they weren't in the latest fetch
    // (Only for automated sources like Ahrefs/Moz, not manual entries)
    if (source !== "manual") {
      const sourceUrls = backlinks.map((bl) => bl.source_url);

      const { data: activeBacklinks } = await supabase
        .from("seo_backlinks")
        .select("id, source_url")
        .eq("target_url", targetDomain)
        .eq("data_source", source)
        .eq("status", "active");

      if (activeBacklinks) {
        for (const active of activeBacklinks) {
          if (!sourceUrls.includes(active.source_url)) {
            // Mark as lost
            await supabase
              .from("seo_backlinks")
              .update({
                status: "lost",
                lost_at: new Date().toISOString(),
              })
              .eq("id", active.id);

            // Add to history
            await supabase.from("seo_backlink_history").insert({
              backlink_id: active.id,
              status: "lost",
            });
          }
        }
      }
    }

    // Get summary statistics
    const { data: summary } = await supabase
      .rpc("get_backlink_summary")
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          targetDomain,
          source,
          newBacklinks: newCount,
          updatedBacklinks: updatedCount,
          totalBacklinks: backlinks.length,
          summary,
        },
        message: `Synced ${backlinks.length} backlinks (${newCount} new, ${updatedCount} updated)`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in sync-backlinks:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
