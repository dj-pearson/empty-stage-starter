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
import { safeFetch, readCappedBody } from '../_shared/url-validator.ts';
import { authenticateRequest } from '../_shared/auth.ts';
import { assertAdmin } from '../_shared/admin.ts';

const STORAGE_BUCKET = 'blog-images';
/** Cap the fetched hero image so a single request can't exhaust memory/storage. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  // Authenticate request
  const auth = await authenticateRequest(req);
  if (auth.error) return auth.error;
  const user = auth.user;

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Admin-only: this uses the service role to overwrite blog hero images,
    // which bypasses RLS. A non-admin authenticated user must not reach it.
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const notAdmin = await assertAdmin(anonClient, user.id, corsHeaders);
    if (notAdmin) return notAdmin;

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

    // Verify the target post exists (admin-editable scope) before doing any
    // work, so we never upload orphan storage for a non-existent id.
    const { data: existingPost, error: lookupError } = await supabaseClient
      .from('blog_posts')
      .select('id')
      .eq('id', blog_post_id)
      .maybeSingle();
    if (lookupError) {
      console.error('Blog post lookup error:', lookupError);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }
    if (!existingPost) {
      return new Response(
        JSON.stringify({ error: 'Blog post not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch the image with SSRF protection (DNS-resolving validation on every
    // hop, manual redirects re-validated, timeout).
    const fetchResult = await safeFetch(image_url, {
      headers: { Accept: 'image/*' },
    });
    if (!fetchResult.valid || !fetchResult.response) {
      return new Response(
        JSON.stringify({ error: fetchResult.error ?? 'Invalid image URL' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }
    const imageResponse = fetchResult.response;
    if (!imageResponse.ok) {
      await imageResponse.body?.cancel().catch(() => {});
      return new Response(
        JSON.stringify({ error: `Failed to fetch image: HTTP ${imageResponse.status}` }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg';

    // Cap the downloaded body size before buffering it.
    const capped = await readCappedBody(imageResponse, MAX_IMAGE_BYTES);
    if (!capped.ok) {
      return new Response(
        JSON.stringify({ error: capped.error, max_bytes: MAX_IMAGE_BYTES }),
        { status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }
    const imageBuffer = capped.bytes;

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
