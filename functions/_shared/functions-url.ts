/**
 * US-843: the base URL an edge function builds public links against.
 *
 * agent-csat and agent-nurture-engine each carried their own identical copy,
 * and weekly-nutrition-email was about to be the third. This repo has paid for
 * a third copy before (three shortfall functions, three grocery insert
 * allowlists, two calendar implementations), so this is the one.
 */
export function functionsBase(): string {
  const url = Deno.env.get('SUPABASE_URL');
  return url ? `${url}/functions/v1` : (Deno.env.get('FUNCTIONS_URL') ?? '');
}
