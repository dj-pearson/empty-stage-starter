import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Helper functions for readability metrics

function countSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");

  const syllableMatches = word.match(/[aeiouy]{1,2}/g);
  return syllableMatches ? syllableMatches.length : 1;
}

function calculateFleschReadingEase(
  sentences: number,
  words: number,
  syllables: number
): number {
  if (sentences === 0 || words === 0) return 0;

  const avgSentenceLength = words / sentences;
  const avgSyllablesPerWord = syllables / words;

  return 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord;
}

function calculateFleschKincaidGrade(
  sentences: number,
  words: number,
  syllables: number
): number {
  if (sentences === 0 || words === 0) return 0;

  const avgSentenceLength = words / sentences;
  const avgSyllablesPerWord = syllables / words;

  return 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
}

function calculateGunningFog(
  sentences: number,
  words: number,
  complexWords: number
): number {
  if (sentences === 0 || words === 0) return 0;

  return 0.4 * ((words / sentences) + 100 * (complexWords / words));
}

function calculateSMOG(sentences: number, complexWords: number): number {
  if (sentences === 0) return 0;

  return 1.0430 * Math.sqrt(complexWords * (30 / sentences)) + 3.1291;
}

function extractTextContent(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Extract main content (try to find article, main, or body content)
  const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

  if (mainMatch) {
    text = mainMatch[1];
  } else if (articleMatch) {
    text = articleMatch[1];
  }

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, targetKeyword, contentType = "other" } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Analyzing content for ${url}...`);

    // Fetch the page
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();

    // Extract text content
    const text = extractTextContent(html);

    // Basic text analysis
    const words = text.match(/\b\w+\b/g) || [];
    const wordCount = words.length;

    const sentences = text.match(/[.!?]+/g) || [];
    const sentenceCount = sentences.length || 1;

    const paragraphs = text.split(/\n\n+/);
    const paragraphCount = paragraphs.length;

    // Calculate syllables and identify complex words
    let totalSyllables = 0;
    let complexWordsCount = 0;

    for (const word of words) {
      const syllables = countSyllables(word);
      totalSyllables += syllables;

      // Complex words have 3+ syllables
      if (syllables >= 3) {
        complexWordsCount++;
      }
    }

    // Calculate average metrics
    const avgSentenceLength = wordCount / sentenceCount;
    const avgWordLength =
      words.reduce((sum, word) => sum + word.length, 0) / wordCount || 0;

    // Calculate readability metrics
    const fleschReadingEase = calculateFleschReadingEase(
      sentenceCount,
      wordCount,
      totalSyllables
    );
    const fleschKincaidGrade = calculateFleschKincaidGrade(
      sentenceCount,
      wordCount,
      totalSyllables
    );
    const gunningFog = calculateGunningFog(
      sentenceCount,
      wordCount,
      complexWordsCount
    );
    const smogIndex = calculateSMOG(sentenceCount, complexWordsCount);

    // Simplified Coleman-Liau and ARI calculations
    const colemanLiau = 0.0588 * ((wordCount / sentenceCount) * 100) - 0.296 * 5 - 15.8;
    const automatedReadability = 4.71 * (wordCount / sentenceCount) + 0.5 * (wordCount / sentenceCount) - 21.43;

    // Keyword analysis
    let keywordDensity = 0;
    let keywordCount = 0;
    let keywordVariations: string[] = [];

    if (targetKeyword) {
      const keywordLower = targetKeyword.toLowerCase();
      const textLower = text.toLowerCase();

      // Count exact keyword occurrences
      const keywordMatches = textLower.match(new RegExp(`\\b${keywordLower}\\b`, "g"));
      keywordCount = keywordMatches ? keywordMatches.length : 0;
      keywordDensity = (keywordCount / wordCount) * 100;

      // Find keyword variations (plural, different forms)
      const variations = [
        keywordLower + "s",
        keywordLower + "es",
        keywordLower + "ed",
        keywordLower + "ing",
      ];

      for (const variation of variations) {
        if (textLower.includes(variation)) {
          keywordVariations.push(variation);
        }
      }
    }

    // Analyze heading structure
    const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
    const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
    const h3Count = (html.match(/<h3[^>]*>/gi) || []).length;

    // Heading structure score (100 = perfect: 1 H1, multiple H2s, H3s for subheadings)
    let headingStructureScore = 100;
    if (h1Count === 0) headingStructureScore -= 30;
    if (h1Count > 1) headingStructureScore -= 20;
    if (h2Count === 0) headingStructureScore -= 20;
    if (h2Count > 10) headingStructureScore -= 10;
    headingStructureScore = Math.max(0, headingStructureScore);

    // Analyze links
    const internalLinksCount = (html.match(/<a[^>]*href=["'][^"']*["'][^>]*>/gi) || [])
      .filter((link) => !link.includes("http") || link.includes(new URL(url).hostname))
      .length;
    const externalLinksCount = (html.match(/<a[^>]*href=["']http[^"']*["'][^>]*>/gi) || [])
      .filter((link) => !link.includes(new URL(url).hostname))
      .length;

    // Analyze images
    const imagesCount = (html.match(/<img[^>]*>/gi) || []).length;
    const imagesWithAltCount = (html.match(/<img[^>]*alt=["'][^"']+["'][^>]*>/gi) || [])
      .length;
    const imagesOptimizedCount = (html.match(/<img[^>]*(?:loading=["']lazy["']|decoding=["']async["'])[^>]*>/gi) || [])
      .length;

    // Calculate content quality metrics
    const complexWordsPercentage = (complexWordsCount / wordCount) * 100;

    // Count passive voice (simplified - looks for common patterns)
    const passiveVoiceMatches = text.match(
      /\b(am|is|are|was|were|be|been|being)\s+\w+ed\b/gi
    );
    const passiveVoicePercentage = passiveVoiceMatches
      ? (passiveVoiceMatches.length / sentenceCount) * 100
      : 0;

    // Count transition words
    const transitionWords = [
      "however",
      "therefore",
      "moreover",
      "furthermore",
      "consequently",
      "nevertheless",
      "additionally",
      "meanwhile",
      "subsequently",
      "thus",
      "hence",
      "accordingly",
    ];
    let transitionWordsCount = 0;
    for (const word of transitionWords) {
      const matches = text.toLowerCase().match(new RegExp(`\\b${word}\\b`, "g"));
      if (matches) transitionWordsCount += matches.length;
    }
    const transitionWordsPercentage = (transitionWordsCount / sentenceCount) * 100;

    // Overall scores
    const readabilityScore = Math.min(100, Math.max(0, fleschReadingEase));

    let keywordOptimizationScore = 0;
    if (targetKeyword) {
      // Optimal keyword density is 1-3%
      if (keywordDensity >= 1 && keywordDensity <= 3) {
        keywordOptimizationScore = 100;
      } else if (keywordDensity < 1) {
        keywordOptimizationScore = Math.min(100, keywordDensity * 100);
      } else {
        keywordOptimizationScore = Math.max(0, 100 - (keywordDensity - 3) * 20);
      }
    }

    const structureScore = Math.round(
      (headingStructureScore +
        (h2Count > 0 ? 100 : 0) +
        (internalLinksCount > 2 ? 100 : internalLinksCount * 33)) /
        3
    );

    const overallContentScore = Math.round(
      (readabilityScore + keywordOptimizationScore + structureScore + headingStructureScore) /
        4
    );

    // Prepare data for database
    const analysisData = {
      page_url: url,
      content_type: contentType,
      target_keyword: targetKeyword,
      keyword_density: keywordDensity.toFixed(2),
      keyword_count: keywordCount,
      keyword_variations: JSON.stringify(keywordVariations),

      // Readability metrics
      flesch_reading_ease: fleschReadingEase.toFixed(2),
      flesch_kincaid_grade: fleschKincaidGrade.toFixed(2),
      gunning_fog_index: gunningFog.toFixed(2),
      smog_index: smogIndex.toFixed(2),
      coleman_liau_index: colemanLiau.toFixed(2),
      automated_readability_index: automatedReadability.toFixed(2),

      // Content structure
      word_count: wordCount,
      sentence_count: sentenceCount,
      paragraph_count: paragraphCount,
      avg_sentence_length: avgSentenceLength.toFixed(2),
      avg_word_length: avgWordLength.toFixed(2),

      // Content quality
      passive_voice_percentage: passiveVoicePercentage.toFixed(2),
      transition_words_percentage: transitionWordsPercentage.toFixed(2),
      complex_words_percentage: complexWordsPercentage.toFixed(2),

      // Heading analysis
      h1_count: h1Count,
      h2_count: h2Count,
      h3_count: h3Count,
      heading_structure_score: headingStructureScore,

      // Link analysis
      internal_links_count: internalLinksCount,
      external_links_count: externalLinksCount,

      // Image analysis
      images_count: imagesCount,
      images_with_alt_count: imagesWithAltCount,
      images_optimized_count: imagesOptimizedCount,

      // Overall scoring
      overall_content_score: overallContentScore,
      readability_score: Math.round(readabilityScore),
      keyword_optimization_score: Math.round(keywordOptimizationScore),
      structure_score: structureScore,

      analyzed_at: new Date().toISOString(),
    };

    // Insert into database
    const { data: insertedData, error: insertError } = await supabase
      .from("seo_content_analysis")
      .insert(analysisData)
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(`Failed to save content analysis: ${insertError.message}`);
    }

    // Generate AI suggestions based on analysis
    const suggestions = [];

    if (h1Count === 0) {
      suggestions.push({
        type: "heading",
        priority: "high",
        message: "Add an H1 heading to clearly define the page topic",
      });
    }

    if (h1Count > 1) {
      suggestions.push({
        type: "heading",
        priority: "medium",
        message: "Use only one H1 heading per page for better SEO",
      });
    }

    if (keywordDensity < 0.5) {
      suggestions.push({
        type: "keyword",
        priority: "high",
        message: `Increase target keyword density (currently ${keywordDensity.toFixed(2)}%, aim for 1-3%)`,
      });
    }

    if (keywordDensity > 5) {
      suggestions.push({
        type: "keyword",
        priority: "high",
        message: `Reduce keyword density to avoid keyword stuffing (currently ${keywordDensity.toFixed(2)}%)`,
      });
    }

    if (wordCount < 300) {
      suggestions.push({
        type: "content",
        priority: "high",
        message: `Content is too short (${wordCount} words). Aim for at least 300 words for better SEO`,
      });
    }

    if (fleschReadingEase < 30) {
      suggestions.push({
        type: "readability",
        priority: "medium",
        message: "Content is very difficult to read. Simplify sentences and use simpler words",
      });
    }

    if (internalLinksCount < 2) {
      suggestions.push({
        type: "links",
        priority: "medium",
        message: "Add more internal links to related pages (currently " + internalLinksCount + ")",
      });
    }

    if (imagesCount > 0 && imagesWithAltCount < imagesCount) {
      suggestions.push({
        type: "images",
        priority: "medium",
        message: `${imagesCount - imagesWithAltCount} images missing alt text`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          url,
          scores: {
            overall: overallContentScore,
            readability: Math.round(readabilityScore),
            keywordOptimization: Math.round(keywordOptimizationScore),
            structure: structureScore,
          },
          metrics: {
            wordCount,
            sentenceCount,
            fleschReadingEase: fleschReadingEase.toFixed(2),
            fleschKincaidGrade: fleschKincaidGrade.toFixed(2),
            keywordDensity: keywordDensity.toFixed(2),
            keywordCount,
          },
          suggestions,
          id: insertedData.id,
        },
        message: "Content analysis completed successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in analyze-content:", error);
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
