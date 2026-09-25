/**
 * The first word of a name, for anything that leaves the household.
 *
 * Reports a parent hands a clinician carry a child's first name and nothing
 * more; this is the one place that decides what "first name" means, so the
 * ladder PDF and the journal report can't drift apart.
 */
export function firstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}
