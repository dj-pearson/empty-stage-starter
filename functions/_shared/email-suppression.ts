/**
 * US-843: one suppression list, honoured by every sender.
 *
 * `email_suppressions` is where nurture-unsubscribe writes when somebody clicks
 * the link in a nurture email. Two senders checked it -- agent-nurture-engine
 * and agent-weekly-digest -- with the same four lines written out twice. The
 * third, weekly-nutrition-email, checked only its own
 * `automation_email_subscriptions` row, so a parent who unsubscribed went on
 * receiving the weekly nutrition summary indefinitely.
 *
 * An unsubscribe that stops two of three mailings is not an unsubscribe. This
 * module is the one implementation, so a fourth sender has something to call
 * rather than a fifth copy to write.
 */

/**
 * Just the chain this module uses. Narrower than the `any` the other _shared
 * files reach for, which keeps the call site honest and costs one lint error
 * less than the house pattern.
 */
interface SuppressionQuery {
  from(table: string): {
    select(
      columns: string,
      options: { count: 'exact'; head: true },
    ): { eq(column: string, value: string): Promise<{ count?: number; error?: unknown }> };
  };
}

/** Normalised the way the table stores and the way both senders compared. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Has this address opted out of email from us?
 *
 * Fails CLOSED on a query error: the alternative is treating a database blip
 * as consent and mailing somebody who asked us not to. A skipped send is
 * recoverable on the next run; an email to a person who unsubscribed is not.
 */
export async function isSuppressed(db: SuppressionQuery, email: string): Promise<boolean> {
  const { count, error } = await db
    .from('email_suppressions')
    .select('id', { count: 'exact', head: true })
    .eq('email', normalizeEmail(email));

  if (error) {
    console.error('email suppression check failed; treating as suppressed:', error);
    return true;
  }
  return (count ?? 0) > 0;
}
