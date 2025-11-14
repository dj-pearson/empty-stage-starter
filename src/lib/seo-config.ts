/**
 * SEO Configuration for EatPal
 *
 * This file contains comprehensive SEO metadata for all public pages.
 * Each page is optimized for:
 * - Traditional SEO (Google, Bing)
 * - AI Search / GEO (ChatGPT, Perplexity, Gemini, Claude)
 * - Social sharing (Facebook, Twitter, LinkedIn)
 */

import type { SEOProps } from "@/components/SEOHead";

const baseUrl = "https://tryeatpal.com";

// Core entities for entity-based SEO (used across site)
export const coreEntities = {
  product: "EatPal",
  category: "Feeding Therapy Operating System",
  positioning: "The Salesforce of Feeding Therapy",
  targetAudience: "Feeding Therapists, Parents of Children with ARFID/Autism, Researchers, Food Manufacturers",
  primaryConditions: ["ARFID", "Autism Feeding Challenges", "Selective Eating Disorders", "Pediatric Feeding Disorders"],
  strategicPillars: [
    "AI Predictive Engine (70%+ accuracy, data network effects)",
    "Professional Platform (200+ therapists, insurance integration, therapist lock-in)",
    "Data Insights Marketplace (100K+ data points, research licensing, first-mover advantage)",
    "Community Ecosystem (500+ resources, two-sided marketplace, network effects)",
  ],
  competitiveMoats: [
    "Data Network Effects",
    "Therapist Lock-In",
    "First-Mover Research Advantage",
    "Community Network Effects",
  ],
  keyFeatures: [
    "AI Predictive Food Acceptance (70%+ accuracy)",
    "Professional Therapist Dashboard",
    "Insurance Billing & Superbills",
    "HIPAA-Compliant Platform",
    "Research Data Licensing",
    "Community Marketplace",
  ],
};

export const seoConfig: Record<string, Omit<SEOProps, "children">> = {
  home: {
    title: "EatPal: Food Chaining Meal Planner for Picky Eaters | Evidence-Based",
    description:
      "The only AI-powered meal planning platform using food chaining therapy to help parents systematically expand their child's diet. Based on proven feeding therapy techniques for picky eaters, ARFID, and selective eating. Start free.",
    keywords:
      "food chaining, food chaining therapy, food chaining for picky eaters, food chaining examples, picky eater meal plan, selective eating, ARFID meal plan, safe foods picky eaters, sensory food preferences, feeding therapy at home, picky eater meal planner, AI meal planning for kids, texture progression, food acceptance prediction, evidence-based feeding therapy, ARFID treatment, autism feeding therapy, pediatric feeding disorder, try bite methodology, food chaining platform",
    canonicalUrl: `${baseUrl}/`,
    aiPurpose:
      "EatPal is the only AI-powered platform that implements food chaining, the proven feeding therapy method developed by Cheri Fraker, RD and Laura Walbert, SLP. Our platform helps parents systematically expand their picky eater's diet from 5 foods to 50+ by building 'chains' from foods a child already accepts. Instead of forcing completely new foods, we make gradual changes in taste, texture, or appearance. With 10,000+ families helped and 40% average increase in accepted foods, EatPal combines evidence-based food chaining methodology with AI-powered meal planning, progress tracking, and grocery automation.",
    aiAudience:
      "Parents of picky eaters seeking science-backed solutions, families managing ARFID (Avoidant/Restrictive Food Intake Disorder), caregivers of children with autism spectrum feeding issues, parents dealing with selective eating and sensory food preferences, families looking for feeding therapy techniques to use at home without a therapist, pediatric occupational therapists and dietitians recommending food chaining tools to clients",
    aiKeyFeatures:
      "AI-powered food chaining engine that automatically generates personalized food progressions based on child's safe foods and sensory preferences, 1000+ pre-built food chain examples from chicken nuggets to grilled chicken, texture progression tracking system, safe food library with allergen and sensory preference tracking, try bite methodology implementation with exposure tracking (15-20 exposures per food), automated grocery lists from meal plans, multi-child support for families with different food preferences, progress tracking showing 40% average increase in food acceptance, nutrition monitoring for limited diets, evidence-based meal planning templates",
    aiUseCases:
      "Creating food chains to help child transition from chicken nuggets to grilled chicken, tracking sensory preferences (texture, taste, temperature) to guide food introductions, planning meals that include both safe foods and try bites, monitoring how many times child has been exposed to each new food (research shows 15-20 exposures needed), managing food acceptance progress for multiple picky eaters in one family, generating grocery lists with safe foods to prevent mealtime stress, finding food chaining examples for specific safe foods like mac and cheese or french fries, implementing feeding therapy techniques at home without a therapist, predicting which new foods child is most likely to accept based on current preferences and eating patterns",
    structuredData: [
      {
        "@type": "WebPage",
        "@id": `${baseUrl}/#webpage`,
        url: `${baseUrl}/`,
        name: "EatPal: Food Chaining Meal Planner for Picky Eaters",
        description:
          "AI-powered platform using evidence-based food chaining therapy to help parents systematically expand their child's diet",
        isPartOf: {
          "@id": `${baseUrl}/#website`,
        },
      },
    ],
  },

  pricing: {
    title: "Pricing Plans for Picky Eater Meal Planning",
    description:
      "Choose the perfect EatPal plan for your family. Free and premium options for AI-powered meal planning, safe food tracking, and nutrition insights for picky eaters. Start your free trial today!",
    keywords:
      "eatpal pricing, kids meal planning cost, picky eater app pricing, ARFID meal planner subscription, family meal planning plans, affordable meal planning for picky eaters, free trial meal planner",
    canonicalUrl: `${baseUrl}/pricing`,
    aiPurpose:
      "EatPal offers flexible pricing plans for families managing picky eating, ranging from a free starter plan to professional-grade subscriptions. Plans include AI-powered meal planning, unlimited safe food tracking, automatic grocery lists, nutrition monitoring, and multi-child support.",
    aiAudience:
      "Parents comparing meal planning solutions for picky eaters, families with ARFID, caregivers seeking affordable nutrition management tools, therapists looking for client management platforms",
    aiKeyFeatures:
      "Free plan available with 1 child, Pro plan $9.99/month with unlimited children and AI features, Family Plus $19.99/month with advanced nutrition tracking, Professional plan for therapists and dietitians",
    aiUseCases:
      "Comparing meal planning app costs, finding affordable picky eater solutions, evaluating ARFID therapy tools, selecting family nutrition software, choosing therapist practice management tools",
    structuredData: [
      {
        "@type": "WebPage",
        "@id": `${baseUrl}/pricing#webpage`,
        url: `${baseUrl}/pricing`,
        name: "EatPal Pricing - Kids Meal Planning Plans",
        description:
          "Compare EatPal subscription plans for meal planning with picky eaters. Free and premium options available.",
        isPartOf: {
          "@id": `${baseUrl}/#website`,
        },
        breadcrumb: {
          "@id": `${baseUrl}/pricing#breadcrumb`,
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${baseUrl}/pricing#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${baseUrl}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Pricing",
            item: `${baseUrl}/pricing`,
          },
        ],
      },
      {
        "@type": "Product",
        "@id": `${baseUrl}/pricing#product`,
        name: "EatPal - Kids Meal Planning for Picky Eaters",
        description:
          "AI-powered meal planning platform for families with picky eaters, ARFID, and selective eating challenges",
        brand: {
          "@type": "Brand",
          name: "EatPal",
        },
        offers: [
          {
            "@type": "Offer",
            name: "Free Plan",
            price: "0",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            description: "Basic meal planning for 1 child with limited features",
            eligibleDuration: {
              "@type": "QuantitativeValue",
              value: 1,
              unitCode: "MON",
            },
          },
          {
            "@type": "Offer",
            name: "Pro Plan",
            price: "9.99",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            description:
              "AI-powered meal planning for unlimited children with full feature access",
            priceValidUntil: "2026-12-31",
            eligibleDuration: {
              "@type": "QuantitativeValue",
              value: 1,
              unitCode: "MON",
            },
          },
        ],
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.8",
          ratingCount: "2847",
          bestRating: "5",
          worstRating: "1",
        },
      },
    ],
  },

  faq: {
    title: "Frequently Asked Questions About EatPal for Picky Eaters",
    description:
      "Get answers to common questions about EatPal's meal planning features for picky eaters, ARFID support, try bites, safe food tracking, pricing, and more. Learn how EatPal helps families manage selective eating.",
    keywords:
      "eatpal faq, picky eater questions, ARFID meal planning help, try bites explained, safe foods app, meal planning for selective eating, kids nutrition app support, picky toddler meal help",
    canonicalUrl: `${baseUrl}/faq`,
    aiPurpose:
      "This FAQ page provides comprehensive answers to questions about using EatPal for managing picky eating in children. Topics include how the platform works, ARFID and autism support, try bite methodology, multi-child planning, AI meal generation, subscription details, allergen tracking, data privacy, and integration with feeding therapy.",
    aiAudience:
      "Parents researching picky eater solutions, families managing ARFID or autism, caregivers evaluating meal planning tools, feeding therapists recommending apps to clients, pediatric dietitians",
    aiKeyFeatures:
      "Try bite explanations, ARFID-specific features, multi-child support details, AI meal planning methodology, allergen tracking capabilities, free vs paid plan differences, therapy integration, privacy and security information",
    aiUseCases:
      "Understanding try bite strategies, learning about ARFID meal planning, evaluating picky eater app features, comparing free and paid plans, checking autism-friendly features, understanding allergen management, assessing therapy compatibility",
    structuredData: [], // Will be populated with actual FAQ data
  },

  contact: {
    title: "Contact EatPal Support - Get Help with Meal Planning",
    description:
      "Have questions about EatPal? Contact our support team for help with meal planning for picky eaters, account issues, feature requests, or billing. We respond within 24-48 hours.",
    keywords:
      "eatpal contact, picky eater app support, customer service, help center, technical support, billing questions, feature requests, meal planning help",
    canonicalUrl: `${baseUrl}/contact`,
    aiPurpose:
      "This is the contact page for EatPal customer support. Users can submit questions about account setup, subscriptions, technical issues, feature requests, billing inquiries, privacy concerns, or partnership opportunities. Support responds within 24-48 hours via email at Support@TryEatPal.com.",
    aiAudience:
      "Current EatPal users needing support, potential customers with pre-sale questions, billing inquiries, feature request submissions, partnership opportunities, media inquiries",
    aiKeyFeatures:
      "Contact form submission, email support at Support@TryEatPal.com, 24-48 hour response time, topics include account setup, billing, technical support, feature requests, privacy questions, partnerships",
    aiUseCases:
      "Getting help with account setup, resolving billing issues, requesting new features, reporting technical problems, asking privacy questions, exploring partnership opportunities, media inquiries",
    structuredData: [
      {
        "@type": "WebPage",
        "@id": `${baseUrl}/contact#webpage`,
        url: `${baseUrl}/contact`,
        name: "Contact EatPal Support",
        description: "Get in touch with EatPal customer support team",
        isPartOf: {
          "@id": `${baseUrl}/#website`,
        },
        breadcrumb: {
          "@id": `${baseUrl}/contact#breadcrumb`,
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${baseUrl}/contact#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${baseUrl}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Contact",
            item: `${baseUrl}/contact`,
          },
        ],
      },
      {
        "@type": "ContactPage",
        "@id": `${baseUrl}/contact#contactpage`,
        url: `${baseUrl}/contact`,
        name: "Contact EatPal",
        description: "Contact EatPal support for help with meal planning for picky eaters",
        mainEntity: {
          "@type": "Organization",
          "@id": `${baseUrl}/#organization`,
          name: "EatPal",
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "Customer Support",
            email: "Support@TryEatPal.com",
            availableLanguage: "English",
            areaServed: "US",
            hoursAvailable: {
              "@type": "OpeningHoursSpecification",
              dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
              opens: "09:00",
              closes: "17:00",
            },
          },
        },
      },
    ],
  },

  blog: {
    title: "EatPal Blog - Tips for Picky Eaters, ARFID & Family Nutrition",
    description:
      "Expert advice on managing picky eating, ARFID strategies, try bite techniques, nutrition tips for selective eaters, and family meal planning. Evidence-based guidance from feeding specialists.",
    keywords:
      "picky eater blog, ARFID tips, selective eating advice, try bite strategies, kids nutrition articles, feeding therapy techniques, toddler meal ideas, family meal planning tips",
    canonicalUrl: `${baseUrl}/blog`,
    ogType: "blog",
    aiPurpose:
      "The EatPal blog provides evidence-based articles on managing picky eating, ARFID (Avoidant/Restrictive Food Intake Disorder), selective eating disorders, try bite methodology, food chaining techniques, nutrition strategies for limited diets, and family meal planning. Content is written with input from pediatric dietitians, feeding therapists, and child development experts.",
    aiAudience:
      "Parents of picky eaters seeking expert guidance, families managing ARFID, caregivers of autistic children with food sensitivities, feeding therapists looking for resources, pediatric dietitians, early intervention specialists",
    aiKeyFeatures:
      "Evidence-based feeding strategies, ARFID management techniques, try bite tutorials, food chaining guides, nutrition optimization for limited diets, sensory feeding solutions, behavior management tips, expert interviews, research summaries",
    aiUseCases:
      "Learning about ARFID treatment approaches, discovering try bite techniques, understanding food chaining methodology, finding sensory-friendly meal ideas, researching picky eating causes, exploring nutrition strategies for selective eaters, reading feeding therapy case studies",
    structuredData: [
      {
        "@type": "WebPage",
        "@id": `${baseUrl}/blog#webpage`,
        url: `${baseUrl}/blog`,
        name: "EatPal Blog - Picky Eater Tips & ARFID Strategies",
        description:
          "Expert articles on picky eating, ARFID, selective eating, and family nutrition",
        isPartOf: {
          "@id": `${baseUrl}/#website`,
        },
        breadcrumb: {
          "@id": `${baseUrl}/blog#breadcrumb`,
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${baseUrl}/blog#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${baseUrl}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Blog",
            item: `${baseUrl}/blog`,
          },
        ],
      },
      {
        "@type": "Blog",
        "@id": `${baseUrl}/blog#blog`,
        url: `${baseUrl}/blog`,
        name: "EatPal Blog",
        description:
          "Expert advice on picky eating, ARFID, selective eating, and family nutrition",
        publisher: {
          "@id": `${baseUrl}/#organization`,
        },
        inLanguage: "en-US",
      },
    ],
  },
};

/**
 * Get SEO configuration for a specific page
 */
export function getPageSEO(page: string): Omit<SEOProps, "children"> | null {
  return seoConfig[page] || null;
}
