/**
 * What a caught error is allowed to tell the caller (US-870).
 *
 * 92 sites across 76 deployed functions answered a `catch` with
 * `error.message`. That string is built from whatever threw: an upstream
 * provider's response body, a Postgres error naming a column or a constraint,
 * a fetch failure naming an internal host. None of it is written for the
 * person reading it and some of it describes the inside of the system.
 *
 * But a handler also throws on purpose -- "Source food ID is required" -- and
 * blanket-replacing every message with "Internal server error" turns a fixable
 * 400 into a shrug. So the default is contained and the exception is explicit:
 * throw a PublicError and the message survives.
 */

/** An error whose message is written for the caller and is safe to return. */
export class PublicError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PublicError';
    this.status = status;
  }
}

/**
 * The message to put in a response body for a caught value.
 *
 * Anything that is not a PublicError is described, not quoted.
 */
export function publicMessage(error: unknown): string {
  return error instanceof PublicError ? error.message : 'Internal server error';
}

/** The status a caught value should answer with: a PublicError's own, else 500. */
export function publicStatus(error: unknown, fallback = 500): number {
  return error instanceof PublicError ? error.status : fallback;
}
