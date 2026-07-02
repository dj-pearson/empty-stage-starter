import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildPromptFromContext,
  generateAndStoreImage,
  type ImageSource,
} from '../_shared/image-gen.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateImageBody {
  source?: ImageSource;
  recordId?: string;
  record_id?: string;
  prompt?: string;
  imageType?: 'featured' | 'og';
  image_type?: 'featured' | 'og';
  size?: string;
  autoApply?: boolean;
  webhookUrl?: string;
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = (await req.json()) as GenerateImageBody;

    const source: ImageSource = body.source || 'manual';
    const recordId = body.recordId || body.record_id || null;
    const imageType = body.imageType || body.image_type || 'featured';
    const size = body.size || '1024x1024';
    const autoApply = body.autoApply ?? false;
    const webhookUrl = body.webhookUrl;

    const openaiKey = Deno.env.get('OPENAI_GLOBAL_API');
    if (!openaiKey) {
      return json({ error: 'OPENAI_GLOBAL_API is not configured' }, 500);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── Resolve the prompt ────────────────────────────────────────────────
    let prompt = body.prompt?.trim();
    let recordTitle: string | undefined;

    if (!prompt && recordId && (source === 'blog' || source === 'social')) {
      // blog_posts has `excerpt`; social_posts does not — select per source.
      const table = source === 'blog' ? 'blog_posts' : 'social_posts';
      const columns = source === 'blog' ? 'title, excerpt' : 'title, content';
      const { data: record } = await supabase
        .from(table)
        .select(columns)
        .eq('id', recordId)
        .maybeSingle();
      const rec = record as { title?: string; excerpt?: string; content?: string } | null;
      recordTitle = rec?.title;
      prompt = buildPromptFromContext({
        title: rec?.title,
        excerpt: rec?.excerpt ?? rec?.content,
        source,
      });
    }

    if (!prompt) prompt = buildPromptFromContext({ source });

    // ─── Generate + store ──────────────────────────────────────────────────
    let result;
    try {
      result = await generateAndStoreImage(supabase, {
        prompt,
        source,
        recordId,
        imageType,
        size,
        openaiKey,
        track: true,
      });
    } catch (genErr: any) {
      console.error('generateAndStoreImage error:', genErr);
      return json({ error: genErr?.message || 'Image generation failed' }, 502);
    }

    const publicUrl = result.imageUrl;

    // ─── Apply to the source record (optional) ─────────────────────────────
    let appliedField: string | null = null;
    if (autoApply && recordId) {
      if (source === 'blog') {
        const updateField = imageType === 'og' ? 'og_image_url' : 'featured_image_url';
        const { error: updateError } = await supabase
          .from('blog_posts')
          .update({ [updateField]: publicUrl })
          .eq('id', recordId);
        if (updateError) {
          console.error('blog_posts update error:', updateError);
        } else {
          appliedField = updateField;
        }
      } else if (source === 'social') {
        const { error: updateError } = await supabase
          .from('social_posts')
          .update({ image_urls: [publicUrl] })
          .eq('id', recordId);
        if (updateError) {
          console.error('social_posts update error:', updateError);
        } else {
          appliedField = 'image_urls';
        }
      }
    }

    // ─── Forward to webhook (optional) ─────────────────────────────────────
    if (webhookUrl) {
      try {
        const wh = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'image_generated',
            source,
            record_id: recordId,
            title: recordTitle || null,
            image_url: publicUrl,
            image_type: imageType,
            generated_at: new Date().toISOString(),
          }),
        });
        console.log('image webhook status:', wh.status);
      } catch (webhookErr) {
        console.error('image webhook error (non-fatal):', webhookErr);
      }
    }

    return json({
      success: true,
      imageUrl: publicUrl,
      storagePath: result.storagePath,
      prompt,
      model: result.model,
      appliedField,
    });
  } catch (error: any) {
    console.error('Error in generate-image:', error);
    return json({ error: error?.message || 'Unknown error occurred' }, 500);
  }
};
