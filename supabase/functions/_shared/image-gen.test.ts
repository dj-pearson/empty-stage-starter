// Deno tests for the shared image-generation helper.
// Run with: deno test --allow-net --allow-env supabase/functions/_shared/image-gen.test.ts
import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildPromptFromContext, generateAndStoreImage } from './image-gen.ts';

Deno.test('buildPromptFromContext uses the title and enforces no-text', () => {
  const prompt = buildPromptFromContext({
    title: 'Food chaining from nuggets to chicken',
    source: 'blog',
  });
  assertStringIncludes(prompt, 'Food chaining from nuggets to chicken');
  assertStringIncludes(prompt, 'wide editorial header composition');
  assertStringIncludes(prompt, 'no text');
});

Deno.test('buildPromptFromContext uses square composition for social', () => {
  const prompt = buildPromptFromContext({ title: 'Calm mealtimes', source: 'social' });
  assertStringIncludes(prompt, 'square social-media composition');
});

Deno.test('buildPromptFromContext falls back when no title/excerpt', () => {
  const prompt = buildPromptFromContext({ source: 'manual' });
  assertStringIncludes(prompt, 'calm family mealtime');
});

// ─── generateAndStoreImage: happy path with a stubbed provider + storage ──────
function fakeSupabase(captured: { path?: string; bytesLen?: number; tracked?: unknown }) {
  return {
    storage: {
      from() {
        return {
          upload(path: string, bytes: Uint8Array) {
            captured.path = path;
            captured.bytesLen = bytes.length;
            return Promise.resolve({ error: null });
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://cdn.example/${path}` } };
          },
        };
      },
    },
    from() {
      return {
        insert(rows: unknown) {
          captured.tracked = rows;
          return Promise.resolve({ error: null });
        },
      };
    },
  } as never;
}

Deno.test('generateAndStoreImage decodes b64 and stores it', async () => {
  const captured: { path?: string; bytesLen?: number; tracked?: unknown } = {};
  const originalFetch = globalThis.fetch;
  // "hello" base64 = aGVsbG8= (5 bytes)
  globalThis.fetch = ((..._args: unknown[]) =>
    Promise.resolve(
      new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }), {
        status: 200,
      })
    )) as typeof fetch;

  try {
    const result = await generateAndStoreImage(fakeSupabase(captured), {
      prompt: 'test prompt',
      source: 'blog',
      recordId: 'post-123',
      openaiKey: 'sk-test',
      model: 'gpt-image-1',
      track: true,
    });

    assertEquals(result.imageUrl, `https://cdn.example/${captured.path}`);
    assertEquals(captured.bytesLen, 5); // "hello"
    assertStringIncludes(captured.path!, 'blog/post-123-featured-');
    assertStringIncludes(captured.path!, '.png');
    assert(captured.tracked !== undefined, 'should insert a tracking row');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('generateAndStoreImage throws on provider error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response('rate limited', { status: 429 }))) as typeof fetch;

  try {
    await assertRejects(
      () =>
        generateAndStoreImage(fakeSupabase({}), {
          prompt: 'x',
          source: 'social',
          openaiKey: 'sk-test',
        }),
      Error,
      'Image generation failed (429)'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
