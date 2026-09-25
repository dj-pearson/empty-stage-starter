/**
 * Hand text to the system share sheet or the clipboard, and say which
 * happened. It never throws: the caller decides what to show, and a browser
 * that allows neither returns 'failed' so the text can be shown to copy by
 * hand (CopyFallbackDialog) instead of vanishing.
 */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareTextOptions {
  title?: string;
  /** Try navigator.share first (phones); otherwise go straight to the clipboard. */
  preferShare?: boolean;
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

export async function shareOrCopyText(text: string, opts: ShareTextOptions = {}): Promise<ShareOutcome> {
  const nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator;
  if (!nav) return 'failed';

  if (opts.preferShare && typeof nav.share === 'function') {
    try {
      await nav.share(opts.title ? { title: opts.title, text } : { text });
      return 'shared';
    } catch (error) {
      // The parent closed the sheet: that is a choice, not a failure.
      if (isAbort(error)) return 'cancelled';
      // Anything else (NotAllowedError without a gesture, say) falls through
      // to the clipboard.
    }
  }

  try {
    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    return 'failed';
  }
  return 'failed';
}
