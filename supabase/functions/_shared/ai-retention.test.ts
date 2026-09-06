// US-783 AC 2: what the AI requests do and do not say about retention.
// Run with: deno test --allow-env supabase/functions/_shared/ai-retention.test.ts
//
// These payloads carry child PII, so the shape of the outgoing body is a
// compliance fact and not a style question. `globalThis.fetch` is stubbed, so
// nothing here reaches a provider or needs a key that works.
import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { AIServiceV2 } from './ai-service-v2.ts';

/** The env the constructor reads before it will build. */
function setEnv() {
  Deno.env.set('SUPABASE_URL', 'https://example.test');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-not-a-real-key');
  Deno.env.set('CLAUDE_API_KEY', 'sk-ant-not-a-real-key');
  Deno.env.set('OPENAI_GLOBAL_API', 'sk-not-a-real-key');
}

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

/**
 * Run `fn` with fetch stubbed, returning what it tried to send.
 * The canned response is the minimum each provider's parser reads.
 */
async function capture(
  fn: (service: AIServiceV2) => Promise<unknown>,
  reply: unknown,
): Promise<Captured> {
  setEnv();
  const original = globalThis.fetch;
  let captured: Captured | undefined;

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    captured = {
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')),
    };
    return Promise.resolve(
      new Response(JSON.stringify(reply), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as typeof globalThis.fetch;

  try {
    const service = new AIServiceV2();
    // makeOpenAIRequest / makeClaudeRequest are private; the body they build is
    // the thing under test, so reach them directly rather than through
    // generateContent, which also writes usage rows.
    await fn(service);
  } finally {
    globalThis.fetch = original;
  }

  assert(captured, 'the request was never sent');
  return captured;
}

const messages = [{ role: 'user' as const, content: 'hello' }];

Deno.test('OpenAI requests send store:false, so no retrievable copy is kept', async () => {
  const { url, body } = await capture(
    (service) =>
      // deno-lint-ignore no-explicit-any
      (service as any).makeOpenAIRequest({ messages }, 'gpt-4o-mini'),
    { choices: [{ message: { content: 'hi' } }], usage: {} },
  );

  assertEquals(url, 'https://api.openai.com/v1/chat/completions');
  // Present AND false. `store` already defaults to false, so asserting only
  // that it is falsy would pass against a body that omits it -- and an omitted
  // parameter is at the mercy of a default changing.
  assert('store' in body, 'store is absent from the OpenAI request body');
  assertEquals(body.store, false);
});

Deno.test('Claude requests send no retention parameter, because none exists', async () => {
  const { url, body } = await capture(
    (service) =>
      // deno-lint-ignore no-explicit-any
      (service as any).makeClaudeRequest({ messages }, 'claude-haiku-4-5-20251001'),
    { content: [{ type: 'text', text: 'hi' }], usage: {} },
  );

  assertEquals(url, 'https://api.anthropic.com/v1/messages');
  // This is the assertion that keeps somebody from "fixing" the asymmetry with
  // the OpenAI branch by inventing a field. The Anthropic Messages API has no
  // per-request no-train or zero-retention parameter; retention is configured
  // for the organisation. A body carrying one of these would be sending a
  // parameter the API does not define, which reads as compliance and is not.
  for (const invented of ['store', 'no_train', 'zero_retention', 'retention', 'data_retention']) {
    assertFalse(invented in body, `${invented} is not a parameter of the Messages API`);
  }
});
