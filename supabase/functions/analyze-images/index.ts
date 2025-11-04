import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ImageAnalysis {
  src: string;
  alt: string | null;
  hasAlt: boolean;
  width: number | null;
  height: number | null;
  hasDimensions: boolean;
  fileSize: number | null;
  format: string | null;
  isOptimized: boolean;
  hasLazyLoading: boolean;
  issues: Array<{ type: string; severity: string; message: string }>;
}

interface ImageSummary {
  totalImages: number;
  imagesWithoutAlt: number;
  imagesWithoutDimensions: number;
  oversizedImages: number;
  unoptimizedFormats: number;
  totalSize: number;
  avgSize: number;
  lazyLoadedImages: number;
  issues: Array<{ type: string; severity: string; message: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, maxFileSize = 200000 } = await req.json(); // 200KB default

    if (!url) {
      throw new Error("URL is required");
    }

    console.log(`Analyzing images on ${url}...`);

    // Fetch the page HTML
    const response = await fetch(url, {
      headers: {
        "User-Agent": "SEO-Image-Analyzer/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const baseUrl = new URL(url);

    // Extract all images from HTML
    const imgRegex = /<img[^>]+>/gi;
    const imgMatches = html.match(imgRegex) || [];

    console.log(`Found ${imgMatches.length} images to analyze`);

    const imageAnalyses: ImageAnalysis[] = [];
    const allIssues: Array<{ type: string; severity: string; message: string }> = [];

    for (const imgTag of imgMatches) {
      const issues: Array<{ type: string; severity: string; message: string }> = [];

      // Extract src
      const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
      if (!srcMatch) {
        continue;
      }
      let src = srcMatch[1];

      // Convert relative URLs to absolute
      try {
        if (src.startsWith("//")) {
          src = `${baseUrl.protocol}${src}`;
        } else if (src.startsWith("/")) {
          src = `${baseUrl.origin}${src}`;
        } else if (!src.startsWith("http")) {
          src = new URL(src, url).href;
        }
      } catch (e) {
        console.warn(`Invalid image URL: ${src}`);
        continue;
      }

      // Extract alt text
      const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : null;
      const hasAlt = alt !== null && alt.trim() !== "";

      if (!hasAlt) {
        issues.push({
          type: "alt_text",
          severity: "high",
          message: `Missing or empty alt text: ${src}`,
        });
      }

      // Extract dimensions
      const widthMatch = imgTag.match(/width=["']?(\d+)["']?/i);
      const heightMatch = imgTag.match(/height=["']?(\d+)["']?/i);
      const width = widthMatch ? parseInt(widthMatch[1]) : null;
      const height = heightMatch ? parseInt(heightMatch[1]) : null;
      const hasDimensions = width !== null && height !== null;

      if (!hasDimensions) {
        issues.push({
          type: "dimensions",
          severity: "medium",
          message: `Missing width/height attributes: ${src}`,
        });
      }

      // Check lazy loading
      const hasLazyLoading = /loading=["']lazy["']/i.test(imgTag);

      if (!hasLazyLoading) {
        issues.push({
          type: "lazy_loading",
          severity: "low",
          message: `Consider adding lazy loading: ${src}`,
        });
      }

      // Fetch image metadata (HEAD request to check size and format)
      let fileSize: number | null = null;
      let format: string | null = null;
      let isOptimized = false;

      try {
        const imgResponse = await fetch(src, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });

        if (imgResponse.ok) {
          const contentLength = imgResponse.headers.get("content-length");
          const contentType = imgResponse.headers.get("content-type");

          if (contentLength) {
            fileSize = parseInt(contentLength);
          }

          if (contentType) {
            format = contentType.split("/")[1] || contentType;
          }

          // Check if format is optimized
          if (format) {
            isOptimized = format.includes("webp") || format.includes("avif");

            if (!isOptimized && (format.includes("jpeg") || format.includes("jpg") || format.includes("png"))) {
              issues.push({
                type: "format",
                severity: "medium",
                message: `Use modern format (WebP/AVIF) instead of ${format}: ${src}`,
              });
            }
          }

          // Check file size
          if (fileSize && fileSize > maxFileSize) {
            issues.push({
              type: "file_size",
              severity: fileSize > maxFileSize * 2 ? "high" : "medium",
              message: `Large file size (${Math.round(fileSize / 1024)}KB, recommend < ${Math.round(maxFileSize / 1024)}KB): ${src}`,
            });
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch image metadata for ${src}:`, e.message);
        issues.push({
          type: "fetch_error",
          severity: "low",
          message: `Could not fetch image: ${src}`,
        });
      }

      const analysis: ImageAnalysis = {
        src,
        alt,
        hasAlt,
        width,
        height,
        hasDimensions,
        fileSize,
        format,
        isOptimized,
        hasLazyLoading,
        issues,
      };

      imageAnalyses.push(analysis);
      allIssues.push(...issues);
    }

    // Calculate summary statistics
    const summary: ImageSummary = {
      totalImages: imageAnalyses.length,
      imagesWithoutAlt: imageAnalyses.filter((img) => !img.hasAlt).length,
      imagesWithoutDimensions: imageAnalyses.filter((img) => !img.hasDimensions).length,
      oversizedImages: imageAnalyses.filter(
        (img) => img.fileSize && img.fileSize > maxFileSize
      ).length,
      unoptimizedFormats: imageAnalyses.filter((img) => !img.isOptimized).length,
      totalSize: imageAnalyses.reduce((sum, img) => sum + (img.fileSize || 0), 0),
      avgSize: imageAnalyses.length > 0
        ? Math.round(
            imageAnalyses.reduce((sum, img) => sum + (img.fileSize || 0), 0) /
              imageAnalyses.length
          )
        : 0,
      lazyLoadedImages: imageAnalyses.filter((img) => img.hasLazyLoading).length,
      issues: allIssues,
    };

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save to database
    const { data: savedAnalysis, error: saveError } = await supabase
      .from("seo_image_analysis")
      .insert({
        url,
        total_images: summary.totalImages,
        images_without_alt: summary.imagesWithoutAlt,
        images_without_dimensions: summary.imagesWithoutDimensions,
        oversized_images: summary.oversizedImages,
        unoptimized_formats: summary.unoptimizedFormats,
        total_size: summary.totalSize,
        avg_size: summary.avgSize,
        lazy_loaded_images: summary.lazyLoadedImages,
        total_issues: summary.issues.length,
        image_details: JSON.stringify(imageAnalyses),
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) {
      console.error("Failed to save image analysis:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary,
          images: imageAnalyses.slice(0, 20), // Return first 20 for preview
          analysisId: savedAnalysis?.id,
        },
        message: `Analyzed ${summary.totalImages} images with ${summary.issues.length} total issues`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in analyze-images:", error);
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
