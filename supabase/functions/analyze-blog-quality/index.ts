import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QualityAnalysis {
  seo_score: number;
  readability_score: number;
  engagement_score: number;
  uniqueness_score: number;
  comprehensiveness_score: number;
  overall_score: number;
  issues: Array<{ type: string; severity: string; message: string }>;
  suggestions: Array<{ category: string; suggestion: string; impact: string }>;
}

// Calculate Flesch Reading Ease score
function calculateFleschScore(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const syllables = words.reduce((count, word) => {
    return count + countSyllables(word);
  }, 0);

  if (sentences.length === 0 || words.length === 0) return 0;

  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;

  return Math.max(
    0,
    Math.min(
      100,
      206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord
    )
  );
}

function countSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// Extract headings from content
function extractHeadings(content: string): { h1: number; h2: number; h3: number } {
  const h1Count = (content.match(/<h1[^>]*>|^#\s/gm) || []).length;
  const h2Count = (content.match(/<h2[^>]*>|^##\s/gm) || []).length;
  const h3Count = (content.match(/<h3[^>]*>|^###\s/gm) || []).length;
  return { h1: h1Count, h2: h2Count, h3: h3Count };
}

// Count images
function countImages(content: string): number {
  return (content.match(/<img[^>]+>|!\[.*?\]\(.*?\)/g) || []).length;
}

// Check for alt tags
function checkImageAltTags(content: string): { total: number; withAlt: number } {
  const imgTags = content.match(/<img[^>]+>/g) || [];
  const withAlt = imgTags.filter((tag) => tag.includes("alt=")).length;
  return { total: imgTags.length, withAlt };
}

// Count internal/external links
function countLinks(content: string): { internal: number; external: number } {
  const links = content.match(/<a[^>]+href=["']([^"']+)["']/g) || [];
  let internal = 0;
  let external = 0;

  links.forEach((link) => {
    if (link.includes("tryeatpal.com") || link.startsWith("/")) {
      internal++;
    } else if (link.includes("http")) {
      external++;
    }
  });

  return { internal, external };
}

// Calculate keyword density
function calculateKeywordDensity(content: string, keyword: string): number {
  const cleanContent = content.toLowerCase().replace(/<[^>]+>/g, " ");
  const words = cleanContent.split(/\s+/).filter((w) => w.length > 0);
  const keywordWords = keyword.toLowerCase().split(/\s+/);

  if (words.length === 0) return 0;

  let count = 0;
  for (let i = 0; i <= words.length - keywordWords.length; i++) {
    let match = true;
    for (let j = 0; j < keywordWords.length; j++) {
      if (!words[i + j]?.includes(keywordWords[j])) {
        match = false;
        break;
      }
    }
    if (match) count++;
  }

  return (count / words.length) * 100;
}

// Analyze content quality
async function analyzeContent(
  post: any,
  targetKeyword: string
): Promise<QualityAnalysis> {
  const issues: Array<{ type: string; severity: string; message: string }> = [];
  const suggestions: Array<{ category: string; suggestion: string; impact: string }> = [];

  // SEO Analysis
  let seoScore = 100;

  // Title length (50-60 optimal)
  const titleLength = post.title.length;
  if (titleLength < 30) {
    seoScore -= 10;
    issues.push({
      type: "seo",
      severity: "high",
      message: `Title is too short (${titleLength} chars). Optimal: 50-60.`,
    });
    suggestions.push({
      category: "SEO",
      suggestion: "Expand your title to include more relevant keywords",
      impact: "high",
    });
  } else if (titleLength > 70) {
    seoScore -= 5;
    issues.push({
      type: "seo",
      severity: "medium",
      message: `Title is too long (${titleLength} chars). It may be truncated in search results.`,
    });
  }

  // Meta description (150-160 optimal)
  const metaDescLength = post.meta_description?.length || 0;
  if (metaDescLength === 0) {
    seoScore -= 15;
    issues.push({
      type: "seo",
      severity: "high",
      message: "Missing meta description",
    });
    suggestions.push({
      category: "SEO",
      suggestion: "Add a compelling 150-160 character meta description",
      impact: "high",
    });
  } else if (metaDescLength < 120) {
    seoScore -= 5;
    issues.push({
      type: "seo",
      severity: "medium",
      message: `Meta description is short (${metaDescLength} chars)`,
    });
  }

  // Heading structure
  const headings = extractHeadings(post.content);
  if (headings.h1 === 0) {
    seoScore -= 10;
    issues.push({
      type: "seo",
      severity: "high",
      message: "No H1 heading found in content",
    });
    suggestions.push({
      category: "Structure",
      suggestion: "Add a main H1 heading to structure your content",
      impact: "high",
    });
  } else if (headings.h1 > 1) {
    seoScore -= 5;
    issues.push({
      type: "seo",
      severity: "medium",
      message: `Multiple H1 headings (${headings.h1}). Should be only 1.`,
    });
  }

  if (headings.h2 < 3) {
    seoScore -= 5;
    suggestions.push({
      category: "Structure",
      suggestion: "Add more H2 subheadings to improve scannability (3-7 recommended)",
      impact: "medium",
    });
  }

  // Images
  const imageCount = countImages(post.content);
  const altTags = checkImageAltTags(post.content);

  if (imageCount === 0) {
    seoScore -= 10;
    suggestions.push({
      category: "Engagement",
      suggestion: "Add images to break up text and improve engagement",
      impact: "medium",
    });
  } else if (altTags.withAlt < altTags.total) {
    seoScore -= 5;
    issues.push({
      type: "seo",
      severity: "medium",
      message: `${altTags.total - altTags.withAlt} images missing alt text`,
    });
    suggestions.push({
      category: "Accessibility",
      suggestion: "Add descriptive alt text to all images for SEO and accessibility",
      impact: "medium",
    });
  }

  // Internal/external links
  const links = countLinks(post.content);
  if (links.internal < 2) {
    seoScore -= 5;
    suggestions.push({
      category: "SEO",
      suggestion: "Add 2-5 internal links to related content",
      impact: "medium",
    });
  }

  if (links.external < 1) {
    suggestions.push({
      category: "Authority",
      suggestion: "Link to 1-2 authoritative external sources",
      impact: "low",
    });
  }

  // Keyword density
  if (targetKeyword) {
    const density = calculateKeywordDensity(post.content, targetKeyword);
    if (density < 0.5) {
      seoScore -= 5;
      suggestions.push({
        category: "SEO",
        suggestion: `Increase usage of target keyword "${targetKeyword}" (current: ${density.toFixed(2)}%)`,
        impact: "high",
      });
    } else if (density > 3) {
      seoScore -= 10;
      issues.push({
        type: "seo",
        severity: "high",
        message: `Keyword density too high (${density.toFixed(2)}%). Risk of keyword stuffing.`,
      });
    }
  }

  // Readability Analysis
  const fleschScore = calculateFleschScore(post.content);
  let readabilityScore = fleschScore;

  if (fleschScore < 60) {
    suggestions.push({
      category: "Readability",
      suggestion: "Simplify sentence structure for better readability",
      impact: "medium",
    });
  }

  // Word count
  const wordCount = post.content.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount < 300) {
    readabilityScore -= 20;
    issues.push({
      type: "content",
      severity: "high",
      message: `Content is very short (${wordCount} words). Aim for 1000-2000.`,
    });
    suggestions.push({
      category: "Depth",
      suggestion: "Expand content with more detailed information and examples",
      impact: "high",
    });
  } else if (wordCount < 800) {
    readabilityScore -= 10;
    suggestions.push({
      category: "Depth",
      suggestion: "Consider expanding content to 1000+ words for better SEO",
      impact: "medium",
    });
  }

  // Engagement Analysis
  let engagementScore = 70;

  // Has lists/bullets
  const hasList = /<ul|<ol|^[-*+]\s/m.test(post.content);
  if (hasList) {
    engagementScore += 10;
  } else {
    suggestions.push({
      category: "Engagement",
      suggestion: "Add bullet points or numbered lists for better scannability",
      impact: "medium",
    });
  }

  // Has images
  if (imageCount > 0) {
    engagementScore += 10;
  }

  // Has CTA
  const hasCTA =
    /call to action|sign up|subscribe|download|learn more|get started/i.test(
      post.content
    );
  if (hasCTA) {
    engagementScore += 10;
  } else {
    suggestions.push({
      category: "Conversion",
      suggestion: "Add a clear call-to-action to drive user engagement",
      impact: "high",
    });
  }

  // Uniqueness (placeholder - would integrate with plagiarism check)
  const uniquenessScore = 85;

  // Comprehensiveness
  let comprehensivenessScore = 70;
  if (wordCount > 1500) comprehensivenessScore += 15;
  if (headings.h2 >= 5) comprehensivenessScore += 10;
  if (imageCount >= 3) comprehensivenessScore += 5;

  // Overall score (weighted average)
  const overallScore =
    seoScore * 0.3 +
    readabilityScore * 0.2 +
    engagementScore * 0.25 +
    uniquenessScore * 0.15 +
    comprehensivenessScore * 0.1;

  return {
    seo_score: Math.max(0, Math.min(100, seoScore)),
    readability_score: Math.max(0, Math.min(100, readabilityScore)),
    engagement_score: Math.max(0, Math.min(100, engagementScore)),
    uniqueness_score: uniquenessScore,
    comprehensiveness_score: Math.max(0, Math.min(100, comprehensivenessScore)),
    overall_score: Math.max(0, Math.min(100, overallScore)),
    issues,
    suggestions,
  };
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { post_id, target_keyword } = await req.json();

    if (!post_id) {
      return new Response(JSON.stringify({ error: "post_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the blog post
    const { data: post, error: postError } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("id", post_id)
      .single();

    if (postError || !post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target keyword if not provided
    let keyword = target_keyword;
    if (!keyword) {
      const { data: keywords } = await supabase
        .from("blog_target_keywords")
        .select("keyword")
        .eq("post_id", post_id)
        .eq("keyword_type", "primary")
        .limit(1)
        .single();

      keyword = keywords?.keyword || "";
    }

    // Analyze the content
    const analysis = await analyzeContent(post, keyword);

    // Store the quality score
    const { error: scoreError } = await supabase
      .from("blog_content_quality_scores")
      .upsert({
        post_id: post_id,
        readability_score: analysis.readability_score,
        seo_score: analysis.seo_score,
        engagement_score: analysis.engagement_score,
        uniqueness_score: analysis.uniqueness_score,
        comprehensiveness_score: analysis.comprehensiveness_score,
        overall_score: analysis.overall_score,
        issues: analysis.issues,
        suggestions: analysis.suggestions,
        analyzed_at: new Date().toISOString(),
      });

    if (scoreError) {
      console.error("Error storing quality score:", scoreError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error analyzing blog quality:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
