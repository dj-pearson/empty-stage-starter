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
    // Authorization: caller must be an authenticated admin/root_admin.
    const gate = await requireAdmin(req);
    if (!gate.ok || !gate.admin) {
      return new Response(
        JSON.stringify({ error: gate.error ?? 'Unauthorized' }),
        { status: gate.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, action, value } = await req.json();

    if (!userId || !action) {
      return new Response(
        JSON.stringify({ error: 'userId and action are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = gate.admin;

    console.log(`Admin ${gate.userId} performing action ${action} for user ${userId}`);

    switch (action) {
      case 'ban':
        // Ban for 100 years (effectively permanent)
        const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
          ban_duration: "876000h", // 100 years in hours
        });
        if (banError) throw banError;
        break;

      case 'unban':
        const { error: unbanError } = await supabase.auth.admin.updateUserById(userId, {
          ban_duration: "none",
        });
        if (unbanError) throw unbanError;
        break;

      case 'make_admin':
        const { error: adminError } = await supabase
          .from("user_roles")
          .upsert({ user_id: userId, role: "admin" });
        if (adminError) throw adminError;
        break;

      case 'remove_admin':
        const { error: removeError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        if (removeError) throw removeError;
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    console.log(`Successfully performed action ${action} for user ${userId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in update-user function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
