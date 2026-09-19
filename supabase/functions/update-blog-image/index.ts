import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { requireAdmin } from "../_shared/require-admin.ts";
import { fetchGuardedResource } from "../_shared/url-validator.ts";
import { publicMessage } from '../_shared/errors.ts';

/** Blog artwork. Generous, but not "stream me a DVD into memory". */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Admin/service only: mutates blog content and fetches arbitrary URLs (SSRF surface).
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error ?? 'Unauthorized' }), {
      status: gate.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    
    // Accept both camelCase and snake_case
    const blogId = body.blogId || body.blog_id;
    const imageUrl = body.imageUrl || body.image_url;
    const imageType = body.imageType || body.image_type || 'featured';

    if (!blogId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing blogId/blog_id or imageUrl/image_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // US-773: download under the SSRF guards, not a bare fetch().
    //
    // The comment on the admin gate above has said "fetches arbitrary URLs
    // (SSRF surface)" since it was written, and the line below it called the
    // global fetch on that URL directly, with no host validation, no redirect
    // re-validation and no size cap -- so an admin-supplied URL, or anything
    // that could reach this endpoint with an admin token, could point the
    // container at 169.254.169.254 or at a body large enough to exhaust it.
    // The guards existed the whole time, in the copy of this function under
    // functions/, which the server cannot load. Same shape as US-710.
    console.log('Downloading image from:', imageUrl);
    const fetched = await fetchGuardedResource(imageUrl, {
      headers: { Accept: 'image/*' },
      maxBytes: MAX_IMAGE_BYTES,
    });
    if (!fetched.ok) {
      return new Response(
        JSON.stringify({ error: fetched.error, max_bytes: MAX_IMAGE_BYTES }),
        { status: fetched.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const imageBuffer = fetched.bytes;

    // Generate unique filename. US-627: blog artwork lives in the
    // generated-images bucket, which is deliberately world-readable. It used to
    // be written into profile-pictures alongside photographs of children, which
    // is the wrong blast radius for a public asset. Existing blog rows still
    // point at the old profile-pictures URLs and keep resolving; only new
    // uploads land here.
    const timestamp = Date.now();
    const extension = imageUrl.split('.').pop()?.split('?')[0] || 'png';
    const filename = `blog/${blogId}-${imageType}-${timestamp}.${extension}`;

    // Upload to Supabase Storage
    console.log('Uploading image to storage:', filename);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(filename, imageBuffer, {
        contentType: fetched.contentType || 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(filename);

    // Update blog post with image URL
    const updateField = imageType === 'featured' ? 'featured_image_url' : 'og_image_url';
    console.log(`Updating blog post ${blogId} ${updateField} with:`, publicUrl);

    const { error: updateError } = await supabase
      .from('blog_posts')
      .update({ [updateField]: publicUrl })
      .eq('id', blogId);

    if (updateError) {
      console.error('Blog update error:', updateError);
      throw updateError;
    }

    console.log('Successfully updated blog post with image');

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: publicUrl,
        field: updateField
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Error in update-blog-image:', error);
    return new Response(
      JSON.stringify({ error: publicMessage(error) }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}
