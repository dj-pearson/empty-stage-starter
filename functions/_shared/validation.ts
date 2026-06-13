/**
 * Payload / input-size validation for AI/LLM edge functions (US-325).
 *
 * Caps image and free-text size BEFORE forwarding to a vision/LLM API so a
 * single authenticated user cannot run up unbounded spend or exhaust quota
 * with an oversized request.
 */

/** Max decoded image size forwarded to a vision API. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB decoded

/** Max characters for free-text fields embedded into an LLM prompt. */
export const MAX_PROMPT_TEXT_CHARS = 4_000;
/** Max characters for OCR / parsed text blocks. */
export const MAX_OCR_TEXT_CHARS = 20_000;

/**
 * Decoded byte length of a base64 string (optionally a data: URL), without
 * actually allocating the decoded bytes.
 */
export function base64DecodedBytes(input: string): number {
  if (!input) return 0;
  const comma = input.indexOf(',');
  const b64 = input.startsWith('data:') && comma !== -1 ? input.slice(comma + 1) : input;
  const len = b64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (b64.endsWith('==')) padding = 2;
  else if (b64.endsWith('=')) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Returns a 413 `Response` if the base64 image exceeds `maxBytes`, else null.
 */
export function validateImageSize(
  base64: string | null | undefined,
  corsHeaders: Record<string, string>,
  maxBytes: number = MAX_IMAGE_BYTES,
): Response | null {
  if (!base64) return null;
  const bytes = base64DecodedBytes(base64);
  if (bytes > maxBytes) {
    return new Response(
      JSON.stringify({
        error: 'Image too large',
        max_bytes: maxBytes,
        received_bytes: bytes,
      }),
      { status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
  return null;
}

/** Truncate untrusted free text to a max length before prompt embedding. */
export function capText(
  value: string | null | undefined,
  maxChars: number = MAX_PROMPT_TEXT_CHARS,
): string {
  if (!value) return '';
  return value.length > maxChars ? value.slice(0, maxChars) : value;
}
