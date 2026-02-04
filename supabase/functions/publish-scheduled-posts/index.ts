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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Checking for posts due for publishing...");

    // Get posts that are scheduled and due for publishing
    const { data: duePosts, error: queryError } = await supabase.rpc(
      "get_posts_due_for_publishing"
    );

    if (queryError) {
      console.error("Error querying due posts:", queryError);
      throw queryError;
    }

    if (!duePosts || duePosts.length === 0) {
      console.log("No posts due for publishing");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No posts due for publishing",
          published: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${duePosts.length} posts due for publishing`);

    const results = {
      published: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    // Publish each post
    for (const post of duePosts) {
      try {
        console.log(`Publishing post: ${post.id} - ${post.title}`);

        // Use the database function to publish
        const { data: published, error: publishError } = await supabase.rpc(
          "publish_scheduled_post",
          { p_post_id: post.id }
        );

        if (publishError) {
          throw publishError;
        }

        if (published) {
          console.log(`Successfully published: ${post.title}`);
          results.published.push(post.id);

          // Optional: Generate social media content and trigger webhook
          try {
            const blogUrl = `https://tryeatpal.com/blog/${post.slug}`;

            // Get post details
            const { data: fullPost } = await supabase
              .from("blog_posts")
              .select("*")
              .eq("id", post.id)
              .single();

            if (fullPost) {
              // Generate social content
              const { data: socialData, error: socialError } =
                await supabase.functions.invoke("generate-social-content", {
                  body: {
                    topic: fullPost.title,
                    excerpt: fullPost.excerpt || "",
                    url: blogUrl,
                    contentGoal:
                      "Promote this scheduled blog post that was just published",
                    targetAudience: "Parents of picky eaters",
                    autoPublish: false,
                  },
                });

              if (socialError) {
                console.warn("Error generating social content:", socialError);
              } else {
                console.log("Social content generated for scheduled post");
              }
            }
          } catch (socialErr) {
            console.warn("Error in social content generation:", socialErr);
            // Don't fail the publish if social content fails
          }
        } else {
          results.failed.push({
            id: post.id,
            error: "Publish function returned false",
          });
        }
      } catch (err: any) {
        console.error(`Error publishing post ${post.id}:`, err);
        results.failed.push({
          id: post.id,
          error: err.message || "Unknown error",
        });

        // Log the failure
        await supabase.from("scheduled_publish_log").insert({
          post_id: post.id,
          scheduled_for: post.scheduled_for,
          status: "failed",
          error_message: err.message || "Unknown error",
        });
      }
    }

    const response = {
      success: true,
      message: `Published ${results.published.length} of ${duePosts.length} posts`,
      published: results.published.length,
      failed: results.failed.length,
      details: results,
    };

    console.log("Publish scheduled posts complete:", response);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in publish-scheduled-posts:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
