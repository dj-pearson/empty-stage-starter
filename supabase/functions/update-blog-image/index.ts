import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // Download the image from the URL
    console.log('Downloading image from:', imageUrl);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.statusText}`);
    }

    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();

    // Generate unique filename
    const timestamp = Date.now();
    const extension = imageUrl.split('.').pop()?.split('?')[0] || 'png';
    const filename = `blog/${blogId}-${imageType}-${timestamp}.${extension}`;

    // Upload to Supabase Storage
    console.log('Uploading image to storage:', filename);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('profile-pictures')
      .upload(filename, imageBuffer, {
        contentType: imageBlob.type || 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('profile-pictures')
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
      JSON.stringify({ error: error?.message || 'Unknown error occurred' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
