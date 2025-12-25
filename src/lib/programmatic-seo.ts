/**
 * Programmatic SEO Data Configuration
 *
 * This file contains all the data for scalable, programmatic SEO pages.
 * Each page is dynamically generated from this configuration.
 */

import type { SEOProps } from "@/components/SEOHead";

const baseUrl = "https://tryeatpal.com";

export interface FeaturePageData {
  slug: string;
  title: string;
  headline: string;
  subheadline: string;
  description: string;
  keywords: string;
  heroImage?: string;
  benefits: Array<{
    title: string;
    description: string;
    icon: string;
  }>;
  features: Array<{
    title: string;
    description: string;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  cta: {
    primary: string;
    secondary: string;
  };
  relatedPages: string[];
  aiMetadata: {
    purpose: string;
    audience: string;
    keyFeatures: string;
    useCases: string;
  };
}

export interface SolutionPageData extends FeaturePageData {
  targetAudience: string;
  problemStatement: string;
  solution: string;
  testimonial?: {
    quote: string;
    author: string;
    role: string;
  };
}

// Feature Pages Data
export const featurePages: Record<string, FeaturePageData> = {
  "kids-meal-planning": {
    slug: "kids-meal-planning",
    title: "Kids Meal Planning Made Easy | EatPal",
    headline: "Effortless Meal Planning for Kids",
    subheadline: "Create balanced, kid-approved meals in minutes with AI-powered suggestions tailored to your family's preferences.",
    description: "Simplify meal planning for kids with EatPal's AI-powered platform. Create personalized meal plans, track nutrition, and discover kid-friendly recipes that even picky eaters will love.",
    keywords: "kids meal planning, children's meal planner, family meal planning, kid-friendly recipes, balanced meals for kids, weekly meal plan for children, toddler meal ideas",
    heroImage: "/features/kids-meal-planning-hero.webp",
    benefits: [
      {
        title: "Save Time",
        description: "Generate a week's worth of meals in under 5 minutes with AI suggestions.",
        icon: "Clock"
      },
      {
        title: "Reduce Stress",
        description: "No more daily 'what's for dinner' decisions - plan once, shop once.",
        icon: "Heart"
      },
      {
        title: "Better Nutrition",
        description: "Ensure balanced meals with automatic nutrition tracking and insights.",
        icon: "Sparkles"
      },
      {
        title: "Happy Kids",
        description: "Discover meals your kids will actually eat based on their preferences.",
        icon: "Smile"
      }
    ],
    features: [
      {
        title: "AI-Powered Meal Suggestions",
        description: "Get personalized meal recommendations based on your child's preferences, allergies, and nutritional needs."
      },
      {
        title: "Drag-and-Drop Weekly Planner",
        description: "Easily organize meals throughout the week with our intuitive drag-and-drop interface."
      },
      {
        title: "Automatic Grocery Lists",
        description: "Generate shopping lists automatically from your meal plans, organized by store section."
      },
      {
        title: "Nutrition Dashboard",
        description: "Track your child's nutritional intake with visual charts and recommendations."
      },
      {
        title: "Recipe Library",
        description: "Access hundreds of kid-tested recipes with step-by-step instructions and nutrition info."
      },
      {
        title: "Multi-Child Support",
        description: "Manage meal plans for multiple children with different preferences and dietary needs."
      }
    ],
    faqs: [
      {
        question: "How does the AI meal planning work?",
        answer: "Our AI analyzes your child's food preferences, safe foods, and nutritional needs to suggest meals they're likely to enjoy. The more you use EatPal, the smarter our recommendations become."
      },
      {
        question: "Can I plan meals for multiple kids?",
        answer: "Yes! EatPal supports unlimited child profiles. Each child can have their own preferences, allergies, and meal plans, making it easy for families with diverse eating needs."
      },
      {
        question: "Does it work for picky eaters?",
        answer: "Absolutely! EatPal was specifically designed for picky eaters. We use food chaining techniques to gradually introduce new foods based on what your child already accepts."
      }
    ],
    cta: {
      primary: "Start Free Trial",
      secondary: "See How It Works"
    },
    relatedPages: ["picky-eater-solutions", "nutrition-tracking", "grocery-lists"],
    aiMetadata: {
      purpose: "EatPal's Kids Meal Planning feature helps parents create personalized, nutritious meal plans for their children using AI-powered suggestions. The platform considers food preferences, allergies, and nutritional requirements to generate family-friendly meal ideas.",
      audience: "Parents of children ages 1-12 looking to simplify meal planning, families with picky eaters, busy parents seeking time-saving meal solutions, caregivers managing children's nutrition",
      keyFeatures: "AI meal suggestions, drag-and-drop weekly planner, automatic grocery lists, nutrition tracking, recipe library with 500+ kid-friendly recipes, multi-child support, allergen management",
      useCases: "Planning weekly family meals, finding recipes picky kids will eat, tracking children's nutritional intake, generating grocery lists, managing meals for multiple children with different preferences"
    }
  },
  "picky-eater-solutions": {
    slug: "picky-eater-solutions",
    title: "Picky Eater Solutions | Food Chaining Therapy | EatPal",
    headline: "Evidence-Based Solutions for Picky Eaters",
    subheadline: "Help your child expand their diet using food chaining - the proven feeding therapy method trusted by therapists.",
    description: "Overcome picky eating with EatPal's food chaining approach. Our AI-powered platform uses evidence-based feeding therapy techniques to help children gradually accept new foods.",
    keywords: "picky eater solutions, food chaining therapy, picky eating help, selective eating treatment, feeding therapy at home, expand child's diet, overcome picky eating",
    heroImage: "/features/picky-eater-solutions-hero.webp",
    benefits: [
      {
        title: "Proven Methods",
        description: "Food chaining is used by feeding therapists worldwide with documented success.",
        icon: "CheckCircle"
      },
      {
        title: "Gradual Progress",
        description: "Small steps from safe foods to new foods reduce anxiety and increase acceptance.",
        icon: "TrendingUp"
      },
      {
        title: "Less Mealtime Stress",
        description: "Evidence-based strategies that reduce battles and create positive food experiences.",
        icon: "Smile"
      },
      {
        title: "AI Food Chains",
        description: "Our AI generates personalized food chains based on your child's current safe foods.",
        icon: "Sparkles"
      }
    ],
    features: [
      {
        title: "Safe Food Library",
        description: "Track and organize all the foods your child currently accepts, with sensory and nutrition details."
      },
      {
        title: "AI Food Chain Generator",
        description: "Enter a safe food and get AI-generated chains showing gradual steps to new, similar foods."
      },
      {
        title: "Try Bite Tracking",
        description: "Log exposure attempts and track progress toward the 15-20 exposures research shows are needed."
      },
      {
        title: "Sensory Preferences",
        description: "Map your child's texture, taste, and temperature preferences to guide food introductions."
      },
      {
        title: "Progress Visualization",
        description: "See your child's food acceptance journey with charts showing newly accepted foods over time."
      },
      {
        title: "Therapist Integration",
        description: "Share progress reports with feeding therapists or use EatPal alongside professional treatment."
      }
    ],
    faqs: [
      {
        question: "What is food chaining?",
        answer: "Food chaining is a feeding therapy technique that introduces new foods by making small changes to foods a child already accepts. For example, moving from chicken nuggets to breaded chicken tenders, then to plain grilled chicken strips."
      },
      {
        question: "How long does it take to see results?",
        answer: "Most families see new foods accepted within 4-8 weeks of consistent use. Research shows children typically need 15-20 exposures to a new food before accepting it."
      },
      {
        question: "Is this a replacement for feeding therapy?",
        answer: "EatPal is designed to complement professional feeding therapy or help families with moderate picky eating. For severe feeding disorders like ARFID, we recommend working with a professional while using EatPal as a support tool."
      }
    ],
    cta: {
      primary: "Start Expanding Their Diet",
      secondary: "Learn About Food Chaining"
    },
    relatedPages: ["kids-meal-planning", "try-bites", "nutrition-tracking"],
    aiMetadata: {
      purpose: "EatPal's Picky Eater Solutions use food chaining, the evidence-based feeding therapy technique, to help children gradually expand their diet. The platform generates AI-powered food chains from safe foods, tracks try bite exposures, and monitors sensory preferences.",
      audience: "Parents of picky eaters ages 1-12, families struggling with mealtime battles, caregivers of children with limited food repertoires, parents seeking alternatives to or supplements for feeding therapy",
      keyFeatures: "AI food chain generator, safe food tracking, try bite exposure logging, sensory preference mapping, progress visualization, 70%+ food acceptance prediction accuracy, therapist-shareable reports",
      useCases: "Expanding a child's diet from 10 foods to 30+, reducing mealtime stress, tracking food exposures, finding foods similar to current safe foods, supporting feeding therapy at home"
    }
  },
  "try-bites": {
    slug: "try-bites",
    title: "Try Bites Tracking | Food Exposure Therapy | EatPal",
    headline: "Track Try Bites & Food Exposures",
    subheadline: "Research shows 15-20 exposures are needed before a child accepts new food. Track every try bite.",
    description: "Master the try bite method with EatPal's exposure tracking. Log every food interaction, from looking to tasting, and watch your child's food acceptance grow over time.",
    keywords: "try bites, food exposure therapy, repeated food exposure, picky eater try bites, food acceptance tracking, exposure therapy for picky eaters",
    heroImage: "/features/try-bites-hero.webp",
    benefits: [
      {
        title: "Science-Backed",
        description: "Based on research showing repeated exposure is key to food acceptance.",
        icon: "BookOpen"
      },
      {
        title: "Track Every Step",
        description: "Log all types of food interaction, from looking and touching to tasting.",
        icon: "ClipboardList"
      },
      {
        title: "See Progress",
        description: "Visual charts show how close each food is to the acceptance threshold.",
        icon: "BarChart"
      },
      {
        title: "Celebrate Wins",
        description: "Get notifications when foods reach milestone exposures and acceptances.",
        icon: "Trophy"
      }
    ],
    features: [
      {
        title: "Exposure Ladder",
        description: "Track the hierarchy of food interactions: looking, touching, smelling, licking, biting, chewing, swallowing."
      },
      {
        title: "Quick Logging",
        description: "Log try bites in seconds with our streamlined interface designed for busy mealtimes."
      },
      {
        title: "Exposure Counter",
        description: "See how many times your child has been exposed to each food with progress toward the 15-20 target."
      },
      {
        title: "Meal Integration",
        description: "Try bites are automatically included in meal plans alongside safe foods."
      },
      {
        title: "Reaction Notes",
        description: "Log how your child reacted to each exposure to identify patterns and preferences."
      },
      {
        title: "Historical Trends",
        description: "View exposure history and acceptance rates over weeks and months."
      }
    ],
    faqs: [
      {
        question: "What counts as a try bite?",
        answer: "A try bite is any positive interaction with a new food - looking at it, touching it, smelling it, licking it, or taking an actual bite. All interactions count toward building familiarity."
      },
      {
        question: "Why do kids need so many exposures?",
        answer: "Research by Dr. Leann Birch and others shows that children need an average of 15-20 neutral exposures to a new food before they'll accept it. This is normal and biological, not defiance."
      },
      {
        question: "How do I make try bites positive?",
        answer: "Keep try bites pressure-free. Offer the food alongside accepted foods without requiring eating. Praise any interaction. EatPal provides tips and scripts for each try bite session."
      }
    ],
    cta: {
      primary: "Start Tracking Try Bites",
      secondary: "Learn the Method"
    },
    relatedPages: ["picky-eater-solutions", "kids-meal-planning", "nutrition-tracking"],
    aiMetadata: {
      purpose: "EatPal's Try Bites feature helps parents implement food exposure therapy at home by tracking every food interaction their child has with new foods. Based on research showing 15-20 exposures are needed for acceptance, the tool logs progress and predicts when acceptance is likely.",
      audience: "Parents implementing try bite strategies, families doing food exposure therapy at home, caregivers tracking picky eater progress, feeding therapists monitoring client progress",
      keyFeatures: "Exposure ladder tracking, quick mealtime logging, exposure counter toward 15-20 target, reaction notes, meal plan integration, historical trend visualization, acceptance predictions",
      useCases: "Tracking how many times a child has tried a new food, logging reactions to food exposures, celebrating exposure milestones, integrating try bites into daily meals, sharing progress with therapists"
    }
  },
  "grocery-lists": {
    slug: "grocery-lists",
    title: "Smart Grocery Lists | Automated Shopping | EatPal",
    headline: "Grocery Lists That Build Themselves",
    subheadline: "Your meal plan automatically becomes a shopping list, organized by store section.",
    description: "Save time with EatPal's automatic grocery list generation. Turn your weekly meal plan into an organized shopping list with one click. Integrates with Instacart for delivery.",
    keywords: "automatic grocery lists, meal plan shopping list, smart grocery list app, organized shopping list, instacart integration, family grocery planning",
    heroImage: "/features/grocery-lists-hero.webp",
    benefits: [
      {
        title: "One-Click Lists",
        description: "Generate complete grocery lists from your meal plan instantly.",
        icon: "Zap"
      },
      {
        title: "Store-Ready",
        description: "Lists organized by store section - produce, dairy, meat, etc.",
        icon: "Store"
      },
      {
        title: "Never Forget",
        description: "Every ingredient from every recipe, automatically included.",
        icon: "CheckSquare"
      },
      {
        title: "Delivery Ready",
        description: "Send lists directly to Instacart for same-day delivery.",
        icon: "Truck"
      }
    ],
    features: [
      {
        title: "Auto-Generation",
        description: "Click once and all ingredients from your meal plan appear in your grocery list."
      },
      {
        title: "Category Organization",
        description: "Items sorted by store section for efficient shopping: produce, dairy, proteins, pantry, frozen."
      },
      {
        title: "Quantity Aggregation",
        description: "If multiple recipes use chicken, we combine the quantities into one line item."
      },
      {
        title: "Pantry Sync",
        description: "Connect your pantry to skip items you already have in stock."
      },
      {
        title: "Instacart Integration",
        description: "Send your list directly to Instacart for grocery delivery (where available)."
      },
      {
        title: "Shareable Lists",
        description: "Share grocery lists with family members or a partner who's doing the shopping."
      }
    ],
    faqs: [
      {
        question: "How does automatic list generation work?",
        answer: "When you finalize your meal plan, EatPal pulls all ingredients from each recipe, combines quantities where ingredients repeat, and organizes them by store section."
      },
      {
        question: "Can I add items that aren't in recipes?",
        answer: "Yes! You can manually add any items to your list. There's also a 'staples' feature for things you buy every week regardless of recipes."
      },
      {
        question: "Does it work with Instacart?",
        answer: "Yes, EatPal integrates with Instacart. You can send your grocery list directly to Instacart for same-day delivery or pickup at participating stores."
      }
    ],
    cta: {
      primary: "Try Smart Grocery Lists",
      secondary: "See How It Works"
    },
    relatedPages: ["kids-meal-planning", "nutrition-tracking", "picky-eater-solutions"],
    aiMetadata: {
      purpose: "EatPal's Grocery Lists feature automatically generates organized shopping lists from weekly meal plans. Lists are sorted by store section, combine duplicate ingredients, sync with your pantry inventory, and integrate with Instacart for delivery.",
      audience: "Busy parents seeking shopping efficiency, families doing weekly meal prep, caregivers managing household grocery shopping, users looking to reduce food waste and forgotten items",
      keyFeatures: "One-click list generation, store section organization, ingredient quantity aggregation, pantry sync, Instacart integration, shareable lists, staples management",
      useCases: "Converting meal plans to shopping lists, efficient grocery store navigation, grocery delivery ordering, sharing shopping duties with family, tracking pantry inventory"
    }
  },
  "nutrition-tracking": {
    slug: "nutrition-tracking",
    title: "Kids Nutrition Tracking | Dietary Analysis | EatPal",
    headline: "Understand Your Child's Nutrition",
    subheadline: "See exactly what nutrients your child is getting - and what might be missing.",
    description: "Track your child's nutritional intake with EatPal's easy-to-understand dashboard. Monitor calories, protein, vitamins, and minerals to ensure balanced nutrition even with limited diets.",
    keywords: "kids nutrition tracking, child dietary analysis, picky eater nutrition, vitamin deficiency tracker, balanced diet for kids, nutrition dashboard children",
    heroImage: "/features/nutrition-tracking-hero.webp",
    benefits: [
      {
        title: "Visual Insights",
        description: "Easy-to-read charts show nutrition at a glance, not confusing numbers.",
        icon: "PieChart"
      },
      {
        title: "Gap Detection",
        description: "Identify potential nutritional gaps in limited diets early.",
        icon: "AlertCircle"
      },
      {
        title: "Age-Appropriate",
        description: "Recommendations based on your child's age and activity level.",
        icon: "User"
      },
      {
        title: "Doctor-Ready",
        description: "Generate reports to share with pediatricians or dietitians.",
        icon: "FileText"
      }
    ],
    features: [
      {
        title: "Macro Tracking",
        description: "Monitor calories, protein, carbohydrates, and fats across meals and days."
      },
      {
        title: "Vitamin Dashboard",
        description: "Track key vitamins (A, C, D, E, K, B-vitamins) against age-appropriate targets."
      },
      {
        title: "Mineral Monitoring",
        description: "Ensure adequate iron, calcium, zinc, and other essential minerals."
      },
      {
        title: "Limited Diet Analysis",
        description: "Special analysis for picky eaters showing which nutrients might be lacking."
      },
      {
        title: "Food Suggestions",
        description: "Get suggestions for foods that could fill specific nutritional gaps."
      },
      {
        title: "Trend Reports",
        description: "View nutrition trends over weeks and months to see improvements."
      }
    ],
    faqs: [
      {
        question: "Is nutrition tracking automatic?",
        answer: "Yes! Once you log meals in your planner, nutrition is calculated automatically from our database of 10,000+ foods with full nutritional information."
      },
      {
        question: "What if my child has a very limited diet?",
        answer: "EatPal is designed for limited diets. We'll show you exactly which nutrients might be low and suggest safe foods that could help, plus flag when to consult a professional."
      },
      {
        question: "Can I share reports with our doctor?",
        answer: "Yes, you can generate PDF nutrition reports to share with pediatricians, dietitians, or feeding therapists. Reports include intake data, trends, and potential concerns."
      }
    ],
    cta: {
      primary: "Start Tracking Nutrition",
      secondary: "See Sample Dashboard"
    },
    relatedPages: ["kids-meal-planning", "picky-eater-solutions", "grocery-lists"],
    aiMetadata: {
      purpose: "EatPal's Nutrition Tracking provides visual, easy-to-understand nutritional analysis for children's diets. Especially useful for picky eaters with limited food repertoires, it identifies potential nutrient gaps and suggests foods to fill them.",
      audience: "Parents concerned about picky eater nutrition, families with children on limited diets, caregivers monitoring dietary adequacy, parents preparing for pediatrician visits",
      keyFeatures: "Automatic nutrition calculation, macro and micronutrient tracking, visual dashboards, gap detection for limited diets, age-appropriate recommendations, shareable doctor reports, food suggestions",
      useCases: "Monitoring picky eater's nutrition, identifying vitamin or mineral deficiencies, preparing nutrition reports for doctor visits, finding nutritious foods a child might accept, tracking dietary improvements over time"
    }
  }
};

// Solution Pages Data
export const solutionPages: Record<string, SolutionPageData> = {
  "toddler-meal-planning": {
    slug: "toddler-meal-planning",
    title: "Toddler Meal Planning | Ages 1-3 | EatPal",
    headline: "Meal Planning for Toddlers (Ages 1-3)",
    subheadline: "Navigate the toddler eating years with confidence. From first foods to family meals.",
    description: "Expert toddler meal planning with age-appropriate portions, textures, and nutrition. Perfect for the challenging 1-3 year transition period when picky eating often begins.",
    keywords: "toddler meal planning, toddler meals, feeding toddlers, 1 year old meal plan, 2 year old meal ideas, toddler portion sizes, toddler nutrition",
    targetAudience: "Parents of toddlers ages 12 months to 3 years",
    problemStatement: "Toddlers are notoriously picky and unpredictable eaters. The transition from baby food to table food is stressful, and parents worry about nutrition.",
    solution: "EatPal provides toddler-specific meal plans with appropriate portions, textures, and nutrition targets. Our approach prevents picky eating from becoming entrenched.",
    heroImage: "/solutions/toddler-meal-planning-hero.webp",
    benefits: [
      {
        title: "Age-Appropriate",
        description: "Meals designed for toddler portions, textures, and developmental stages.",
        icon: "Baby"
      },
      {
        title: "Prevent Picky Eating",
        description: "Early intervention strategies to prevent restrictive eating habits.",
        icon: "Shield"
      },
      {
        title: "Nutrition Confidence",
        description: "Know your toddler is getting what they need, even on 'bad' eating days.",
        icon: "Heart"
      },
      {
        title: "Transition Support",
        description: "Smooth transition from purees to table foods with step-by-step guidance.",
        icon: "ArrowRight"
      }
    ],
    features: [
      {
        title: "Toddler Portions Guide",
        description: "Visual guides showing appropriate portion sizes for 1, 2, and 3-year-olds."
      },
      {
        title: "Texture Progression",
        description: "Guidance on advancing textures from soft foods to regular table foods."
      },
      {
        title: "Finger Food Ideas",
        description: "Hundreds of finger food ideas perfect for self-feeding toddlers."
      },
      {
        title: "Grazing Strategies",
        description: "Tips for toddlers who prefer grazing over sit-down meals."
      },
      {
        title: "Food Jag Solutions",
        description: "Strategies for when your toddler only wants one food for days."
      },
      {
        title: "Allergen Introduction",
        description: "Safe schedules for introducing common allergens during the toddler years."
      }
    ],
    faqs: [
      {
        question: "How much should my toddler eat?",
        answer: "Toddler portions are 1/4 to 1/3 of adult portions. EatPal shows visual guides for each meal. Remember: toddlers' appetites vary wildly day-to-day, and that's normal."
      },
      {
        question: "My toddler won't try new foods. Is that normal?",
        answer: "Yes! Neophobia (fear of new foods) peaks between ages 2-6. EatPal's food chaining approach works with this biology, not against it."
      },
      {
        question: "How do I know if my toddler is getting enough nutrition?",
        answer: "EatPal tracks nutrition over weeks, not days. Toddlers self-regulate well - focus on offering variety and let them decide amounts."
      }
    ],
    cta: {
      primary: "Plan Toddler Meals",
      secondary: "See Toddler Resources"
    },
    relatedPages: ["kids-meal-planning", "picky-eater-solutions", "nutrition-tracking"],
    aiMetadata: {
      purpose: "EatPal's Toddler Meal Planning helps parents navigate the challenging 1-3 year feeding period with age-appropriate meal plans, portion guidance, texture progression, and strategies to prevent entrenched picky eating.",
      audience: "Parents of toddlers ages 12 months to 3 years, first-time parents navigating the baby-to-toddler food transition, caregivers concerned about toddler nutrition or emerging picky eating",
      keyFeatures: "Toddler-specific portions, texture progression guidance, finger food ideas, food jag strategies, allergen introduction schedules, nutrition tracking for limited diets",
      useCases: "Planning meals for 1-3 year olds, transitioning from purees to table foods, managing toddler food jags, introducing allergens safely, preventing picky eating from developing"
    }
  },
  "arfid-meal-planning": {
    slug: "arfid-meal-planning",
    title: "ARFID Meal Planning & Support | EatPal",
    headline: "Support for ARFID & Severe Picky Eating",
    subheadline: "Specialized tools for families managing Avoidant/Restrictive Food Intake Disorder.",
    description: "ARFID-specific meal planning with safe food tracking, sensory preferences, and gentle exposure tools. Designed to complement professional treatment with at-home support.",
    keywords: "ARFID meal planning, avoidant restrictive food intake disorder, severe picky eating, ARFID support, ARFID treatment at home, ARFID safe foods",
    targetAudience: "Families with children diagnosed with or suspected of having ARFID",
    problemStatement: "ARFID goes beyond typical picky eating. Children may eat fewer than 20 foods, have intense fear of new foods, or have sensory issues that make eating extremely difficult.",
    solution: "EatPal provides ARFID-aware tools that respect sensory needs, track safe foods meticulously, and support professional treatment with at-home practice.",
    heroImage: "/solutions/arfid-meal-planning-hero.webp",
    benefits: [
      {
        title: "ARFID-Aware",
        description: "Designed with input from ARFID specialists and feeding therapists.",
        icon: "Stethoscope"
      },
      {
        title: "Safe Food Focus",
        description: "Robust tracking for very limited safe food lists with sensory details.",
        icon: "Shield"
      },
      {
        title: "Gentle Progress",
        description: "Low-pressure tools for tiny steps - no forcing, no pressure.",
        icon: "Feather"
      },
      {
        title: "Therapy Support",
        description: "Complement professional treatment with consistent at-home practice.",
        icon: "Users"
      }
    ],
    features: [
      {
        title: "Comprehensive Safe Food Library",
        description: "Track every accepted food with brand-specific details (e.g., 'only McDonald's fries')."
      },
      {
        title: "Sensory Mapping",
        description: "Document textures, temperatures, colors, and presentations your child accepts."
      },
      {
        title: "Micro-Step Food Chains",
        description: "Smaller steps for bigger fears - very gradual progressions appropriate for ARFID."
      },
      {
        title: "Exposure Hierarchy",
        description: "Track all levels of exposure from being in the same room to actually eating."
      },
      {
        title: "Therapist Sharing",
        description: "Generate detailed reports to share with feeding therapists and treatment teams."
      },
      {
        title: "Crisis Resources",
        description: "Quick access to resources for when eating becomes especially difficult."
      }
    ],
    faqs: [
      {
        question: "Is EatPal a treatment for ARFID?",
        answer: "No. EatPal is a support tool designed to complement professional ARFID treatment. We recommend working with a feeding therapist, dietitian, or ARFID specialist alongside using EatPal."
      },
      {
        question: "How is this different from regular picky eating tools?",
        answer: "Our ARFID tools use smaller steps, more detailed sensory tracking, brand-specific safe food documentation, and are designed for the intense food fears characteristic of ARFID."
      },
      {
        question: "Can I share data with my child's treatment team?",
        answer: "Yes! EatPal generates detailed PDF reports including safe food lists, sensory preferences, exposure attempts, and progress that you can share with therapists."
      }
    ],
    testimonial: {
      quote: "EatPal helped us track Jake's 14 safe foods and slowly, over 8 months, expand to 23. The therapist sharing feature meant our whole team was aligned.",
      author: "Sarah M.",
      role: "Parent of child with ARFID"
    },
    cta: {
      primary: "Try ARFID Tools",
      secondary: "Learn About ARFID Support"
    },
    relatedPages: ["picky-eater-solutions", "try-bites", "nutrition-tracking"],
    aiMetadata: {
      purpose: "EatPal's ARFID Meal Planning provides specialized support for families managing Avoidant/Restrictive Food Intake Disorder. Designed to complement professional treatment, it offers detailed safe food tracking, sensory mapping, micro-step food chains, and therapist-shareable reports.",
      audience: "Parents of children with ARFID diagnosis, families with severely picky eaters (fewer than 20 foods), caregivers working with feeding therapists, treatment teams seeking at-home tracking tools",
      keyFeatures: "Brand-specific safe food tracking, detailed sensory mapping, micro-step food chains, exposure hierarchy logging, therapist report sharing, ARFID-aware design with input from specialists",
      useCases: "Tracking very limited safe food lists, documenting sensory preferences for treatment, logging exposure therapy progress at home, sharing data with feeding therapists, managing ARFID alongside professional treatment"
    }
  },
  "selective-eating": {
    slug: "selective-eating",
    title: "Selective Eating Solutions | Expand Limited Diets | EatPal",
    headline: "Help for Selective Eating",
    subheadline: "When your child eats the same 10-20 foods over and over, EatPal can help expand that list.",
    description: "Break the cycle of selective eating with proven food chaining techniques. Help your child move beyond their comfort foods to a more varied, balanced diet.",
    keywords: "selective eating disorder, limited diet children, same foods every day, expand child's diet, selective eating treatment, food variety for kids",
    targetAudience: "Parents of children who eat a very limited variety of foods (typically 10-30 items)",
    problemStatement: "Selective eaters stick to a small rotation of familiar foods, often specific brands or preparations. This can lead to nutritional concerns and family stress.",
    solution: "EatPal uses food chaining to bridge from accepted foods to new ones, making gradual changes that feel safe rather than scary.",
    heroImage: "/solutions/selective-eating-hero.webp",
    benefits: [
      {
        title: "Break the Cycle",
        description: "Move beyond the same 10 foods with strategic, small-step changes.",
        icon: "RefreshCw"
      },
      {
        title: "Reduce Rigidity",
        description: "Help children become more flexible about brands, preparations, and presentations.",
        icon: "Minimize2"
      },
      {
        title: "Build Confidence",
        description: "Each new food accepted builds confidence for the next one.",
        icon: "TrendingUp"
      },
      {
        title: "Less Stress",
        description: "Structured approach reduces mealtime battles and parental anxiety.",
        icon: "Heart"
      }
    ],
    features: [
      {
        title: "Food Variety Tracker",
        description: "See exactly how many unique foods your child eats and set variety goals."
      },
      {
        title: "Brand Flexibility Training",
        description: "Tools to help children accept multiple brands of the same food."
      },
      {
        title: "Preparation Variations",
        description: "Track and expand accepted preparations (e.g., from only fried to baked)."
      },
      {
        title: "Strategic Food Chains",
        description: "AI-generated chains that strategically expand food categories."
      },
      {
        title: "Rotation Planning",
        description: "Meal plans that maintain safe foods while introducing new options."
      },
      {
        title: "Family Meal Bridges",
        description: "Find versions of family meals that work for your selective eater."
      }
    ],
    faqs: [
      {
        question: "What's the difference between picky eating and selective eating?",
        answer: "Selective eating typically involves a more limited food repertoire (often fewer than 30 foods), strong brand/preparation preferences, and significant distress when familiar foods aren't available."
      },
      {
        question: "How many new foods can we expect to add?",
        answer: "Results vary, but many families using EatPal consistently add 5-15 new foods within 3-6 months. The key is consistency and very small steps."
      },
      {
        question: "Will this help with brand rigidity?",
        answer: "Yes! We have specific tools for brand flexibility training, helping children learn that Kraft and store-brand mac and cheese are both 'mac and cheese.'"
      }
    ],
    cta: {
      primary: "Start Expanding Variety",
      secondary: "Take the Assessment"
    },
    relatedPages: ["picky-eater-solutions", "kids-meal-planning", "arfid-meal-planning"],
    aiMetadata: {
      purpose: "EatPal's Selective Eating solutions help children who eat a very limited variety of foods (typically 10-30 items) expand their diet through food chaining, brand flexibility training, and gradual exposure techniques.",
      audience: "Parents of selective eaters with limited food repertoires, families frustrated by extreme food rigidity, caregivers of children who only eat specific brands or preparations",
      keyFeatures: "Food variety tracking, brand flexibility training, preparation variation logging, strategic AI food chains, rotation meal planning, family meal adaptations",
      useCases: "Expanding a child's food repertoire from 15 to 30+ foods, reducing brand rigidity, introducing new food preparations, planning meals that include both safe foods and new options"
    }
  },
  "multi-child-meal-planning": {
    slug: "multi-child-meal-planning",
    title: "Multi-Child Meal Planning | Different Preferences | EatPal",
    headline: "One Plan, Multiple Kids",
    subheadline: "Manage different allergies, preferences, and picky eating levels across all your children.",
    description: "Stop making three different dinners. EatPal helps you plan meals that work for every child, with modifications and alternatives built in.",
    keywords: "multi-child meal planning, different food preferences, sibling meal planning, family meal planning multiple kids, picky eater and non-picky sibling",
    targetAudience: "Families with multiple children who have different food preferences, allergies, or eating challenges",
    problemStatement: "When one child is picky, another has allergies, and a third will eat anything, meal planning becomes a nightmare of separate meals.",
    solution: "EatPal creates unified family meal plans with built-in modifications for each child, so you can cook once while meeting everyone's needs.",
    heroImage: "/solutions/multi-child-meal-planning-hero.webp",
    benefits: [
      {
        title: "One Shopping Trip",
        description: "Unified grocery lists even with different dietary needs per child.",
        icon: "ShoppingCart"
      },
      {
        title: "Less Cooking",
        description: "Base recipes with modifications, not completely separate meals.",
        icon: "ChefHat"
      },
      {
        title: "Equal Treatment",
        description: "Every child gets appropriate food without feeling singled out.",
        icon: "Users"
      },
      {
        title: "Progress for All",
        description: "Track each child's food journey independently while planning together.",
        icon: "BarChart2"
      }
    ],
    features: [
      {
        title: "Unlimited Child Profiles",
        description: "Create detailed profiles for each child with allergies, preferences, and safe foods."
      },
      {
        title: "Unified Meal Plans",
        description: "See one family meal plan with each child's portion/modification shown."
      },
      {
        title: "Modification Suggestions",
        description: "AI suggests how to modify family recipes for each child's needs."
      },
      {
        title: "Individual Progress Tracking",
        description: "Track food acceptance progress for each child separately."
      },
      {
        title: "Combined Grocery Lists",
        description: "One grocery list that includes everything needed for all children."
      },
      {
        title: "Family Meal Goals",
        description: "Work toward meals everyone can eat together, with strategy suggestions."
      }
    ],
    faqs: [
      {
        question: "How many children can I add?",
        answer: "EatPal Pro supports unlimited child profiles. Each child gets their own preferences, allergies, safe foods, and progress tracking."
      },
      {
        question: "Can I plan different meals for different kids?",
        answer: "Yes, but we also help you find overlap - meals where you cook one base dish with simple modifications. This saves time and helps kids feel included."
      },
      {
        question: "What if my kids have different allergies?",
        answer: "Each child's profile includes their specific allergens. EatPal will never suggest foods containing a child's allergens and will flag recipes that need modification."
      }
    ],
    cta: {
      primary: "Plan for Your Family",
      secondary: "See Family Features"
    },
    relatedPages: ["kids-meal-planning", "grocery-lists", "nutrition-tracking"],
    aiMetadata: {
      purpose: "EatPal's Multi-Child Meal Planning helps families with multiple children who have different food preferences, allergies, or eating challenges. Create unified meal plans with built-in modifications for each child.",
      audience: "Parents with multiple children who have different dietary needs, families with both picky eaters and adventurous eaters, caregivers managing multiple food allergies across children",
      keyFeatures: "Unlimited child profiles, unified meal plans with per-child modifications, AI modification suggestions, individual progress tracking, combined grocery lists, family meal goal planning",
      useCases: "Planning one dinner that works for kids with different preferences, managing multiple food allergies, tracking each child's picky eating progress separately, creating efficient grocery lists for diverse family needs"
    }
  }
};

/**
 * Get SEO props for a feature or solution page
 */
export function getPageSEOProps(
  pageData: FeaturePageData | SolutionPageData,
  type: "feature" | "solution"
): SEOProps {
  const path = type === "feature"
    ? `/features/${pageData.slug}`
    : `/solutions/${pageData.slug}`;

  return {
    title: pageData.title,
    description: pageData.description,
    keywords: pageData.keywords,
    canonicalUrl: `${baseUrl}${path}`,
    ogImage: pageData.heroImage || `${baseUrl}/Cover.png`,
    ogImageAlt: pageData.headline,
    aiPurpose: pageData.aiMetadata.purpose,
    aiAudience: pageData.aiMetadata.audience,
    aiKeyFeatures: pageData.aiMetadata.keyFeatures,
    aiUseCases: pageData.aiMetadata.useCases,
  };
}

/**
 * Generate FAQ structured data for a page
 */
export function generateFAQStructuredData(faqs: Array<{ question: string; answer: string }>) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/**
 * Generate breadcrumb structured data
 */
export function generateBreadcrumbData(
  items: Array<{ name: string; url: string }>
) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Get all programmatic page paths for sitemap
 */
export function getAllProgrammaticPaths(): string[] {
  const featurePaths = Object.keys(featurePages).map(
    (slug) => `/features/${slug}`
  );
  const solutionPaths = Object.keys(solutionPages).map(
    (slug) => `/solutions/${slug}`
  );
  return [...featurePaths, ...solutionPaths];
}
