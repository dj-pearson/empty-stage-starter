import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StructuredDataItem {
  type: string;
  data: Record<string, unknown>;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

interface ValidationResult {
  url: string;
  hasStructuredData: boolean;
  totalItems: number;
  validItems: number;
  invalidItems: number;
  items: StructuredDataItem[];
  issues: Array<{ type: string; severity: string; message: string }>;
  overallScore: number;
}

// Common Schema.org required properties
const SCHEMA_REQUIREMENTS: Record<string, string[]> = {
  "Article": ["headline", "datePublished", "author"],
  "Recipe": ["name", "recipeIngredient", "recipeInstructions"],
  "Product": ["name", "description", "image"],
  "Organization": ["name", "url"],
  "Person": ["name"],
  "Event": ["name", "startDate", "location"],
  "LocalBusiness": ["name", "address"],
  "BreadcrumbList": ["itemListElement"],
  "FAQPage": ["mainEntity"],
  "HowTo": ["name", "step"],
  "VideoObject": ["name", "description", "thumbnailUrl", "uploadDate"],
  "Review": ["itemReviewed", "reviewRating", "author"],
  "AggregateRating": ["ratingValue", "reviewCount"],
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    console.log(`Validating structured data for ${url}...`);

    const result = await validateStructuredData(url);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save to database
    const { data: savedValidation, error: saveError } = await supabase
      .from("seo_structured_data")
      .insert({
        url: result.url,
        has_structured_data: result.hasStructuredData,
        total_items: result.totalItems,
        valid_items: result.validItems,
        invalid_items: result.invalidItems,
        overall_score: result.overallScore,
        structured_data_items: JSON.stringify(result.items),
        issues: JSON.stringify(result.issues),
        validated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save structured data validation:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          ...result,
          validationId: savedValidation?.id,
        },
        message: `Found ${result.totalItems} structured data items (${result.validItems} valid, ${result.invalidItems} invalid)`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in validate-structured-data:", error);
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

async function validateStructuredData(url: string): Promise<ValidationResult> {
  // Fetch the page
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SEO-Structured-Data-Validator/1.0",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status}`);
  }

  const html = await response.text();

  // Extract JSON-LD structured data
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const items: StructuredDataItem[] = [];
  const issues: Array<{ type: string; severity: string; message: string }> = [];
  let match;

  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const jsonContent = match[1].trim();
      const data = JSON.parse(jsonContent);

      // Handle both single items and arrays
      const dataItems = Array.isArray(data) ? data : [data];

      for (const item of dataItems) {
        const validated = validateSchemaItem(item);
        items.push(validated);
      }
    } catch (e) {
      issues.push({
        type: "json_parse_error",
        severity: "high",
        message: `Invalid JSON-LD: ${e.message}`,
      });
    }
  }

  // Check for microdata (basic check)
  const hasMicrodata = /<[^>]+itemscope[^>]*>/i.test(html);
  if (hasMicrodata) {
    issues.push({
      type: "microdata_detected",
      severity: "low",
      message: "Microdata detected - consider using JSON-LD instead for better compatibility",
    });
  }

  // Check for missing structured data
  if (items.length === 0 && !hasMicrodata) {
    issues.push({
      type: "no_structured_data",
      severity: "medium",
      message: "No structured data found - add Schema.org markup to improve search visibility",
    });
  }

  const validItems = items.filter((item) => item.isValid).length;
  const invalidItems = items.length - validItems;

  // Calculate overall score
  let overallScore = 0;
  if (items.length > 0) {
    overallScore = Math.round(
      items.reduce((sum, item) => sum + item.score, 0) / items.length
    );
  }

  return {
    url,
    hasStructuredData: items.length > 0 || hasMicrodata,
    totalItems: items.length,
    validItems,
    invalidItems,
    items,
    issues,
    overallScore,
  };
}

function validateSchemaItem(data: Record<string, unknown>): StructuredDataItem {
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // Check for @context
  if (!data["@context"]) {
    errors.push("Missing @context property");
    score -= 20;
  } else if (!data["@context"].toString().includes("schema.org")) {
    warnings.push("@context should reference schema.org");
    score -= 5;
  }

  // Check for @type
  if (!data["@type"]) {
    errors.push("Missing @type property");
    score -= 20;
  }

  const type = data["@type"] as string;

  // Validate required properties for common types
  if (type && SCHEMA_REQUIREMENTS[type]) {
    const requiredProps = SCHEMA_REQUIREMENTS[type];

    for (const prop of requiredProps) {
      if (!data[prop]) {
        errors.push(`Missing required property: ${prop}`);
        score -= 10;
      }
    }
  }

  // Check for recommended properties
  if (type === "Article") {
    if (!data["image"]) {
      warnings.push("Article should have an image property");
      score -= 5;
    }
    if (!data["dateModified"]) {
      warnings.push("Article should have dateModified");
      score -= 3;
    }
  }

  if (type === "Product") {
    if (!data["offers"]) {
      warnings.push("Product should have offers");
      score -= 5;
    }
    if (!data["aggregateRating"] && !data["review"]) {
      warnings.push("Product should have reviews or ratings");
      score -= 3;
    }
  }

  if (type === "Recipe") {
    if (!data["image"]) {
      warnings.push("Recipe should have an image");
      score -= 5;
    }
    if (!data["cookTime"] && !data["totalTime"]) {
      warnings.push("Recipe should have cook time or total time");
      score -= 3;
    }
  }

  if (type === "Organization" || type === "LocalBusiness") {
    if (!data["logo"]) {
      warnings.push(`${type} should have a logo`);
      score -= 5;
    }
  }

  // Validate nested objects
  if (type === "BreadcrumbList" && data["itemListElement"]) {
    const items = data["itemListElement"] as Array<Record<string, unknown>>;
    if (Array.isArray(items)) {
      items.forEach((item, index) => {
        if (!item["@type"] || item["@type"] !== "ListItem") {
          errors.push(`Breadcrumb item ${index + 1} missing @type: ListItem`);
          score -= 5;
        }
        if (!item["position"]) {
          errors.push(`Breadcrumb item ${index + 1} missing position`);
          score -= 5;
        }
        if (!item["name"] && !item["item"]) {
          errors.push(`Breadcrumb item ${index + 1} missing name or item`);
          score -= 5;
        }
      });
    }
  }

  // Check for common mistakes
  if (data["datePublished"]) {
    const dateStr = data["datePublished"] as string;
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      errors.push("datePublished should be in ISO 8601 format (YYYY-MM-DD)");
      score -= 5;
    }
  }

  if (data["url"]) {
    const urlStr = data["url"] as string;
    if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
      warnings.push("URL should be absolute (include http:// or https://)");
      score -= 3;
    }
  }

  score = Math.max(0, score);

  return {
    type: type || "Unknown",
    data,
    isValid: errors.length === 0,
    errors,
    warnings,
    score,
  };
}
