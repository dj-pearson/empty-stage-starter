import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AIServiceV2 } from "../_shared/ai-service-v2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Page type enum (mirrors src/types/pseo.ts)
// ---------------------------------------------------------------------------

type PseoPageType =
  | "FOOD_CHAINING_GUIDE"
  | "FOOD_CHAINING_AGE_COMBO"
  | "CHALLENGE_MEAL_OCCASION"
  | "AGE_MEAL_OCCASION"
  | "FOOD_CHALLENGE_COMBO"
  | "FOOD_DIETARY_RESTRICTION"
  | "CHALLENGE_LANDING"
  | "AGE_GROUP_LANDING"
  | "MEAL_OCCASION_LANDING";

// ---------------------------------------------------------------------------
// Shared prompt constants
// ---------------------------------------------------------------------------

const BANNED_PHRASES = [
  "vibrant",
  "bustling",
  "thriving",
  "something for everyone",
  "look no further",
  "discover",
  "explore",
];

const SHARED_OUTPUT_RULES = [
  "Return ONLY valid JSON. No markdown fences, no commentary, no preamble.",
  "Every string value must be plain text or valid HTML fragments — no markdown syntax inside values.",
  "Do not include any keys that are not specified in the schema.",
  "All arrays must contain the exact number of items specified, no more and no fewer.",
  "Never fabricate research citations. If referencing a study, use the general finding without an invented author or journal.",
  "Do not use any phrase from the banned-phrases list anywhere in the output.",
  "Use American English spelling throughout.",
  "Keep sentences concise — aim for a Flesch-Kincaid reading level of grade 6-8.",
];

const BASE_SYSTEM_PROMPT = `You are a pediatric feeding content specialist for EatPal, an AI-powered meal planning platform that helps families with picky eaters ages 2-12. You have deep expertise in:

- Food chaining science (SOS Approach to Feeding, sequential oral sensory methodology)
- Sensory processing and how it affects food acceptance
- Texture progressions (puree -> mashed -> soft solids -> mixed textures -> raw/crunchy)
- Flavor bridging (using accepted flavors to introduce new foods)
- Division of Responsibility in feeding (Ellyn Satter model)
- Age-appropriate portion sizes and nutritional needs
- Common feeding challenges: texture aversion, food neophobia, ARFID traits, color avoidance, brand rigidity

Your content must be:
1. Actionable — every paragraph gives parents something they can try today
2. Empathetic — never blame parents or children for picky eating
3. Evidence-informed — grounded in feeding therapy principles without being clinical
4. Specific — name real foods, real textures, real techniques (not vague advice)`;

// ---------------------------------------------------------------------------
// Schema instructions per page type
// ---------------------------------------------------------------------------

const SCHEMA_INSTRUCTIONS: Record<PseoPageType, string> = {
  FOOD_CHAINING_GUIDE: `Fill the following JSON schema. The "chain" array must contain 8-12 steps, each changing exactly one sensory property from the previous step.

{
  "headline": "string (conversational, parent-facing h1)",
  "intro": "string (2-3 paragraphs explaining why this safe food is a strong starting point)",
  "whyThisFoodWorks": {
    "sensoryExplanation": "string",
    "nutritionalContext": "string"
  },
  "chain": [
    {
      "stepNumber": "number",
      "foodName": "string",
      "changeDescription": "string (which single sensory property changed)",
      "parentTip": "string (practical serving suggestion)",
      "expectedResistance": "low | medium | high",
      "sensoryProperty": "texture | flavor | temperature | shape | color | brand"
    }
  ],
  "troubleshooting": [
    { "scenario": "string", "advice": "string" }
  ],
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "ctaText": "string (encourage trying EatPal's automated food chaining planner)"
}`,

  FOOD_CHAINING_AGE_COMBO: `Fill the following JSON schema. All advice must be calibrated to the specific age group's developmental stage.

{
  "headline": "string",
  "ageContext": {
    "developmentalOverview": "string",
    "typicalChallenges": ["string"],
    "parentMindset": "string"
  },
  "intro": "string (2 paragraphs)",
  "chain": [
    {
      "stepNumber": "number",
      "foodName": "string",
      "changeDescription": "string",
      "ageSpecificTip": "string",
      "servingSize": "string",
      "expectedResistance": "low | medium | high"
    }
  ],
  "mealTimeStrategies": [
    { "strategy": "string", "howTo": "string", "whyItWorks": "string" }
  ],
  "redFlags": [
    { "sign": "string", "action": "string" }
  ],
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "ctaText": "string"
}`,

  CHALLENGE_MEAL_OCCASION: `Fill the following JSON schema.

{
  "headline": "string (empathetic, speaks to the parent's frustration)",
  "intro": "string (2-3 paragraphs)",
  "whyThisIsHard": {
    "sensoryExplanation": "string",
    "parentPerspective": "string"
  },
  "mealIdeas": [
    {
      "name": "string",
      "description": "string",
      "whyItWorks": "string",
      "prepTime": "string",
      "ingredients": ["string"],
      "adaptationTip": "string"
    }
  ],
  "strategies": [
    { "title": "string", "description": "string", "exampleScript": "string" }
  ],
  "commonMistakes": [
    { "mistake": "string", "whyItBackfires": "string", "alternative": "string" }
  ],
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "ctaText": "string"
}`,

  AGE_MEAL_OCCASION: `Fill the following JSON schema.

{
  "headline": "string",
  "intro": "string (2 paragraphs)",
  "nutritionSnapshot": {
    "keyNutrients": ["string"],
    "portionGuidance": "string",
    "commonDeficiencies": "string"
  },
  "mealIdeas": [
    {
      "name": "string",
      "description": "string",
      "ageAppropriateFeatures": "string",
      "prepTime": "string",
      "childInvolvement": "string",
      "nutrients": ["string"]
    }
  ],
  "feedingTips": [
    { "tip": "string", "rationale": "string" }
  ],
  "weekSampleSchedule": {
    "description": "string",
    "days": [
      { "day": "string", "meal": "string", "note": "string" }
    ]
  },
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "ctaText": "string"
}`,

  FOOD_CHALLENGE_COMBO: `Fill the following JSON schema. The chain must respect the child's specific challenge.

{
  "headline": "string",
  "intro": "string (2-3 paragraphs)",
  "challengeExplainer": {
    "whatItIs": "string",
    "howItAffectsEating": "string",
    "whyThisFoodIsSafe": "string"
  },
  "chain": [
    {
      "stepNumber": "number",
      "foodName": "string",
      "changeDescription": "string",
      "challengeAccommodation": "string",
      "sensoryBridge": "string",
      "expectedResistance": "low | medium | high",
      "ifRejected": "string"
    }
  ],
  "accommodationStrategies": [
    { "strategy": "string", "description": "string", "example": "string" }
  ],
  "progressMarkers": [
    { "marker": "string", "whatItMeans": "string", "nextStep": "string" }
  ],
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "ctaText": "string"
}`,

  FOOD_DIETARY_RESTRICTION: `Fill the following JSON schema. Every food in the chain MUST comply with the dietary restriction.

{
  "headline": "string",
  "intro": "string (2-3 paragraphs)",
  "restrictionContext": {
    "overview": "string",
    "impactOnFoodChaining": "string",
    "nutritionalConcerns": "string"
  },
  "chain": [
    {
      "stepNumber": "number",
      "foodName": "string",
      "changeDescription": "string",
      "restrictionCompliance": "string",
      "labelCheckNote": "string | null",
      "parentTip": "string",
      "expectedResistance": "low | medium | high"
    }
  ],
  "substitutionGuide": [
    { "commonFood": "string", "substitute": "string", "sensoryComparison": "string" }
  ],
  "nutritionSafetyNet": [
    { "nutrient": "string", "sources": ["string"], "supplementNote": "string | null" }
  ],
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "ctaText": "string"
}`,

  CHALLENGE_LANDING: `Fill the following JSON schema. This is a hub page — comprehensive but scannable.

{
  "headline": "string (empathetic, non-clinical)",
  "heroSubtitle": "string",
  "intro": "string (3-4 paragraphs)",
  "whatItLooksLike": {
    "description": "string",
    "commonSigns": ["string"],
    "notTheSameAs": "string"
  },
  "whyItHappens": {
    "sensoryExplanation": "string",
    "developmentalFactors": "string",
    "environmentalFactors": "string"
  },
  "immediateStrategies": [
    { "title": "string", "description": "string", "example": "string" }
  ],
  "foodChainingOverview": {
    "whyItWorks": "string",
    "startingPoints": ["string"],
    "typicalTimeline": "string"
  },
  "whenToSeekHelp": {
    "normalRange": "string",
    "concernSigns": ["string"],
    "professionalTypes": ["string"]
  },
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "relatedGuides": [
    { "title": "string", "description": "string", "linkSlug": "string" }
  ],
  "ctaText": "string"
}`,

  AGE_GROUP_LANDING: `Fill the following JSON schema.

{
  "headline": "string (warm, parent-facing, mentions age range)",
  "heroSubtitle": "string",
  "intro": "string (3-4 paragraphs)",
  "developmentalContext": {
    "whatIsNormal": "string",
    "whyPickyEatingHappens": "string",
    "goodNews": "string"
  },
  "nutritionPriorities": [
    {
      "nutrient": "string",
      "whyItMatters": "string",
      "topSources": ["string"],
      "dailyTarget": "string"
    }
  ],
  "feedingStrategies": [
    {
      "title": "string",
      "description": "string",
      "ageSpecificTwist": "string",
      "doThis": "string",
      "notThis": "string"
    }
  ],
  "mealTimeStructure": {
    "mealsPerDay": "number",
    "snacksPerDay": "number",
    "typicalPortionSize": "string",
    "mealDuration": "string",
    "tips": ["string"]
  },
  "commonMistakes": [
    { "mistake": "string", "whyParentsDoIt": "string", "betterApproach": "string" }
  ],
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "relatedGuides": [
    { "title": "string", "description": "string", "linkSlug": "string" }
  ],
  "ctaText": "string"
}`,

  MEAL_OCCASION_LANDING: `Fill the following JSON schema.

{
  "headline": "string",
  "heroSubtitle": "string",
  "intro": "string (3-4 paragraphs)",
  "occasionChallenges": {
    "whyThisIsHard": "string",
    "topFrustrations": ["string"],
    "mindsetShift": "string"
  },
  "quickWins": [
    { "food": "string", "whyItWorks": "string", "prepTip": "string" }
  ],
  "mealIdeas": [
    {
      "name": "string",
      "description": "string",
      "prepTime": "string",
      "occasionFit": "string",
      "pickyEaterFriendly": "string"
    }
  ],
  "structureAdvice": {
    "timing": "string",
    "environment": "string",
    "parentRole": "string",
    "childRole": "string"
  },
  "advancedStrategies": [
    { "strategy": "string", "description": "string", "bestFor": "string" }
  ],
  "faqs": [
    { "question": "string", "answer": "string" }
  ],
  "relatedGuides": [
    { "title": "string", "description": "string", "linkSlug": "string" }
  ],
  "ctaText": "string"
}`,
};

// ---------------------------------------------------------------------------
// System prompt suffix per page type
// ---------------------------------------------------------------------------

const PAGE_TYPE_CONTEXT: Record<PseoPageType, string> = {
  FOOD_CHAINING_GUIDE:
    "You are writing a food chaining guide that starts from a single safe food and maps a realistic path to 8-12 new foods through incremental changes in texture, flavor, temperature, shape, or brand. Each step must change only ONE sensory property at a time.",
  FOOD_CHAINING_AGE_COMBO:
    "You are writing a food chaining guide tailored to a specific age group. Adjust texture progressions, portion sizes, language, and involvement strategies to match the developmental stage.",
  CHALLENGE_MEAL_OCCASION:
    "You are writing content that helps parents handle a specific feeding challenge during a specific meal occasion. Provide concrete meal ideas, preparation techniques, and conversation scripts.",
  AGE_MEAL_OCCASION:
    "You are writing meal ideas and feeding strategies for a specific age group at a specific meal occasion. Be concrete about food quantities, prep involvement, and developmental expectations.",
  FOOD_CHALLENGE_COMBO:
    "You are writing a guide that addresses how to chain FROM a specific safe food when the child has a specific feeding challenge. Map out challenge-aware chain paths and sensory accommodation strategies.",
  FOOD_DIETARY_RESTRICTION:
    "You are writing a food chaining guide that respects a dietary restriction. Ensure every food in the chain is safe for the restriction while still providing meaningful sensory progression.",
  CHALLENGE_LANDING:
    "You are writing a hub/landing page for a specific feeding challenge type. This page serves as the authoritative entry point for parents researching this challenge.",
  AGE_GROUP_LANDING:
    "You are writing a hub/landing page for a specific age group. Ground every recommendation in developmental science.",
  MEAL_OCCASION_LANDING:
    "You are writing a hub/landing page for a specific meal occasion. Address the real-world logistics, not just the food.",
};

// ---------------------------------------------------------------------------
// Build the user prompt from combination values
// ---------------------------------------------------------------------------

function buildUserPrompt(
  pageType: PseoPageType,
  combination: Record<string, string>,
  taxonomyContext: Record<string, unknown> | null,
): string {
  const parts: string[] = [];

  parts.push("## Taxonomy Combination");
  for (const [key, value] of Object.entries(combination)) {
    parts.push(`- ${key}: ${value}`);
  }

  if (taxonomyContext && Object.keys(taxonomyContext).length > 0) {
    parts.push("\n## Additional Context from Taxonomy Database");
    for (const [key, value] of Object.entries(taxonomyContext)) {
      if (typeof value === "object") {
        parts.push(`- ${key}: ${JSON.stringify(value)}`);
      } else {
        parts.push(`- ${key}: ${value}`);
      }
    }
  }

  parts.push("\n## Output Schema");
  parts.push(SCHEMA_INSTRUCTIONS[pageType]);

  parts.push("\n## Output Rules");
  for (const rule of SHARED_OUTPUT_RULES) {
    parts.push(`- ${rule}`);
  }

  parts.push(`\n## Banned Phrases (do not use anywhere)`);
  parts.push(BANNED_PHRASES.join(", "));

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Quality scoring
// ---------------------------------------------------------------------------

function scoreContent(
  content: Record<string, unknown>,
  pageType: PseoPageType,
): number {
  let score = 1.0;

  // Check required top-level fields
  if (!content.headline && !content.h1) score -= 0.15;
  if (!content.intro && !content.introHtml) score -= 0.15;
  if (!content.faqs || !Array.isArray(content.faqs) || (content.faqs as unknown[]).length === 0) score -= 0.1;
  if (!content.ctaText) score -= 0.05;

  // Check chain if applicable
  const chainTypes: PseoPageType[] = [
    "FOOD_CHAINING_GUIDE",
    "FOOD_CHAINING_AGE_COMBO",
    "FOOD_CHALLENGE_COMBO",
    "FOOD_DIETARY_RESTRICTION",
  ];
  if (chainTypes.includes(pageType)) {
    const chain = content.chain as unknown[];
    if (!chain || !Array.isArray(chain)) {
      score -= 0.3;
    } else if (chain.length < 6) {
      score -= 0.15;
    }
  }

  // Check meal ideas if applicable
  const mealTypes: PseoPageType[] = [
    "CHALLENGE_MEAL_OCCASION",
    "AGE_MEAL_OCCASION",
    "MEAL_OCCASION_LANDING",
  ];
  if (mealTypes.includes(pageType)) {
    const ideas = content.mealIdeas as unknown[];
    if (!ideas || !Array.isArray(ideas)) {
      score -= 0.2;
    } else if (ideas.length < 4) {
      score -= 0.1;
    }
  }

  // Landing pages need related guides
  const landingTypes: PseoPageType[] = [
    "CHALLENGE_LANDING",
    "AGE_GROUP_LANDING",
    "MEAL_OCCASION_LANDING",
  ];
  if (landingTypes.includes(pageType)) {
    const guides = content.relatedGuides as unknown[];
    if (!guides || !Array.isArray(guides) || guides.length < 3) {
      score -= 0.1;
    }
  }

  // Count total string content to check substance
  const json = JSON.stringify(content);
  if (json.length < 2000) score -= 0.2;

  return Math.max(0, Math.min(1, parseFloat(score.toFixed(2))));
}

// ---------------------------------------------------------------------------
// Edge function handler
// ---------------------------------------------------------------------------

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pageType, combination, pageId } = await req.json();

    if (!pageType || !combination) {
      return new Response(
        JSON.stringify({ error: "pageType and combination are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!(pageType in SCHEMA_INSTRUCTIONS)) {
      return new Response(
        JSON.stringify({ error: `Unknown page type: ${pageType}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch taxonomy context for richer prompts
    let taxonomyContext: Record<string, unknown> = {};
    try {
      const dimensionSlugs = Object.values(combination) as string[];
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
    } catch (taxError) {
      console.warn("Could not fetch taxonomy context:", taxError);
    }

    // Build system + user prompts
    const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\n${PAGE_TYPE_CONTEXT[pageType as PseoPageType]}`;
    const userPrompt = buildUserPrompt(
      pageType as PseoPageType,
      combination,
      taxonomyContext,
    );

    console.log(`[generate-pseo-content] Generating ${pageType} for:`, combination);

    // Call AI
    const aiService = new AIServiceV2();
    const rawContent = await aiService.generateSimpleContent(userPrompt, {
      systemPrompt,
      taskType: "standard",
      maxTokens: 16000,
    });

    if (!rawContent) {
      throw new Error("No content received from AI");
    }

    // Parse JSON response
    let sanitized = rawContent.trim();
    if (sanitized.startsWith("```")) {
      sanitized = sanitized
        .replace(/^```(?:json|JSON)?\n?/, "")
        .replace(/```$/, "")
        .trim();
    }

    let parsedContent: Record<string, unknown>;
    try {
      const jsonMatch = sanitized.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0].replace(/,(\s*[}\]])/g, "$1");
        parsedContent = JSON.parse(jsonStr);
      } else {
        parsedContent = JSON.parse(sanitized);
      }
    } catch (parseError) {
      console.error("First parse failed, retrying with shorter output...");

      // Retry with shorter length
      const retryContent = await aiService.generateSimpleContent(userPrompt, {
        systemPrompt,
        taskType: "standard",
        maxTokens: 8000,
      });

      let retrySanitized = retryContent.trim();
      if (retrySanitized.startsWith("```")) {
        retrySanitized = retrySanitized
          .replace(/^```(?:json|JSON)?\n?/, "")
          .replace(/```$/, "")
          .trim();
      }

      const retryMatch = retrySanitized.match(/\{[\s\S]*\}/);
      const retryJsonStr = (retryMatch ? retryMatch[0] : retrySanitized)
        .replace(/,(\s*[}\]])/g, "$1");
      parsedContent = JSON.parse(retryJsonStr);
    }

    // Score quality
    const qualityScore = scoreContent(parsedContent, pageType as PseoPageType);

    // Count words in content
    const contentText = JSON.stringify(parsedContent);
    const wordCount = contentText.split(/\s+/).length;
    const hasFaq = Array.isArray(parsedContent.faqs) && (parsedContent.faqs as unknown[]).length > 0;

    console.log(
      `[generate-pseo-content] Done. Quality: ${qualityScore}, Words: ~${wordCount}, FAQ: ${hasFaq}`,
    );

    // Update the page record directly if pageId was provided
    if (pageId) {
      const { error: updateError } = await supabase
        .from("pseo_pages")
        .update({
          content: parsedContent,
          generation_status: qualityScore >= 0.7 ? "generated" : "failed",
          quality_score: qualityScore,
          word_count: wordCount,
          has_faq: hasFaq,
          generated_at: new Date().toISOString(),
          generation_model: aiService.getConfig().defaultModel,
          generation_error: qualityScore < 0.7 ? "Quality score below threshold" : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pageId);

      if (updateError) {
        console.error("Failed to update page record:", updateError);
      }
    }

    return new Response(
      JSON.stringify({
        content: parsedContent,
        quality_score: qualityScore,
        word_count: wordCount,
        has_faq: hasFaq,
        page_id: pageId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[generate-pseo-content] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
};
