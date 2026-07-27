import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authorization: only authenticated admins may list users (PII).
    const gate = await requireAdmin(req);
    if (!gate.ok || !gate.admin) {
      return new Response(
        JSON.stringify({ error: gate.error ?? 'Unauthorized' }),
        { status: gate.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = gate.admin;

    console.log(`Admin ${gate.userId} fetching all users...`);

    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        onboarding_completed,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      throw profilesError;
    }

    // Get auth users using service role
    const { data: { users: authUsers }, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error('Error fetching auth users:', authError);
      throw authError;
    }

    console.log(`Found ${authUsers?.length || 0} auth users and ${profiles?.length || 0} profiles`);

    // Get user roles
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
      throw rolesError;
    }

    // Combine data
    const combinedUsers = profiles?.map((profile) => {
      const authUser = authUsers?.find((u: any) => u.id === profile.id);
      const userRole = roles?.find((r: any) => r.user_id === profile.id);

      return {
        id: profile.id,
        email: authUser?.email || "N/A",
        full_name: profile.full_name || "Unknown",
        created_at: profile.created_at,
        last_sign_in_at: authUser?.last_sign_in_at || null,
        onboarding_completed: profile.onboarding_completed || false,
        role: userRole?.role || "user",
        is_banned: (authUser as any)?.banned_until ? new Date((authUser as any).banned_until) > new Date() : false,
      };
    }) || [];

    console.log(`Returning ${combinedUsers.length} combined users`);

    return new Response(
      JSON.stringify({ users: combinedUsers }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in list-users function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
};
