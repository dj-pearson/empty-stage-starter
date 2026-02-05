import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, action, value } = await req.json();

    if (!userId || !action) {
      return new Response(
        JSON.stringify({ error: 'userId and action are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Performing action ${action} for user ${userId}`);

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
