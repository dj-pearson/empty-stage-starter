/**
 * Update Blog Image Edge Function
 *
 * Updates a blog post's featured image by uploading to Supabase Storage
 * and updating the blog post record.
 *
 * POST /update-blog-image
 * Body: {
 *   "blog_post_id": "uuid",
 *   "image_url": "https://..." (external URL to fetch and store)
 * }
 * Auth: JWT required (Authorization: Bearer <token>)
 *
 * Response (200):
 * {
 *   "blog_post_id": "uuid",
 *   "image_urls": {
 *     "original": "https://storage.../original.webp",
 *     "thumbnail": "https://storage.../thumbnail.webp",
 *     "medium": "https://storage.../medium.webp",
 *     "large": "https://storage.../large.webp"
 *   }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';
import { validateUrl } from '../_shared/url-validator.ts';
import { authenticateRequest } from '../_shared/auth.ts';

const STORAGE_BUCKET = 'blog-images';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  // Authenticate request
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const body = await req.json();
    const { blog_post_id, image_url } = body;

    if (!blog_post_id || typeof blog_post_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'blog_post_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    if (!image_url || typeof image_url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'image_url is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Validate URL (SSRF protection)
    const urlValidation = validateUrl(image_url);
    if (!urlValidation.valid) {
      return new Response(
        JSON.stringify({ error: urlValidation.error }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch the image
    const imageResponse = await fetch(image_url);
    if (!imageResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch image: HTTP ${imageResponse.status}` }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg';
    const imageBuffer = await imageResponse.arrayBuffer();

    // Determine file extension
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
    };
    const ext = extMap[contentType] ?? 'jpg';

    const timestamp = Date.now();
    const basePath = `${blog_post_id}/${timestamp}`;

    // Upload original image
    const originalPath = `${basePath}/original.${ext}`;
    const { error: uploadError } = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(originalPath, imageBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Get public URL for the original
    const { data: publicUrlData } = supabaseClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(originalPath);

    const originalPublicUrl = publicUrlData.publicUrl;

    // For optimized versions, in production you'd use an image processing service.
    // Here we store references that can be processed by a separate pipeline.
    const imageUrls = {
      original: originalPublicUrl,
      thumbnail: `${originalPublicUrl}?width=150&height=150`,
      medium: `${originalPublicUrl}?width=600&height=400`,
      large: `${originalPublicUrl}?width=1200&height=800`,
    };

    // Update the blog post record with new image URLs
    const { error: updateError } = await supabaseClient
      .from('blog_posts')
      .update({
        featured_image: originalPublicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', blog_post_id);

    if (updateError) {
      console.error('Blog post update error:', updateError);
      // Image was uploaded successfully, just the DB update failed
      return new Response(
        JSON.stringify({
          blog_post_id,
          image_urls: imageUrls,
          warning: 'Image uploaded but blog post record update failed',
        }),
        { status: 207, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ blog_post_id, image_urls: imageUrls }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('update-blog-image error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
