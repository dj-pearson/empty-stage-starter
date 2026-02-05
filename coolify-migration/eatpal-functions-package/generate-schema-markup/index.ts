import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SchemaMarkup {
  article: any;
  breadcrumb?: any;
  faq?: any;
  howTo?: any;
  organization: any;
}

function generateArticleSchema(post: any, author: any, siteUrl: string): any {
  const articleUrl = `${siteUrl}/blog/${post.slug}`;
  const imageUrl = post.featured_image_url || `${siteUrl}/Cover.png`;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || post.meta_description || "",
    image: imageUrl,
    url: articleUrl,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: author
      ? {
          "@type": "Person",
          name: author.display_name || "EatPal Team",
          url: author.social_links?.website || siteUrl,
        }
      : {
          "@type": "Organization",
          name: "EatPal",
          url: siteUrl,
        },
    publisher: {
      "@type": "Organization",
      name: "EatPal",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/Logo-Green.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
    keywords: post.meta_keywords || "",
    articleSection: post.category?.name || "Parenting",
    ...(post.reading_time_minutes && {
      timeRequired: `PT${post.reading_time_minutes}M`,
    }),
  };
}

function generateBreadcrumbSchema(
  post: any,
  category: any,
  siteUrl: string
): any {
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: siteUrl,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Blog",
      item: `${siteUrl}/blog`,
    },
  ];

  if (category) {
    items.push({
      "@type": "ListItem",
      position: 3,
      name: category.name,
      item: `${siteUrl}/blog/category/${category.slug}`,
    });
    items.push({
      "@type": "ListItem",
      position: 4,
      name: post.title,
      item: `${siteUrl}/blog/${post.slug}`,
    });
  } else {
    items.push({
      "@type": "ListItem",
      position: 3,
      name: post.title,
      item: `${siteUrl}/blog/${post.slug}`,
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

function extractFAQs(content: string): any | null {
  // Look for FAQ patterns in content
  const faqPattern = /<h[23][^>]*>.*?(?:what|how|why|when|where|who|can|should|is|are).*?<\/h[23]>/gi;
  const headers = content.match(faqPattern);

  if (!headers || headers.length < 2) return null;

  const faqs: Array<{ question: string; answer: string }> = [];

  // Extract Q&A pairs
  const sections = content.split(faqPattern);
  headers.forEach((header, index) => {
    const question = header.replace(/<[^>]+>/g, "").trim();
    let answer = "";

    if (sections[index + 1]) {
      // Get text until next header or end
      const nextSection = sections[index + 1];
      const nextHeaderIndex = nextSection.search(/<h[23][^>]*>/i);
      answer =
        nextHeaderIndex > -1
          ? nextSection.substring(0, nextHeaderIndex)
          : nextSection;

      // Clean up HTML and get first paragraph
      answer = answer
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 500);

      if (answer.length > 50) {
        faqs.push({ question, answer });
      }
    }
  });

  if (faqs.length < 2) return null;

  return {
    "@context": "https://schema.org",
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

function extractHowTo(content: string, title: string): any | null {
  // Check if this looks like a how-to article
  if (!/how\s+to|step(?:s)?|guide|tutorial/i.test(title)) return null;

  // Look for numbered steps or step headers
  const stepPattern = /<(?:h[23]|li)[^>]*>(?:step\s+)?(\d+)[.:)]\s*(.+?)<\/(?:h[23]|li)>/gi;
  const steps: string[] = [];
  let match;

  while ((match = stepPattern.exec(content)) !== null) {
    steps.push(match[2].replace(/<[^>]+>/g, "").trim());
  }

  // Alternative: look for ordered lists
  if (steps.length < 2) {
    const listPattern = /<ol[^>]*>(.*?)<\/ol>/gis;
    const listMatch = content.match(listPattern);

    if (listMatch) {
      const liPattern = /<li[^>]*>(.*?)<\/li>/gi;
      let liMatch;

      while ((liMatch = liPattern.exec(listMatch[0])) !== null) {
        const stepText = liMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (stepText.length > 10) {
          steps.push(stepText);
        }
      }
    }
  }

  if (steps.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: title,
    step: steps.map((stepText, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: `Step ${index + 1}`,
      text: stepText.substring(0, 500),
    })),
  };
}

function generateOrganizationSchema(siteUrl: string): any {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "EatPal",
    url: siteUrl,
    logo: `${siteUrl}/Logo-Green.png`,
    description:
      "Making meal planning simple and stress-free for families with picky eaters",
    sameAs: [
      // Add social media URLs
      "https://facebook.com/tryeatpal",
      "https://twitter.com/tryeatpal",
      "https://instagram.com/tryeatpal",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: "Support@TryEatPal.com",
      contactType: "Customer Support",
    },
  };
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { post_id, site_url = "https://tryeatpal.com" } = await req.json();

    if (!post_id) {
      return new Response(JSON.stringify({ error: "post_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the blog post with related data
    const { data: post, error: postError } = await supabase
      .from("blog_posts")
      .select(
        `
        *,
        category:blog_categories(name, slug),
        author:blog_authors(display_name, social_links)
      `
      )
      .eq("id", post_id)
      .single();

    if (postError || !post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate all schema types
    const schemas: SchemaMarkup = {
      article: generateArticleSchema(post, post.author, site_url),
      organization: generateOrganizationSchema(site_url),
    };

    // Add breadcrumb schema
    if (post.category) {
      schemas.breadcrumb = generateBreadcrumbSchema(
        post,
        post.category,
        site_url
      );
    }

    // Try to extract FAQ schema
    const faqSchema = extractFAQs(post.content);
    if (faqSchema) {
      schemas.faq = faqSchema;
    }

    // Try to extract HowTo schema
    const howToSchema = extractHowTo(post.content, post.title);
    if (howToSchema) {
      schemas.howTo = howToSchema;
    }

    // Generate combined schema markup
    const schemaMarkup = Object.values(schemas)
      .map((schema) => JSON.stringify(schema, null, 2))
      .join("\n\n");

    return new Response(
      JSON.stringify({
        success: true,
        schemas,
        markup: schemaMarkup,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error generating schema markup:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
