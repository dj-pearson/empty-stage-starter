/**
 * US-843: the one-click unsubscribe headers bulk senders have needed since
 * February 2024.
 *
 * Gmail and Yahoo require bulk senders to support one-click unsubscribe --
 * `List-Unsubscribe` plus `List-Unsubscribe-Post`. Without them a mail client
 * shows no unsubscribe affordance of its own, recipients reach for "report
 * spam" instead, and the resulting complaint rate is measured against the
 * whole sending domain. That reaches the transactional mail too: the same
 * reputation decides whether a password-reset lands in the inbox.
 *
 * Neither send path set them. Both go through Resend, which passes a `headers`
 * object straight through to the message.
 *
 * BOTH HEADERS OR NEITHER. `List-Unsubscribe` alone advertises a link a client
 * may open in a browser; `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 * is what promises the URL will act on a bare POST with no confirmation step.
 * Sending the first without the second is what makes a client fall back to the
 * old behaviour, so they are built together here rather than by two callers.
 */

export interface ListUnsubscribeHeaders {
  'List-Unsubscribe': string;
  'List-Unsubscribe-Post': string;
}

/**
 * Build the pair from a one-click unsubscribe URL.
 *
 * `mailto` is optional and appended second: RFC 8058 lets a client pick either,
 * and the URL is the one that works without the recipient's mail client being
 * able to send on their behalf.
 */
export function listUnsubscribeHeaders(url: string, mailto?: string): ListUnsubscribeHeaders {
  const targets = [`<${url}>`];
  if (mailto) targets.push(`<mailto:${mailto}>`);
  return {
    'List-Unsubscribe': targets.join(', '),
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
