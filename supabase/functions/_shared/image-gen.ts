// Shared image-generation core: generate via OpenAI → store in Supabase Storage
// → return a public URL. Used by the `generate-image` edge function and inline by
// the content generators (generate-blog-content / generate-social-content).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const GENERATED_IMAGES_BUCKET = 'generated-images';
const OPENAI_IMAGE_URL = 'https://api.openai.com/v1/images/generations';

export type ImageSource = 'blog' | 'social' | 'manual';

export interface BuildPromptOpts {
  title?: string;
  excerpt?: string;
  source: ImageSource;
}

/**
 * Builds an image prompt from a record when the caller doesn't supply one.
 * Keeps EatPal's calm, clinical-but-warm visual direction (see prd_image.md):
 * soft teal/peach palette, no text in the image, real-family warmth.
 */
export function buildPromptFromContext(opts: BuildPromptOpts): string {
  const subject =
    opts.title?.trim() ||
    opts.excerpt?.trim() ||
    'a calm family mealtime supporting a child with selective eating';

  const orientation =
    opts.source === 'social'
      ? 'square social-media composition'
      : 'wide editorial header composition';

  return [
    `Editorial illustration for an article titled "${subject}".`,
    'Subject: warm, hopeful family-and-food scene relevant to feeding therapy, food chaining, and picky/ARFID eating.',
    'Style: soft, modern flat illustration with gentle gradients; calm and reassuring, never clinical or sterile.',
    'Palette: soft teal (#008C8C), warm peach/coral accents, off-white background. At most 3-4 colors.',
    `Composition: ${orientation}, clean negative space, breathable layout.`,
    'Absolutely no text, no words, no letters, no logos, no watermarks in the image.',
    'High quality, professional, friendly, suitable for a parenting + healthcare brand.',
  ].join(' ');
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface GenerateAndStoreOpts {
  prompt: string;
  source: ImageSource;
  recordId?: string | null;
  imageType?: 'featured' | 'og';
  size?: string;
  openaiKey: string;
  model?: string;
  /** Insert a row into generated_images for history/cost tracking. */
  track?: boolean;
}

export interface GenerateAndStoreResult {
  imageUrl: string;
  storagePath: string;
  model: string;
  size: string;
}

/**
 * Generate an image and persist it. Throws on hard failures (bad provider
 * response, upload error) so callers can decide how to surface them.
 */
export async function generateAndStoreImage(
  supabase: SupabaseClient,
  opts: GenerateAndStoreOpts
): Promise<GenerateAndStoreResult> {
  const model = opts.model || Deno.env.get('IMAGE_GEN_MODEL') || 'gpt-image-1';
  const size = opts.size || '1024x1024';
  const imageType = opts.imageType || 'featured';

  // gpt-image-1 always returns base64 (no response_format param accepted);
  // dall-e-3 returns a URL unless response_format=b64_json is requested.
  const payload: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    n: 1,
    size,
  };
  if (model.startsWith('dall-e')) payload.response_format = 'b64_json';

  const aiResp = await fetch(OPENAI_IMAGE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    throw new Error(`Image generation failed (${aiResp.status}): ${errText}`);
  }

  const aiData = await aiResp.json();
  const first = aiData?.data?.[0];

  let bytes: Uint8Array;
  if (first?.b64_json) {
    bytes = base64ToBytes(first.b64_json);
  } else if (first?.url) {
    const dl = await fetch(first.url);
    bytes = new Uint8Array(await dl.arrayBuffer());
  } else {
    throw new Error('No image returned by provider');
  }

  const timestamp = Date.now();
  const idPart = opts.recordId || 'adhoc';
  const storagePath = `${opts.source}/${idPart}-${imageType}-${timestamp}.png`;

  const { error: uploadError } = await supabase.storage
    .from(GENERATED_IMAGES_BUCKET)
    .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(GENERATED_IMAGES_BUCKET).getPublicUrl(storagePath);

  if (opts.track) {
    try {
      await supabase.from('generated_images').insert([
        {
          source: opts.source,
          record_id: opts.recordId ?? null,
          image_url: publicUrl,
          storage_path: storagePath,
          prompt: opts.prompt,
          provider: 'openai',
          model,
          size,
        },
      ]);
    } catch (trackErr) {
      console.error('generated_images insert failed (non-fatal):', trackErr);
    }
  }

  return { imageUrl: publicUrl, storagePath, model, size };
}
