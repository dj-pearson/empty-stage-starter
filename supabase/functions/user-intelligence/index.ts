import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserIntelligenceRequest {
  action: 'get_user' | 'search' | 'get_timeline' | 'quick_action';
  userId?: string;
  searchTerm?: string;
  filter?: 'at_risk' | 'payment_failed' | 'has_tickets' | 'churned' | 'vip';
  limit?: number;
  offset?: number;
  quickAction?: {
    type: 'send_email' | 'grant_comp_sub' | 'add_note' | 'create_ticket';
    data: any;
  };
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!userRole || userRole.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestData: UserIntelligenceRequest = await req.json();
    const { action } = requestData;

    switch (action) {
      case 'get_user':
        return await getUserIntelligence(supabase, requestData);

      case 'search':
        return await searchUsers(supabase, requestData);

      case 'get_timeline':
        return await getUserTimeline(supabase, requestData);

      case 'quick_action':
        return await performQuickAction(supabase, requestData, user.id);

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('Error in user-intelligence function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getUserIntelligence(supabase: any, request: UserIntelligenceRequest) {
  const { userId } = request;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'userId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get user intelligence data
  const { data: userIntelligence, error: intelligenceError } = await supabase
    .from('admin_user_intelligence')
    .select('*')
    .eq('id', userId)
    .single();

  if (intelligenceError) {
    console.error('Error fetching user intelligence:', intelligenceError);
    return new Response(
      JSON.stringify({ error: 'User not found or error fetching data' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get auth user data for email
  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);

  // Get kids details
  const { data: kids } = await supabase
    .from('kids')
    .select('id, name, age')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Get feature flags for this user
  const { data: featureFlags } = await supabase
    .from('feature_flag_evaluations')
    .select(`
      feature_flag_id,
      enabled,
      feature_flags (
        name,
        description
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get recent errors
  const { data: recentErrors } = await supabase
    .from('admin_live_activity')
    .select('*')
    .eq('user_id', userId)
    .eq('severity', 'error')
    .order('created_at', { ascending: false })
    .limit(5);

  // Get open support tickets
  const { data: openTickets } = await supabase
    .from('support_tickets')
    .select('id, subject, status, priority, created_at')
    .eq('user_id', userId)
    .in('status', ['new', 'in_progress', 'waiting_user'])
    .order('created_at', { ascending: false });

  // Combine all data
  const response = {
    ...userIntelligence,
    email: authUser?.email || userIntelligence.email,
    kids: kids || [],
    featureFlags: featureFlags || [],
    recentErrors: recentErrors || [],
    openTickets: openTickets || [],
  };

  return new Response(
    JSON.stringify(response),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function searchUsers(supabase: any, request: UserIntelligenceRequest) {
  const { searchTerm = '', filter, limit = 20 } = request;

  // Use the search function
  const { data: users, error } = await supabase
    .rpc('search_users_intelligence', {
      p_search_term: searchTerm,
      p_filter: filter || null,
      p_limit: limit,
    });

  if (error) {
    console.error('Error searching users:', error);
    return new Response(
      JSON.stringify({ error: 'Error searching users' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ users: users || [] }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getUserTimeline(supabase: any, request: UserIntelligenceRequest) {
  const { userId, limit = 50, offset = 0 } = request;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'userId is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Use the timeline function
  const { data: timeline, error } = await supabase
    .rpc('get_user_activity_timeline', {
      p_user_id: userId,
      p_limit: limit,
      p_offset: offset,
    });

  if (error) {
    console.error('Error fetching timeline:', error);
    return new Response(
      JSON.stringify({ error: 'Error fetching timeline' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ timeline: timeline || [] }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function performQuickAction(supabase: any, request: UserIntelligenceRequest, adminUserId: string) {
  const { userId, quickAction } = request;

  if (!userId || !quickAction) {
    return new Response(
      JSON.stringify({ error: 'userId and quickAction are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { type, data } = quickAction;

  switch (type) {
    case 'add_note': {
      // Add a note to admin_live_activity
      const { error } = await supabase
        .from('admin_live_activity')
        .insert({
          user_id: userId,
          activity_type: 'admin_note',
          activity_description: data.note,
          severity: 'info',
          metadata: {
            added_by: adminUserId,
            note_type: 'manual',
          },
        });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to add note' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Note added successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    case 'create_ticket': {
      // Create a support ticket on behalf of user
      const { error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: userId,
          subject: data.subject,
          description: data.description,
          category: data.category || 'question',
          priority: data.priority || 'medium',
          status: 'new',
          created_by_admin: true,
          admin_user_id: adminUserId,
        });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to create ticket' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Ticket created successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    case 'grant_comp_sub': {
      // Grant complementary subscription
      const { error } = await supabase
        .from('complementary_subscriptions')
        .insert({
          user_id: userId,
          granted_by: adminUserId,
          reason: data.reason || 'Admin granted',
          duration_days: data.durationDays || 30,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + (data.durationDays || 30) * 24 * 60 * 60 * 1000).toISOString(),
          active: true,
        });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to grant complementary subscription' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Complementary subscription granted' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    case 'send_email': {
      // Queue email for sending
      const { error } = await supabase
        .from('automation_email_queue')
        .insert({
          user_id: userId,
          template_id: data.templateId,
          subject: data.subject,
          body: data.body,
          priority: data.priority || 'normal',
          scheduled_for: data.scheduledFor || new Date().toISOString(),
          metadata: {
            sent_by_admin: adminUserId,
            manual: true,
          },
        });

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to queue email' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Email queued for sending' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    default:
      return new Response(
        JSON.stringify({ error: 'Invalid quick action type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
  }
}
