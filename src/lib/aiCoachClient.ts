/**
 * How the web app identifies itself to ai-coach-chat.
 *
 * The function enforces the AI Coach daily limit for callers that send this
 * header and gives callers without it (shipped iOS builds) a grace period; see
 * supabase/functions/_shared/aiCoachGate.ts. It reuses X-Client-Info, which
 * the global client already sends as bare `eatpal-web` and which every
 * function's CORS allow-list accepts. The key is spelled exactly as in
 * src/integrations/supabase/client.ts so the invoke-level value replaces the
 * global one instead of being merged beside it.
 *
 * Bump the number when the web client's handling of the coach contract
 * changes in a way the server needs to tell apart.
 */
export const AI_COACH_CLIENT_VERSION = 1;

export const AI_COACH_CLIENT_HEADERS: Readonly<Record<"X-Client-Info", string>> = {
  "X-Client-Info": `eatpal-web/${AI_COACH_CLIENT_VERSION}`,
};
