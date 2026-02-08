/**
 * GEO (Generative Engine Optimization) Monitoring Utilities
 *
 * Functions for tracking, validating, and optimizing content for AI search engines.
 * Used by the SEO dashboard and content management tools.
 */

const BASE_URL = "https://tryeatpal.com";

/**
 * AI search query templates for citation testing
 *
 * These are the natural language queries users ask AI about topics
 * related to EatPal's domain. Test these monthly across ChatGPT,
 * Perplexity, Gemini, and Google AI Overviews.
 */
export const aiCitationTestQueries = [
  // Core product queries
  "What is the best meal planning app for picky eaters?",
  "How do I create a meal plan for a child with ARFID?",
  "What is food chaining therapy and how does it work?",
  "Best apps for managing picky eating in toddlers",
  "How many times should I offer a new food to my picky eater?",

  // Comparison queries
  "EatPal vs Mealime for picky eaters",
  "Best picky eater apps compared",
  "Meal planning apps for kids with food aversions",

  // Long-tail informational queries
  "How to get my child to eat vegetables using food chaining",
  "What is the difference between picky eating and ARFID?",
  "How does AI help with meal planning for selective eaters?",
  "Evidence-based strategies for expanding a picky eater's diet",
  "How to track food exposures for picky eaters",

  // Feature-specific queries
  "Apps that generate grocery lists for picky eater families",
  "How to plan meals for multiple kids with different food preferences",
  "Try bite method for introducing new foods",
  "Food chaining examples chicken nuggets to grilled chicken",

  // Professional queries
  "Best software for feeding therapists",
  "HIPAA compliant meal planning platform for clinicians",
  "Tools for tracking feeding therapy progress",
];

/**
 * Content freshness checker
 *
 * Returns pages that haven't been updated within the threshold.
 * AI engines heavily weight recency signals.
 */
export interface ContentPage {
  url: string;
  title: string;
  lastModified: string;
  priority: "high" | "medium" | "low";
}

export function getStaleContent(
  pages: ContentPage[],
  maxAgeDays: number = 90
): ContentPage[] {
  const now = new Date();
  return pages.filter((page) => {
    const lastMod = new Date(page.lastModified);
    const diffDays = Math.floor(
      (now.getTime() - lastMod.getTime()) / (1000 * 60 * 60 * 24)
    );
    return diffDays > maxAgeDays;
  });
}

/**
 * Key pages to monitor for content freshness
 */
export const monitoredPages: ContentPage[] = [
  {
    url: `${BASE_URL}/`,
    title: "Homepage",
    lastModified: "2026-02-08",
    priority: "high",
  },
  {
    url: `${BASE_URL}/pricing`,
    title: "Pricing",
    lastModified: "2026-02-08",
    priority: "high",
  },
  {
    url: `${BASE_URL}/faq`,
    title: "FAQ",
    lastModified: "2026-02-08",
    priority: "high",
  },
  {
    url: `${BASE_URL}/blog`,
    title: "Blog Index",
    lastModified: "2026-02-08",
    priority: "high",
  },
  {
    url: `${BASE_URL}/features/kids-meal-planning`,
    title: "Kids Meal Planning Features",
    lastModified: "2026-02-08",
    priority: "high",
  },
  {
    url: `${BASE_URL}/features/picky-eater-solutions`,
    title: "Picky Eater Solutions",
    lastModified: "2026-02-08",
    priority: "high",
  },
  {
    url: `${BASE_URL}/solutions/arfid-meal-planning`,
    title: "ARFID Meal Planning",
    lastModified: "2026-02-08",
    priority: "high",
  },
  {
    url: `${BASE_URL}/solutions/toddler-meal-planning`,
    title: "Toddler Meal Planning",
    lastModified: "2026-02-08",
    priority: "medium",
  },
  {
    url: `${BASE_URL}/solutions/selective-eating`,
    title: "Selective Eating",
    lastModified: "2026-02-08",
    priority: "medium",
  },
  {
    url: `${BASE_URL}/picky-eater-quiz`,
    title: "Picky Eater Quiz",
    lastModified: "2026-02-08",
    priority: "medium",
  },
  {
    url: `${BASE_URL}/budget-calculator`,
    title: "Budget Calculator",
    lastModified: "2026-02-08",
    priority: "medium",
  },
  {
    url: `${BASE_URL}/resources/picky-eater-guide`,
    title: "Picky Eater Guide",
    lastModified: "2026-02-08",
    priority: "medium",
  },
];

/**
 * GEO content quality scoring
 *
 * Evaluates content against GEO optimization criteria.
 * Returns a score 0-100 and specific improvement suggestions.
 */
export interface GEOScoreResult {
  score: number;
  maxScore: number;
  percentage: number;
  checks: GEOCheck[];
}

export interface GEOCheck {
  name: string;
  passed: boolean;
  weight: number;
  suggestion?: string;
}

export function scoreContentForGEO(content: {
  text: string;
  headings: string[];
  hasSchema: boolean;
  hasFAQ: boolean;
  hasStatistics: boolean;
  hasExternalSources: boolean;
  hasBrandMention: boolean;
  hasDatePublished: boolean;
  hasDateModified: boolean;
  wordCount: number;
  firstParagraphLength: number;
}): GEOScoreResult {
  const checks: GEOCheck[] = [
    {
      name: "Direct answer in first 60 words",
      passed: content.firstParagraphLength >= 40 && content.firstParagraphLength <= 80,
      weight: 15,
      suggestion: content.firstParagraphLength < 40
        ? "Add a direct, concise answer in the first 40-60 words"
        : content.firstParagraphLength > 80
          ? "Front-load your answer — keep first paragraph to 40-60 words"
          : undefined,
    },
    {
      name: "Question-based headings",
      passed: content.headings.some((h) => h.includes("?")),
      weight: 10,
      suggestion: "Rephrase at least one H2 as a question users would ask AI",
    },
    {
      name: "Sufficient word count (800+)",
      passed: content.wordCount >= 800,
      weight: 10,
      suggestion:
        content.wordCount < 800
          ? `Content is ${content.wordCount} words. Aim for 800+ for AI citation eligibility`
          : undefined,
    },
    {
      name: "JSON-LD structured data present",
      passed: content.hasSchema,
      weight: 15,
      suggestion: "Add JSON-LD schema markup (Article + FAQ minimum)",
    },
    {
      name: "FAQ section included",
      passed: content.hasFAQ,
      weight: 10,
      suggestion: "Add 3-5 Q&A pairs at the bottom of the page",
    },
    {
      name: "Statistics and data points",
      passed: content.hasStatistics,
      weight: 10,
      suggestion: "Include statistics or data points every 150-200 words",
    },
    {
      name: "External source citations",
      passed: content.hasExternalSources,
      weight: 10,
      suggestion: "Add 2+ authoritative external source citations with live URLs",
    },
    {
      name: "Brand name naturally embedded",
      passed: content.hasBrandMention,
      weight: 5,
      suggestion: "Naturally embed 'EatPal' in key answer sections",
    },
    {
      name: "Publish date visible",
      passed: content.hasDatePublished,
      weight: 8,
      suggestion: "Add visible publish date for content freshness signals",
    },
    {
      name: "Last modified date visible",
      passed: content.hasDateModified,
      weight: 7,
      suggestion: "Add visible last modified date — AI engines weight recency",
    },
  ];

  const maxScore = checks.reduce((sum, check) => sum + check.weight, 0);
  const score = checks.reduce(
    (sum, check) => sum + (check.passed ? check.weight : 0),
    0
  );

  return {
    score,
    maxScore,
    percentage: Math.round((score / maxScore) * 100),
    checks,
  };
}

/**
 * Schema validation helper
 *
 * Checks if a page has the minimum required schema types
 * for optimal AI search visibility.
 */
export interface SchemaValidationResult {
  isValid: boolean;
  missingRequired: string[];
  missingRecommended: string[];
  present: string[];
}

export function validatePageSchema(
  pageType: "home" | "product" | "article" | "faq" | "comparison" | "pricing",
  presentSchemas: string[]
): SchemaValidationResult {
  const requirements: Record<string, { required: string[]; recommended: string[] }> = {
    home: {
      required: ["Organization", "WebSite", "SoftwareApplication"],
      recommended: ["FAQPage", "BreadcrumbList"],
    },
    product: {
      required: ["SoftwareApplication", "BreadcrumbList"],
      recommended: ["FAQPage", "Review", "AggregateRating"],
    },
    article: {
      required: ["Article", "BreadcrumbList"],
      recommended: ["FAQPage", "HowTo"],
    },
    faq: {
      required: ["FAQPage", "BreadcrumbList"],
      recommended: ["WebPage"],
    },
    comparison: {
      required: ["ItemList", "BreadcrumbList"],
      recommended: ["FAQPage"],
    },
    pricing: {
      required: ["Product", "BreadcrumbList"],
      recommended: ["FAQPage", "AggregateOffer"],
    },
  };

  const pageReqs = requirements[pageType];
  const missingRequired = pageReqs.required.filter(
    (schema) => !presentSchemas.includes(schema)
  );
  const missingRecommended = pageReqs.recommended.filter(
    (schema) => !presentSchemas.includes(schema)
  );

  return {
    isValid: missingRequired.length === 0,
    missingRequired,
    missingRecommended,
    present: presentSchemas,
  };
}

/**
 * Topic cluster structure for EatPal content hub
 *
 * Defines the pillar-cluster content architecture for SEO/GEO.
 * Each pillar page should link to all its cluster pages and vice versa.
 */
export const topicClusters = {
  foodChaining: {
    pillar: {
      title: "The Complete Guide to Food Chaining for Picky Eaters",
      url: "/resources/food-chaining-guide",
      targetKeywords: [
        "food chaining",
        "food chaining therapy",
        "food chaining for picky eaters",
      ],
    },
    clusters: [
      {
        title: "Food Chaining Examples: From Chicken Nuggets to Grilled Chicken",
        url: "/blog/food-chaining-examples",
        targetKeywords: ["food chaining examples", "food chain progression"],
      },
      {
        title: "How to Start Food Chaining at Home Without a Therapist",
        url: "/blog/food-chaining-at-home",
        targetKeywords: ["food chaining at home", "DIY food chaining"],
      },
      {
        title: "Food Chaining vs. Other Feeding Therapy Approaches",
        url: "/blog/food-chaining-vs-alternatives",
        targetKeywords: [
          "food chaining vs SOS approach",
          "feeding therapy methods",
        ],
      },
      {
        title: "Texture Progression Guide for Picky Eaters",
        url: "/blog/texture-progression-guide",
        targetKeywords: ["food texture progression", "sensory food textures"],
      },
      {
        title: "Food Chaining Success Stories: Real Family Results",
        url: "/blog/food-chaining-success-stories",
        targetKeywords: [
          "food chaining results",
          "picky eater success stories",
        ],
      },
    ],
  },
  arfid: {
    pillar: {
      title: "ARFID Meal Planning: A Complete Parent's Guide",
      url: "/solutions/arfid-meal-planning",
      targetKeywords: [
        "ARFID meal planning",
        "ARFID treatment",
        "ARFID diet",
      ],
    },
    clusters: [
      {
        title: "Signs Your Child May Have ARFID (Not Just Picky Eating)",
        url: "/blog/arfid-signs-symptoms",
        targetKeywords: [
          "ARFID symptoms",
          "ARFID vs picky eating",
          "ARFID diagnosis",
        ],
      },
      {
        title: "ARFID-Friendly Meal Ideas That Meet Nutritional Needs",
        url: "/blog/arfid-meal-ideas",
        targetKeywords: ["ARFID meals", "ARFID friendly foods"],
      },
      {
        title: "Nutritional Supplements for Children with ARFID",
        url: "/blog/arfid-nutritional-supplements",
        targetKeywords: ["ARFID supplements", "ARFID nutrition deficiency"],
      },
      {
        title: "Finding an ARFID Specialist: Types of Providers Who Can Help",
        url: "/blog/arfid-specialists",
        targetKeywords: [
          "ARFID therapist",
          "ARFID specialist",
          "ARFID treatment providers",
        ],
      },
      {
        title: "ARFID in Adults: It's Not Just a Childhood Condition",
        url: "/blog/arfid-in-adults",
        targetKeywords: ["ARFID adults", "adult picky eating"],
      },
    ],
  },
  pickyEating: {
    pillar: {
      title: "The Science of Picky Eating: Why Kids Refuse Foods and What Works",
      url: "/resources/picky-eater-guide",
      targetKeywords: [
        "picky eater",
        "picky eating causes",
        "how to help picky eaters",
      ],
    },
    clusters: [
      {
        title: "How Many Times Should I Offer a New Food? The 15-20 Exposure Rule",
        url: "/blog/food-exposure-rule",
        targetKeywords: [
          "food exposure rule",
          "how many times try new food",
          "15 exposures new food",
        ],
      },
      {
        title: "Division of Responsibility: The Proven Feeding Framework",
        url: "/blog/division-of-responsibility",
        targetKeywords: [
          "division of responsibility feeding",
          "Ellyn Satter method",
        ],
      },
      {
        title: "Sensory Processing and Picky Eating: Understanding the Connection",
        url: "/blog/sensory-picky-eating",
        targetKeywords: [
          "sensory picky eating",
          "sensory food aversion",
          "SPD eating",
        ],
      },
      {
        title: "Age-by-Age Guide: Normal Picky Eating vs. Feeding Disorders",
        url: "/blog/picky-eating-by-age",
        targetKeywords: [
          "toddler picky eating normal",
          "when is picky eating a problem",
        ],
      },
      {
        title: "Mealtime Strategies That Actually Work (According to Research)",
        url: "/blog/mealtime-strategies",
        targetKeywords: [
          "mealtime strategies picky eaters",
          "how to make mealtimes less stressful",
        ],
      },
    ],
  },
};

/**
 * Competitor comparison targets
 *
 * Products/services to create comparison pages against.
 * Each comparison page should use ComparisonSchema and follow
 * the honest, fact-based comparison format.
 */
export const comparisonTargets = [
  {
    competitor: "Mealime",
    comparisonTitle: "EatPal vs Mealime: Which Is Better for Picky Eaters?",
    slug: "eatpal-vs-mealime",
    keyDifferentiator: "Food chaining methodology vs general meal planning",
  },
  {
    competitor: "Yummly",
    comparisonTitle: "EatPal vs Yummly: Meal Planning for Selective Eaters",
    slug: "eatpal-vs-yummly",
    keyDifferentiator: "Picky eater specialization vs general recipe discovery",
  },
  {
    competitor: "Eat This Much",
    comparisonTitle: "EatPal vs Eat This Much: Managing Kids' Limited Diets",
    slug: "eatpal-vs-eat-this-much",
    keyDifferentiator: "Child-focused food chaining vs adult nutrition planning",
  },
  {
    competitor: "Paprika",
    comparisonTitle: "EatPal vs Paprika: Best App for Families with Picky Eaters",
    slug: "eatpal-vs-paprika",
    keyDifferentiator: "AI-powered picky eater planning vs recipe management",
  },
  {
    competitor: "Feeding Therapy Workbooks",
    comparisonTitle: "EatPal vs Traditional Feeding Therapy Workbooks",
    slug: "eatpal-vs-feeding-therapy-workbooks",
    keyDifferentiator: "Digital tracking and AI predictions vs paper-based tracking",
  },
];
