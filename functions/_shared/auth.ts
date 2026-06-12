import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function authenticateRequest(
  req: Request
): Promise<
  | { user: any; supabase: ReturnType<typeof createClient>; error?: never }
  | { user?: never; supabase?: never; error: Response }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      error: new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  // Also return the JWT-scoped client so callers can reuse it (e.g. rate-limit
  // RPCs) without building a second client. US-325.
  return { user, supabase };
}
