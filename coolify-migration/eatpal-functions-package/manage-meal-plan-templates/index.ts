import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, securityHeaders, noCacheHeaders } from "../_shared/headers.ts";

export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, templateId, templateData, startDate, kidIds } = await req.json();

    // Route to appropriate handler
    switch (action) {
      case 'create':
        return await createTemplate(supabaseClient, user.id, templateData, corsHeaders);
      case 'list':
        return await listTemplates(supabaseClient, user.id, templateData, corsHeaders);
      case 'get':
        return await getTemplate(supabaseClient, templateId, corsHeaders);
      case 'update':
        return await updateTemplate(supabaseClient, templateId, templateData, corsHeaders);
      case 'delete':
        return await deleteTemplate(supabaseClient, templateId, corsHeaders);
      case 'apply':
        return await applyTemplate(supabaseClient, user.id, templateId, startDate, kidIds, corsHeaders);
      case 'saveFromWeek':
        return await saveFromWeek(supabaseClient, user.id, templateData, corsHeaders);
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('Error in manage-meal-plan-templates:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Create a new template
async function createTemplate(supabaseClient: any, userId: string, templateData: any, corsHeaders: any) {
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('household_id')
    .eq('user_id', userId)
    .single();

  if (profileError || !profile) {
    return new Response(
      JSON.stringify({ error: 'Profile not found' }),
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create template
  const { data: template, error: templateError } = await supabaseClient
    .from('meal_plan_templates')
    .insert({
      user_id: userId,
      household_id: profile.household_id,
      name: templateData.name,
      description: templateData.description,
      season: templateData.season,
      target_age_range: templateData.target_age_range,
      dietary_restrictions: templateData.dietary_restrictions,
      is_favorite: templateData.is_favorite || false,
    })
    .select()
    .single();

  if (templateError) {
    return new Response(
      JSON.stringify({ error: templateError.message }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create template entries if provided
  if (templateData.entries && templateData.entries.length > 0) {
    const entries = templateData.entries.map((entry: any) => ({
      template_id: template.id,
      day_of_week: entry.day_of_week,
      meal_slot: entry.meal_slot,
      recipe_id: entry.recipe_id,
      food_ids: entry.food_ids,
      notes: entry.notes,
      is_optional: entry.is_optional || false,
    }));

    const { error: entriesError } = await supabaseClient
      .from('meal_plan_template_entries')
      .insert(entries);

    if (entriesError) {
      // Rollback: delete the template
      await supabaseClient.from('meal_plan_templates').delete().eq('id', template.id);
      return new Response(
        JSON.stringify({ error: entriesError.message }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ template, message: 'Template created successfully' }),
    { status: 201, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
  );
}

// List templates
async function listTemplates(supabaseClient: any, userId: string, filters: any, corsHeaders: any) {
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('household_id')
    .eq('user_id', userId)
    .single();

  if (profileError || !profile) {
    return new Response(
      JSON.stringify({ error: 'Profile not found' }),
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let query = supabaseClient
    .from('meal_plan_templates')
    .select(`
      *,
      meal_plan_template_entries (
        id,
        day_of_week,
        meal_slot,
        recipe_id,
        food_ids,
        notes,
        is_optional,
        recipes (
          id,
          name,
          image_url,
          kid_friendly_score
        )
      )
    `)
    .or(`household_id.eq.${profile.household_id},is_admin_template.eq.true`)
    .order('is_favorite', { ascending: false })
    .order('times_used', { ascending: false })
    .order('created_at', { ascending: false });

  // Apply filters
  if (filters?.season) {
    query = query.eq('season', filters.season);
  }
  if (filters?.is_starter_template) {
    query = query.eq('is_starter_template', true);
  }
  if (filters?.is_admin_template !== undefined) {
    query = query.eq('is_admin_template', filters.is_admin_template);
  }

  const { data: templates, error } = await query;

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ templates }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
  );
}

// Get single template with entries
async function getTemplate(supabaseClient: any, templateId: string, corsHeaders: any) {
  const { data: template, error } = await supabaseClient
    .from('meal_plan_templates')
    .select(`
      *,
      meal_plan_template_entries (
        id,
        day_of_week,
        meal_slot,
        recipe_id,
        food_ids,
        notes,
        is_optional,
        recipes (
          id,
          name,
          description,
          image_url,
          kid_friendly_score,
          prepTime,
          cookTime
        )
      )
    `)
    .eq('id', templateId)
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ template }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
  );
}

// Update template
async function updateTemplate(supabaseClient: any, templateId: string, templateData: any, corsHeaders: any) {
  const { data: template, error } = await supabaseClient
    .from('meal_plan_templates')
    .update({
      name: templateData.name,
      description: templateData.description,
      season: templateData.season,
      target_age_range: templateData.target_age_range,
      dietary_restrictions: templateData.dietary_restrictions,
      is_favorite: templateData.is_favorite,
    })
    .eq('id', templateId)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ template, message: 'Template updated successfully' }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
  );
}

// Delete template
async function deleteTemplate(supabaseClient: any, templateId: string, corsHeaders: any) {
  const { error } = await supabaseClient
    .from('meal_plan_templates')
    .delete()
    .eq('id', templateId);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ message: 'Template deleted successfully' }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
  );
}

// Apply template to a specific week
async function applyTemplate(
  supabaseClient: any,
  userId: string,
  templateId: string,
  startDate: string,
  kidIds: string[],
  corsHeaders: any
) {
  // Get template with entries
  const { data: template, error: templateError } = await supabaseClient
    .from('meal_plan_templates')
    .select(`
      *,
      meal_plan_template_entries (*)
    `)
    .eq('id', templateId)
    .single();

  if (templateError || !template) {
    return new Response(
      JSON.stringify({ error: 'Template not found' }),
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get kid dietary restrictions to filter unsafe meals
  const { data: kids, error: kidsError } = await supabaseClient
    .from('kids')
    .select('id, allergens, dietary_restrictions')
    .in('id', kidIds);

  if (kidsError) {
    return new Response(
      JSON.stringify({ error: kidsError.message }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Parse start date
  const start = new Date(startDate);

  // Create plan entries for each kid
  const planEntries = [];
  for (const entry of template.meal_plan_template_entries) {
    // Calculate actual date (start date + day_of_week offset)
    const entryDate = new Date(start);
    entryDate.setDate(start.getDate() + entry.day_of_week);
    const dateStr = entryDate.toISOString().split('T')[0];

    // Create entry for each kid
    for (const kid of kids) {
      // TODO: Check allergens in recipe/foods and skip if unsafe for this kid
      // For now, we'll create all entries

      planEntries.push({
        kid_id: kid.id,
        date: dateStr,
        meal_slot: entry.meal_slot,
        recipe_id: entry.recipe_id,
        food_id: entry.food_ids ? entry.food_ids[0] : null, // Take first food if multiple
        is_primary_dish: true,
        notes: `From template: ${template.name}${entry.notes ? ` | ${entry.notes}` : ''}`,
      });

      // Add additional foods as non-primary dishes
      if (entry.food_ids && entry.food_ids.length > 1) {
        for (let i = 1; i < entry.food_ids.length; i++) {
          planEntries.push({
            kid_id: kid.id,
            date: dateStr,
            meal_slot: entry.meal_slot,
            food_id: entry.food_ids[i],
            is_primary_dish: false,
            notes: `From template: ${template.name}`,
          });
        }
      }
    }
  }

  // Insert plan entries
  const { data: insertedEntries, error: insertError } = await supabaseClient
    .from('plan_entries')
    .insert(planEntries)
    .select();

  if (insertError) {
    return new Response(
      JSON.stringify({ error: insertError.message }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Increment times_used counter
  await supabaseClient
    .from('meal_plan_templates')
    .update({ times_used: (template.times_used || 0) + 1 })
    .eq('id', templateId);

  return new Response(
    JSON.stringify({
      message: 'Template applied successfully',
      entriesCreated: insertedEntries.length,
      entries: insertedEntries,
    }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
  );
}

// Save current week as template
async function saveFromWeek(supabaseClient: any, userId: string, templateData: any, corsHeaders: any) {
  const { startDate, endDate, kidId, name, description, season } = templateData;

  // Get profile
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('household_id')
    .eq('user_id', userId)
    .single();

  if (profileError || !profile) {
    return new Response(
      JSON.stringify({ error: 'Profile not found' }),
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Get plan entries for the specified week
  let query = supabaseClient
    .from('plan_entries')
    .select(`
      *,
      recipes (id, name)
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .eq('is_primary_dish', true); // Only primary dishes to avoid duplicates

  // Optionally filter by specific kid
  if (kidId) {
    query = query.eq('kid_id', kidId);
  }

  const { data: planEntries, error: planError } = await query;

  if (planError || !planEntries || planEntries.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No plan entries found for the specified week' }),
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Create template
  const { data: template, error: templateError } = await supabaseClient
    .from('meal_plan_templates')
    .insert({
      user_id: userId,
      household_id: profile.household_id,
      name: name || `Week of ${startDate}`,
      description: description || 'Saved from meal planner',
      season: season || 'year_round',
      created_from_week: startDate,
    })
    .select()
    .single();

  if (templateError) {
    return new Response(
      JSON.stringify({ error: templateError.message }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Convert plan entries to template entries
  // Group by date to calculate day_of_week
  const start = new Date(startDate);
  const templateEntries = planEntries.map((entry: any) => {
    const entryDate = new Date(entry.date);
    const daysDiff = Math.floor((entryDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    return {
      template_id: template.id,
      day_of_week: daysDiff,
      meal_slot: entry.meal_slot,
      recipe_id: entry.recipe_id,
      food_ids: entry.food_id ? [entry.food_id] : [],
      notes: entry.notes,
    };
  });

  const { error: entriesError } = await supabaseClient
    .from('meal_plan_template_entries')
    .insert(templateEntries);

  if (entriesError) {
    // Rollback: delete the template
    await supabaseClient.from('meal_plan_templates').delete().eq('id', template.id);
    return new Response(
      JSON.stringify({ error: entriesError.message }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      message: 'Week saved as template successfully',
      template,
      entriesCount: templateEntries.length,
    }),
    { status: 201, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
  );
}
