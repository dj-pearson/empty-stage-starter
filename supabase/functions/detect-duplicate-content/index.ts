import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PageContent {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  contentHash: string;
}

interface DuplicateMatch {
  url1: string;
  url2: string;
  similarity: number;
  matchType: "exact" | "near_duplicate" | "similar" | "thin";
  details: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { urls, similarityThreshold = 0.85, thinContentThreshold = 300 } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length < 2) {
      throw new Error("At least 2 URLs are required for comparison");
    }

    console.log(`Analyzing ${urls.length} pages for duplicate content...`);

    // Fetch and extract content from all pages
    const pages: PageContent[] = [];

    for (const url of urls) {
      try {
        const content = await fetchPageContent(url);
        pages.push(content);
      } catch (e) {
        console.warn(`Failed to fetch ${url}:`, e.message);
      }
    }

    console.log(`Successfully fetched ${pages.length} pages`);

    // Find duplicates and similarities
    const duplicates: DuplicateMatch[] = [];
    const exactDuplicates = new Map<string, string[]>();

    // Check for exact duplicates by hash
    for (const page of pages) {
      if (exactDuplicates.has(page.contentHash)) {
        exactDuplicates.get(page.contentHash)!.push(page.url);
      } else {
        exactDuplicates.set(page.contentHash, [page.url]);
      }
    }

    // Record exact duplicates
    for (const [hash, urls] of exactDuplicates.entries()) {
      if (urls.length > 1) {
        for (let i = 0; i < urls.length; i++) {
          for (let j = i + 1; j < urls.length; j++) {
            duplicates.push({
              url1: urls[i],
              url2: urls[j],
              similarity: 1.0,
              matchType: "exact",
              details: "Identical content (100% match)",
            });
          }
        }
      }
    }

    // Compare all pairs for similarity
    for (let i = 0; i < pages.length; i++) {
      for (let j = i + 1; j < pages.length; j++) {
        const page1 = pages[i];
        const page2 = pages[j];

        // Skip if already marked as exact duplicates
        if (page1.contentHash === page2.contentHash) {
          continue;
        }

        // Calculate similarity
        const similarity = calculateSimilarity(page1.content, page2.content);

        if (similarity >= similarityThreshold) {
          duplicates.push({
            url1: page1.url,
            url2: page2.url,
            similarity,
            matchType: similarity >= 0.95 ? "near_duplicate" : "similar",
            details: `${Math.round(similarity * 100)}% similar content`,
          });
        }
      }
    }

    // Check for thin content
    const thinContent = pages.filter((page) => page.wordCount < thinContentThreshold);

    for (const page of thinContent) {
      duplicates.push({
        url1: page.url,
        url2: "",
        similarity: 0,
        matchType: "thin",
        details: `Thin content: ${page.wordCount} words (recommend ${thinContentThreshold}+ words)`,
      });
    }

    // Calculate summary
    const summary = {
      totalPages: pages.length,
      exactDuplicates: Array.from(exactDuplicates.values()).filter((urls) => urls.length > 1).length,
      nearDuplicates: duplicates.filter((d) => d.matchType === "near_duplicate").length,
      similarPages: duplicates.filter((d) => d.matchType === "similar").length,
      thinContent: thinContent.length,
      totalIssues: duplicates.length,
      avgWordCount: Math.round(
        pages.reduce((sum, page) => sum + page.wordCount, 0) / pages.length
      ),
    };

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save to database
    const { data: savedAnalysis, error: saveError } = await supabase
      .from("seo_duplicate_content")
      .insert({
        analyzed_urls: urls,
        total_pages: summary.totalPages,
        exact_duplicates: summary.exactDuplicates,
        near_duplicates: summary.nearDuplicates,
        similar_pages: summary.similarPages,
        thin_content: summary.thinContent,
        total_issues: summary.totalIssues,
        avg_word_count: summary.avgWordCount,
        duplicate_details: JSON.stringify(duplicates),
        page_details: JSON.stringify(pages.map((p) => ({
          url: p.url,
          title: p.title,
          wordCount: p.wordCount,
        }))),
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save duplicate content analysis:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary,
          duplicates: duplicates.slice(0, 50), // Return first 50
          thinContent,
          analysisId: savedAnalysis?.id,
        },
        message: `Analyzed ${summary.totalPages} pages, found ${summary.totalIssues} content issues`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in detect-duplicate-content:", error);
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

async function fetchPageContent(url: string): Promise<PageContent> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SEO-Content-Analyzer/1.0",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract main content (remove scripts, styles, etc.)
  const content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // Calculate word count
  const wordCount = content.split(/\s+/).filter((word) => word.length > 0).length;

  // Create content hash for exact duplicate detection
  const contentHash = await hashString(content);

  return {
    url,
    title,
    content,
    wordCount,
    contentHash,
  };
}

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function calculateSimilarity(text1: string, text2: string): number {
  // Use Jaccard similarity with word n-grams
  const ngrams1 = createNGrams(text1, 3);
  const ngrams2 = createNGrams(text2, 3);

  const set1 = new Set(ngrams1);
  const set2 = new Set(ngrams2);

  // Calculate Jaccard similarity: intersection / union
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;

  return intersection.size / union.size;
}

function createNGrams(text: string, n: number): string[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const ngrams: string[] = [];

  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(" "));
  }

  return ngrams;
}
