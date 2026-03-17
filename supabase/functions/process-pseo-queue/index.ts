import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIServiceV2 } from "../_shared/ai-service-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * process-pseo-queue
 *
 * Picks items off the pseo_generation_queue, generates content via
 * generate-pseo-content, and updates the page + queue records.
 *
 * Trigger this from Make.com, a cron, or the admin dashboard.
 *
 * POST body (all optional):
 *   batchId   - process only items in a specific batch
 *   limit     - max items to process (default 5, max 20)
 *   dryRun    - if true, return what would be processed without generating
 */

// Title & slug templates (mirrors src/lib/pseo/generator.ts)
const TITLE_TEMPLATES: Record<string, string> = {
  FOOD_CHAINING_GUIDE:
    "Food Chaining Guide: How to Introduce {{food}} to Picky Eaters",
  FOOD_CHAINING_AGE_COMBO:
    "Food Chaining {{food}} for {{age_group}} Kids",
  CHALLENGE_MEAL_OCCASION:
    "{{challenge}} Kids: {{meal_occasion}} Ideas That Work",
  AGE_MEAL_OCCASION:
    "{{meal_occasion}} Ideas for {{age_group}} Kids",
  FOOD_CHALLENGE_COMBO:
    "Getting {{challenge}} Kids to Eat {{food}}",
  FOOD_DIETARY_RESTRICTION:
    "{{dietary_restriction}}-Friendly {{food}} Recipes for Kids",
  CHALLENGE_LANDING:
    "{{challenge}} Eating in Kids: Complete Parent Guide",
  AGE_GROUP_LANDING:
    "Feeding Your {{age_group}}: Meal Ideas & Tips",
  MEAL_OCCASION_LANDING:
    "{{meal_occasion}} Ideas for Picky Eaters",
};

const META_TEMPLATES: Record<string, string> = {
  FOOD_CHAINING_GUIDE:
    "Step-by-step food chaining guide to help picky eaters try {{food}}. Evidence-based techniques parents can start today.",
  FOOD_CHAINING_AGE_COMBO:
    "Age-appropriate food chaining strategies for introducing {{food}} to {{age_group}} children.",
  CHALLENGE_MEAL_OCCASION:
    "Practical {{meal_occasion}} ideas for kids with {{challenge}} eating. Parent-tested meals that reduce mealtime stress.",
  AGE_MEAL_OCCASION:
    "{{meal_occasion}} ideas designed for {{age_group}} kids. Quick, nutritious meals picky eaters will actually try.",
  FOOD_CHALLENGE_COMBO:
    "Proven strategies to help {{challenge}} eaters accept {{food}}. Gradual exposure techniques for parents.",
  FOOD_DIETARY_RESTRICTION:
    "{{dietary_restriction}} {{food}} recipes safe for kids. Allergy-friendly meal ideas the whole family can enjoy.",
  CHALLENGE_LANDING:
    "Everything parents need to know about {{challenge}} eating in children. Expert tips, meal plans, and food chaining guides.",
  AGE_GROUP_LANDING:
    "Complete feeding guide for {{age_group}} kids. Age-appropriate meals, portion sizes, and nutrition tips.",
  MEAL_OCCASION_LANDING:
    "Kid-friendly {{meal_occasion}} ideas for every age and eating style. Filter by dietary needs and challenges.",
};

const SLUG_PREFIXES: Record<string, string> = {
  FOOD_CHAINING_GUIDE: "food-chaining",
  FOOD_CHAINING_AGE_COMBO: "food-chaining",
  CHALLENGE_MEAL_OCCASION: "challenges",
  AGE_MEAL_OCCASION: "age",
  FOOD_CHALLENGE_COMBO: "food-challenge",
  FOOD_DIETARY_RESTRICTION: "dietary",
  CHALLENGE_LANDING: "challenges",
  AGE_GROUP_LANDING: "age",
  MEAL_OCCASION_LANDING: "meals",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function interpolate(
  template: string,
  combination: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    return combination[key] ?? key;
  });
}

function buildSlug(
  pageType: string,
  combination: Record<string, string>,
): string {
  const prefix = SLUG_PREFIXES[pageType] || "guides";
  const parts = Object.values(combination).map(slugify);
  return `${prefix}/${parts.join("/")}`;
}

function getTierForPageType(pageType: string): number {
  switch (pageType) {
    case "CHALLENGE_LANDING":
    case "AGE_GROUP_LANDING":
    case "MEAL_OCCASION_LANDING":
      return 1;
    case "FOOD_CHAINING_GUIDE":
    case "CHALLENGE_MEAL_OCCASION":
    case "AGE_MEAL_OCCASION":
      return 2;
    default:
      return 3;
  }
}

function buildBreadcrumbs(
  pageType: string,
  combination: Record<string, string>,
): Array<{ label: string; href: string }> {
  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Guides", href: "/guides" },
  ];
  const prefix = SLUG_PREFIXES[pageType] || "guides";
  const values = Object.values(combination);

  if (values.length > 0) {
    crumbs.push({
      label: values[0],
      href: `/guides/${prefix}/${slugify(values[0])}`,
    });
  }
  if (values.length > 1) {
    crumbs.push({
      label: values[1],
      href: `/guides/${buildSlug(pageType, combination)}`,
    });
  }
  return crumbs;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const batchId: string | undefined = body.batchId;
    const limit = Math.min(Math.max(parseInt(body.limit) || 5, 1), 20);
    const dryRun: boolean = body.dryRun === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch queued items
    let query = supabase
      .from("pseo_generation_queue")
      .select("*")
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .limit(limit);

    if (batchId) {
      query = query.eq("batch_id", batchId);
    }

    const { data: queueItems, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch queue: ${fetchError.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
      // If processing a batch, check if it should be marked complete
      if (batchId) {
        const { data: remaining } = await supabase
          .from("pseo_generation_queue")
          .select("id")
          .eq("batch_id", batchId)
          .in("status", ["queued", "processing"]);

        if (!remaining || remaining.length === 0) {
          await supabase
            .from("pseo_generation_batches")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", batchId);
        }
      }

      return new Response(
        JSON.stringify({
          status: "empty",
          message: "No queued items to process",
          batchId: batchId || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          status: "dry_run",
          items: queueItems.map((q: any) => ({
            id: q.id,
            page_type: q.page_type,
            combination: q.combination,
          })),
          count: queueItems.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Process each queued item
    const results: Array<{
      queueId: string;
      pageType: string;
      slug: string;
      status: "success" | "failed";
      pageId?: string;
      qualityScore?: number;
      error?: string;
    }> = [];

    const aiService = new AIServiceV2();

    for (const item of queueItems) {
      const pageType = item.page_type;
      const combination = (item.combination || {}) as Record<string, string>;
      const slug = buildSlug(pageType, combination);
      const title = interpolate(TITLE_TEMPLATES[pageType] || "{{food}}", combination);
      const metaDescription = interpolate(META_TEMPLATES[pageType] || "", combination);
      const tier = getTierForPageType(pageType);

      // Mark as processing
      await supabase
        .from("pseo_generation_queue")
        .update({
          status: "processing",
          processed_at: new Date().toISOString(),
          attempt_count: (item.attempt_count || 0) + 1,
        })
        .eq("id", item.id);

      try {
        // Check for existing page with same slug
        const { data: existing } = await supabase
          .from("pseo_pages")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();

        let pageId: string;

        if (existing) {
          pageId = existing.id;
          await supabase
            .from("pseo_pages")
            .update({
              generation_status: "generating",
              updated_at: new Date().toISOString(),
            })
            .eq("id", pageId);
        } else {
          // Create new page record
          const { data: newPage, error: insertError } = await supabase
            .from("pseo_pages")
            .insert({
              slug,
              page_type: pageType,
              title,
              meta_description: metaDescription,
              canonical_url: `https://tryeatpal.com/guides/${slug}`,
              generation_status: "generating",
              tier,
              content: {},
            })
            .select("id")
            .single();

          if (insertError) throw insertError;
          pageId = newPage.id;
        }

        // Call generate-pseo-content internally (direct AI call to avoid
        // supabase.functions.invoke which doesn't work in self-hosted Docker)
        console.log(`[process-pseo-queue] Generating ${pageType}: ${slug}`);

        // Fetch taxonomy context
        let taxonomyContext: Record<string, unknown> = {};
        try {
          const dimensionSlugs = Object.values(combination);
          const { data: taxRows } = await supabase
            .from("pseo_taxonomy")
            .select("dimension, slug, display_name, context, category")
            .in("slug", dimensionSlugs)
            .eq("is_active", true);

          if (taxRows && taxRows.length > 0) {
            for (const row of taxRows) {
              taxonomyContext[row.dimension] = {
                displayName: row.display_name,
                category: row.category,
                ...(row.context as Record<string, unknown> || {}),
              };
            }
          }
        } catch {
          // Non-fatal
        }

        // Build prompt
        const BASE_SYSTEM = `You are a pediatric feeding content specialist for EatPal, an AI-powered meal planning platform that helps families with picky eaters ages 2-12. You have deep expertise in food chaining science, sensory processing, texture progressions, flavor bridging, Division of Responsibility in feeding, and age-appropriate nutrition.\n\nYour content must be actionable, empathetic, evidence-informed, and specific.`;

        const PAGE_TYPE_CTX: Record<string, string> = {
          FOOD_CHAINING_GUIDE: "Write a food chaining guide from a single safe food to 8-12 new foods through incremental sensory changes.",
          FOOD_CHAINING_AGE_COMBO: "Write an age-tailored food chaining guide with developmentally appropriate strategies.",
          CHALLENGE_MEAL_OCCASION: "Write meal ideas and strategies for a feeding challenge at a specific meal occasion.",
          AGE_MEAL_OCCASION: "Write meal ideas for a specific age group at a specific meal occasion.",
          FOOD_CHALLENGE_COMBO: "Write a challenge-aware food chaining guide from a safe food.",
          FOOD_DIETARY_RESTRICTION: "Write a dietary-restriction-compliant food chaining guide.",
          CHALLENGE_LANDING: "Write a comprehensive hub page for a feeding challenge type.",
          AGE_GROUP_LANDING: "Write a comprehensive hub page for an age group.",
          MEAL_OCCASION_LANDING: "Write a comprehensive hub page for a meal occasion.",
        };

        // Import schema instructions from generate-pseo-content
        const SCHEMA_MAP: Record<string, string> = {
          FOOD_CHAINING_GUIDE: `Return JSON: { "headline": "string", "intro": "string (2-3 paragraphs)", "whyThisFoodWorks": { "sensoryExplanation": "string", "nutritionalContext": "string" }, "chain": [{ "stepNumber": "number", "foodName": "string", "changeDescription": "string", "parentTip": "string", "expectedResistance": "low|medium|high", "sensoryProperty": "texture|flavor|temperature|shape|color|brand" }] (8-12 items), "troubleshooting": [{ "scenario": "string", "advice": "string" }] (3+), "faqs": [{ "question": "string", "answer": "string" }] (4+), "ctaText": "string" }`,
          FOOD_CHAINING_AGE_COMBO: `Return JSON: { "headline": "string", "ageContext": { "developmentalOverview": "string", "typicalChallenges": ["string"], "parentMindset": "string" }, "intro": "string", "chain": [{ "stepNumber": "number", "foodName": "string", "changeDescription": "string", "ageSpecificTip": "string", "servingSize": "string", "expectedResistance": "low|medium|high" }] (6-10), "mealTimeStrategies": [{ "strategy": "string", "howTo": "string", "whyItWorks": "string" }] (3+), "redFlags": [{ "sign": "string", "action": "string" }] (2+), "faqs": [{ "question": "string", "answer": "string" }] (4+), "ctaText": "string" }`,
          CHALLENGE_MEAL_OCCASION: `Return JSON: { "headline": "string", "intro": "string", "whyThisIsHard": { "sensoryExplanation": "string", "parentPerspective": "string" }, "mealIdeas": [{ "name": "string", "description": "string", "whyItWorks": "string", "prepTime": "string", "ingredients": ["string"], "adaptationTip": "string" }] (5+), "strategies": [{ "title": "string", "description": "string", "exampleScript": "string" }] (3+), "commonMistakes": [{ "mistake": "string", "whyItBackfires": "string", "alternative": "string" }] (3+), "faqs": [{ "question": "string", "answer": "string" }] (4+), "ctaText": "string" }`,
          AGE_MEAL_OCCASION: `Return JSON: { "headline": "string", "intro": "string", "nutritionSnapshot": { "keyNutrients": ["string"], "portionGuidance": "string", "commonDeficiencies": "string" }, "mealIdeas": [{ "name": "string", "description": "string", "ageAppropriateFeatures": "string", "prepTime": "string", "childInvolvement": "string", "nutrients": ["string"] }] (6+), "feedingTips": [{ "tip": "string", "rationale": "string" }] (4+), "weekSampleSchedule": { "description": "string", "days": [{ "day": "string", "meal": "string", "note": "string" }] (5) }, "faqs": [{ "question": "string", "answer": "string" }] (4+), "ctaText": "string" }`,
          FOOD_CHALLENGE_COMBO: `Return JSON: { "headline": "string", "intro": "string", "challengeExplainer": { "whatItIs": "string", "howItAffectsEating": "string", "whyThisFoodIsSafe": "string" }, "chain": [{ "stepNumber": "number", "foodName": "string", "changeDescription": "string", "challengeAccommodation": "string", "sensoryBridge": "string", "expectedResistance": "low|medium|high", "ifRejected": "string" }] (6-10), "accommodationStrategies": [{ "strategy": "string", "description": "string", "example": "string" }] (3+), "progressMarkers": [{ "marker": "string", "whatItMeans": "string", "nextStep": "string" }] (3+), "faqs": [{ "question": "string", "answer": "string" }] (4+), "ctaText": "string" }`,
          FOOD_DIETARY_RESTRICTION: `Return JSON: { "headline": "string", "intro": "string", "restrictionContext": { "overview": "string", "impactOnFoodChaining": "string", "nutritionalConcerns": "string" }, "chain": [{ "stepNumber": "number", "foodName": "string", "changeDescription": "string", "restrictionCompliance": "string", "labelCheckNote": "string|null", "parentTip": "string", "expectedResistance": "low|medium|high" }] (6-10), "substitutionGuide": [{ "commonFood": "string", "substitute": "string", "sensoryComparison": "string" }] (3+), "nutritionSafetyNet": [{ "nutrient": "string", "sources": ["string"], "supplementNote": "string|null" }] (2+), "faqs": [{ "question": "string", "answer": "string" }] (4+), "ctaText": "string" }`,
          CHALLENGE_LANDING: `Return JSON: { "headline": "string", "heroSubtitle": "string", "intro": "string (3-4 paragraphs)", "whatItLooksLike": { "description": "string", "commonSigns": ["string"] (5-7), "notTheSameAs": "string" }, "whyItHappens": { "sensoryExplanation": "string", "developmentalFactors": "string", "environmentalFactors": "string" }, "immediateStrategies": [{ "title": "string", "description": "string", "example": "string" }] (4+), "foodChainingOverview": { "whyItWorks": "string", "startingPoints": ["string"] (3-5), "typicalTimeline": "string" }, "whenToSeekHelp": { "normalRange": "string", "concernSigns": ["string"] (3-5), "professionalTypes": ["string"] }, "faqs": [{ "question": "string", "answer": "string" }] (5+), "relatedGuides": [{ "title": "string", "description": "string", "linkSlug": "string" }] (4+), "ctaText": "string" }`,
          AGE_GROUP_LANDING: `Return JSON: { "headline": "string", "heroSubtitle": "string", "intro": "string (3-4 paragraphs)", "developmentalContext": { "whatIsNormal": "string", "whyPickyEatingHappens": "string", "goodNews": "string" }, "nutritionPriorities": [{ "nutrient": "string", "whyItMatters": "string", "topSources": ["string"], "dailyTarget": "string" }] (4+), "feedingStrategies": [{ "title": "string", "description": "string", "ageSpecificTwist": "string", "doThis": "string", "notThis": "string" }] (5+), "mealTimeStructure": { "mealsPerDay": "number", "snacksPerDay": "number", "typicalPortionSize": "string", "mealDuration": "string", "tips": ["string"] (3-4) }, "commonMistakes": [{ "mistake": "string", "whyParentsDoIt": "string", "betterApproach": "string" }] (3+), "faqs": [{ "question": "string", "answer": "string" }] (5+), "relatedGuides": [{ "title": "string", "description": "string", "linkSlug": "string" }] (4+), "ctaText": "string" }`,
          MEAL_OCCASION_LANDING: `Return JSON: { "headline": "string", "heroSubtitle": "string", "intro": "string (3-4 paragraphs)", "occasionChallenges": { "whyThisIsHard": "string", "topFrustrations": ["string"] (3-5), "mindsetShift": "string" }, "quickWins": [{ "food": "string", "whyItWorks": "string", "prepTip": "string" }] (5+), "mealIdeas": [{ "name": "string", "description": "string", "prepTime": "string", "occasionFit": "string", "pickyEaterFriendly": "string" }] (6+), "structureAdvice": { "timing": "string", "environment": "string", "parentRole": "string", "childRole": "string" }, "advancedStrategies": [{ "strategy": "string", "description": "string", "bestFor": "string" }] (3+), "faqs": [{ "question": "string", "answer": "string" }] (5+), "relatedGuides": [{ "title": "string", "description": "string", "linkSlug": "string" }] (4+), "ctaText": "string" }`,
        };

        const systemPrompt = `${BASE_SYSTEM}\n\n${PAGE_TYPE_CTX[pageType] || ""}`;

        const contextParts: string[] = [];
        contextParts.push("## Taxonomy Combination");
        for (const [k, v] of Object.entries(combination)) {
          contextParts.push(`- ${k}: ${v}`);
        }
        if (Object.keys(taxonomyContext).length > 0) {
          contextParts.push("\n## Additional Context");
          for (const [k, v] of Object.entries(taxonomyContext)) {
            contextParts.push(`- ${k}: ${JSON.stringify(v)}`);
          }
        }
        contextParts.push("\n## Output Instructions");
        contextParts.push(SCHEMA_MAP[pageType] || "Return valid JSON matching the page type schema.");
        contextParts.push("\nReturn ONLY valid JSON. No markdown fences. No commentary. Use American English. Flesch-Kincaid grade 6-8.");
        contextParts.push("Banned phrases: vibrant, bustling, thriving, something for everyone, look no further, discover, explore.");

        const userPrompt = contextParts.join("\n");

        const rawContent = await aiService.generateSimpleContent(userPrompt, {
          systemPrompt,
          taskType: "standard",
          maxTokens: 16000,
        });

        // Parse
        let sanitized = rawContent.trim();
        if (sanitized.startsWith("```")) {
          sanitized = sanitized
            .replace(/^```(?:json|JSON)?\n?/, "")
            .replace(/```$/, "")
            .trim();
        }

        let parsedContent: Record<string, unknown>;
        const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[0].replace(/,(\s*[}\]])/g, "$1"));
        } else {
          parsedContent = JSON.parse(sanitized);
        }

        // Quality score
        let qualityScore = 1.0;
        if (!parsedContent.headline && !parsedContent.h1) qualityScore -= 0.15;
        if (!parsedContent.intro) qualityScore -= 0.15;
        if (!parsedContent.faqs || !Array.isArray(parsedContent.faqs)) qualityScore -= 0.1;
        const contentJson = JSON.stringify(parsedContent);
        if (contentJson.length < 2000) qualityScore -= 0.2;
        qualityScore = Math.max(0, parseFloat(qualityScore.toFixed(2)));

        const wordCount = contentJson.split(/\s+/).length;
        const hasFaq = Array.isArray(parsedContent.faqs) && (parsedContent.faqs as unknown[]).length > 0;

        // Update page record
        const { error: pageUpdateError } = await supabase
          .from("pseo_pages")
          .update({
            title,
            meta_description: metaDescription,
            content: parsedContent,
            generation_status: qualityScore >= 0.7 ? "generated" : "failed",
            quality_score: qualityScore,
            word_count: wordCount,
            has_faq: hasFaq,
            generated_at: new Date().toISOString(),
            generation_model: aiService.getConfig().defaultModel,
            generation_error: qualityScore < 0.7 ? "Quality below threshold" : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pageId);

        if (pageUpdateError) {
          throw new Error(`Page update failed: ${pageUpdateError.message}`);
        }

        // Mark queue item complete
        await supabase
          .from("pseo_generation_queue")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        results.push({
          queueId: item.id,
          pageType,
          slug,
          status: "success",
          pageId,
          qualityScore,
        });

        console.log(`[process-pseo-queue] OK: ${slug} (quality: ${qualityScore})`);
      } catch (genError: any) {
        console.error(`[process-pseo-queue] Failed: ${slug}`, genError);

        const errorMessage = genError.message || "Unknown error";
        const attempts = (item.attempt_count || 0) + 1;
        const maxAttempts = item.max_attempts || 3;

        await supabase
          .from("pseo_generation_queue")
          .update({
            status: attempts >= maxAttempts ? "failed" : "queued",
            error_message: errorMessage,
            completed_at: attempts >= maxAttempts ? new Date().toISOString() : null,
          })
          .eq("id", item.id);

        results.push({
          queueId: item.id,
          pageType,
          slug,
          status: "failed",
          error: errorMessage,
        });
      }
    }

    // Update batch counters if applicable
    if (batchId) {
      const completed = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "failed").length;

      // Get current batch counts
      const { data: batch } = await supabase
        .from("pseo_generation_batches")
        .select("completed_pages, failed_pages")
        .eq("id", batchId)
        .single();

      if (batch) {
        await supabase
          .from("pseo_generation_batches")
          .update({
            completed_pages: (batch.completed_pages || 0) + completed,
            failed_pages: (batch.failed_pages || 0) + failed,
            status: "running",
          })
          .eq("id", batchId);
      }

      // Check if batch is done
      const { data: remaining } = await supabase
        .from("pseo_generation_queue")
        .select("id")
        .eq("batch_id", batchId)
        .in("status", ["queued", "processing"]);

      if (!remaining || remaining.length === 0) {
        await supabase
          .from("pseo_generation_batches")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", batchId);
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const failCount = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        status: "processed",
        processed: results.length,
        succeeded: successCount,
        failed: failCount,
        results,
        batchId: batchId || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[process-pseo-queue] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
};
