// =====================================================
// ANALYZE BLOG POSTS SEO - EDGE FUNCTION
// =====================================================
// Analyzes all published blog posts for SEO and stores
// scores in the seo_page_scores table
// =====================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Fetch all published blog posts (including those with null published_at)
    const { data: posts, error: postsError } = await supabaseClient
      .from("blog_posts")
      .select("id, slug, title, content, excerpt, meta_title, meta_description, featured_image_url, status")
      .eq("status", "published");

    if (postsError) throw postsError;

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No published posts to analyze", analyzed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = req.headers.get("origin") || "https://eatpal.com";
    const analyzedPages = [];

    // Analyze each post
    for (const post of posts) {
      try {
        const pageUrl = `${baseUrl}/blog/${post.slug}`;
        const pageAnalysis = analyzePostSEO(post, pageUrl);

        // Upsert to database
        const { error: upsertError } = await supabaseClient
          .from("seo_page_scores")
          .upsert({
            page_url: pageUrl,
            page_title: post.title,
            page_type: "blog_post",
            overall_score: pageAnalysis.overall_score,
            technical_score: pageAnalysis.technical_score,
            onpage_score: pageAnalysis.onpage_score,
            content_score: pageAnalysis.content_score,
            word_count: pageAnalysis.word_count,
            has_title_tag: pageAnalysis.has_title_tag,
            has_meta_description: pageAnalysis.has_meta_description,
            has_h1: pageAnalysis.has_h1,
            has_og_tags: pageAnalysis.has_og_tags,
            issues_count: pageAnalysis.issues.length,
            high_priority_issues: pageAnalysis.high_priority_issues,
            medium_priority_issues: pageAnalysis.medium_priority_issues,
            low_priority_issues: pageAnalysis.low_priority_issues,
            issues: pageAnalysis.issues,
            last_analyzed_at: new Date().toISOString(),
          }, {
            onConflict: "page_url",
          });

        if (upsertError) {
          console.error(`Error saving analysis for ${post.slug}:`, upsertError);
        } else {
          analyzedPages.push({
            url: pageUrl,
            title: post.title,
            score: pageAnalysis.overall_score,
          });
        }
      } catch (error) {
        console.error(`Error analyzing post ${post.slug}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        analyzed: analyzedPages.length,
        total: posts.length,
        pages: analyzedPages,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-blog-posts-seo:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

interface PostAnalysis {
  overall_score: number;
  technical_score: number;
  onpage_score: number;
  content_score: number;
  word_count: number;
  has_title_tag: boolean;
  has_meta_description: boolean;
  has_h1: boolean;
  has_og_tags: boolean;
  issues: any[];
  high_priority_issues: number;
  medium_priority_issues: number;
  low_priority_issues: number;
}

function analyzePostSEO(post: any, pageUrl: string): PostAnalysis {
  const issues: any[] = [];
  let technicalChecks = 0;
  let technicalPassed = 0;
  let onPageChecks = 0;
  let onPagePassed = 0;
  let contentChecks = 0;
  let contentPassed = 0;

  // Calculate word count
  const content = post.content || "";
  const wordCount = content.trim().split(/\s+/).length;

  // TECHNICAL SEO CHECKS

  // Title Tag
  technicalChecks++;
  const hasTitle = post.meta_title && post.meta_title.length > 0;
  const titleLength = post.meta_title?.length || post.title?.length || 0;

  if (!hasTitle && !post.title) {
    issues.push({
      category: "Technical SEO",
      item: "Title Tag",
      severity: "high",
      message: "Missing title tag",
      fix: "Add a title tag to the post",
    });
  } else if (titleLength < 30 || titleLength > 60) {
    issues.push({
      category: "Technical SEO",
      item: "Title Tag",
      severity: "medium",
      message: `Title length is ${titleLength} characters (optimal: 30-60)`,
      fix: "Adjust title length to 30-60 characters",
    });
  } else {
    technicalPassed++;
  }

  // Meta Description
  technicalChecks++;
  const hasMetaDesc = post.meta_description && post.meta_description.length > 0;
  const metaDescLength = post.meta_description?.length || post.excerpt?.length || 0;

  if (!hasMetaDesc && !post.excerpt) {
    issues.push({
      category: "Technical SEO",
      item: "Meta Description",
      severity: "high",
      message: "Missing meta description",
      fix: "Add a meta description to improve click-through rates",
    });
  } else if (metaDescLength < 120 || metaDescLength > 160) {
    issues.push({
      category: "Technical SEO",
      item: "Meta Description",
      severity: "medium",
      message: `Meta description is ${metaDescLength} characters (optimal: 120-160)`,
      fix: "Adjust meta description to 120-160 characters",
    });
  } else {
    technicalPassed++;
  }

  // Featured Image (OG Image)
  technicalChecks++;
  if (post.featured_image_url) {
    technicalPassed++;
  } else {
    issues.push({
      category: "Technical SEO",
      item: "Open Graph Image",
      severity: "medium",
      message: "Missing featured image for social sharing",
      fix: "Add a featured image to improve social media appearance",
    });
  }

  // ON-PAGE SEO CHECKS

  // H1 Tag (we assume the title is the H1)
  onPageChecks++;
  if (post.title && post.title.length > 0) {
    onPagePassed++;
  } else {
    issues.push({
      category: "On-Page SEO",
      item: "H1 Tag",
      severity: "high",
      message: "Missing H1 heading",
      fix: "Add a main heading (H1) to the post",
    });
  }

  // Content Quality
  onPageChecks++;
  if (content.includes("##") || content.includes("<h2")) {
    onPagePassed++; // Has subheadings
  } else {
    issues.push({
      category: "On-Page SEO",
      item: "Heading Structure",
      severity: "low",
      message: "No subheadings (H2) found",
      fix: "Add subheadings to improve content structure",
    });
  }

  // CONTENT QUALITY CHECKS

  // Word Count
  contentChecks++;
  if (wordCount >= 300) {
    contentPassed++;
  } else {
    issues.push({
      category: "Content Quality",
      item: "Word Count",
      severity: "high",
      message: `Content is only ${wordCount} words (minimum recommended: 300)`,
      fix: "Expand content to at least 300 words for better SEO",
    });
  }

  // Keyword in Title
  contentChecks++;
  const titleLower = (post.title || "").toLowerCase();
  const hasRelevantKeywords = titleLower.includes("meal") ||
                              titleLower.includes("food") ||
                              titleLower.includes("picky") ||
                              titleLower.includes("kid") ||
                              titleLower.includes("child");

  if (hasRelevantKeywords) {
    contentPassed++;
  } else {
    issues.push({
      category: "Content Quality",
      item: "Keyword Optimization",
      severity: "medium",
      message: "Title doesn't contain primary keywords",
      fix: "Include relevant keywords in the title",
    });
  }

  // Calculate scores
  const technicalScore = technicalChecks > 0 ? Math.round((technicalPassed / technicalChecks) * 100) : 100;
  const onPageScore = onPageChecks > 0 ? Math.round((onPagePassed / onPageChecks) * 100) : 100;
  const contentScore = contentChecks > 0 ? Math.round((contentPassed / contentChecks) * 100) : 100;

  // Overall score (weighted average)
  const overallScore = Math.round(
    (technicalScore * 0.4) + (onPageScore * 0.3) + (contentScore * 0.3)
  );

  // Count issues by severity
  const highPriorityIssues = issues.filter(i => i.severity === "high").length;
  const mediumPriorityIssues = issues.filter(i => i.severity === "medium").length;
  const lowPriorityIssues = issues.filter(i => i.severity === "low").length;

  return {
    overall_score: overallScore,
    technical_score: technicalScore,
    onpage_score: onPageScore,
    content_score: contentScore,
    word_count: wordCount,
    has_title_tag: hasTitle || !!post.title,
    has_meta_description: hasMetaDesc || !!post.excerpt,
    has_h1: !!post.title,
    has_og_tags: !!post.featured_image_url,
    issues,
    high_priority_issues: highPriorityIssues,
    medium_priority_issues: mediumPriorityIssues,
    low_priority_issues: lowPriorityIssues,
  };
}
