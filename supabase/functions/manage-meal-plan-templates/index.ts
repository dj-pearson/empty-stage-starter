import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  buildTemplatePlanRows,
  dateForOffset,
  groupPlannedWeekIntoTemplateEntries,
  type FoodSafety,
} from "../_shared/meal-plan-templates.ts";
import { getCorsHeaders, securityHeaders, noCacheHeaders } from "../common/headers.ts";

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
        { status: 401, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    const { action, templateId, templateData, startDate, kidIds, mode } = await req.json();

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
        return await applyTemplate(supabaseClient, user.id, templateId, startDate, kidIds, corsHeaders, mode === 'replace' ? 'replace' : 'merge');
      case 'saveFromWeek':
        return await saveFromWeek(supabaseClient, user.id, templateData, corsHeaders);
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error in manage-meal-plan-templates:', error);
    return new Response(
      JSON.stringify({
        error: (error instanceof Error ? error.message : null) || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
    );
  }
};

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
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
      );
    }
  }

  return new Response(
    JSON.stringify({ template, message: 'Template created successfully' }),
    { status: 201, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ templates }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ template }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ template, message: 'Template updated successfully' }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ message: 'Template deleted successfully' }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
  );
}

// Apply template to a specific week
async function applyTemplate(
  supabaseClient: any,
  userId: string,
  templateId: string,
  startDate: string,
  kidIds: string[],
  corsHeaders: any,
  mode: 'merge' | 'replace' = 'merge'
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
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  // US-716: the household this user writes into. plan_entries.user_id is NOT
  // NULL with no trigger to fill it, and the rows below never carried it, so
  // every apply was rejected outright. household_id is stamped explicitly too,
  // because it is part of the upsert conflict target.
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('household_id')
    .eq('user_id', userId)
    .single();

  if (profileError || !profile) {
    return new Response(
      JSON.stringify({ error: 'Profile not found' }),
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  // Foods referenced by the template, for the allergen check that has been a
  // `// TODO: Check allergens` in this function since it was written.
  const foodIds = new Set<string>();
  for (const entry of template.meal_plan_template_entries) {
    for (const id of entry.food_ids ?? []) foodIds.add(id);
  }

  let foodsById = new Map<string, FoodSafety>();
  if (foodIds.size > 0) {
    const { data: foodRows, error: foodsError } = await supabaseClient
      .from('foods')
      .select('id, name, allergens')
      .in('id', [...foodIds]);
    if (foodsError) {
      return new Response(
        JSON.stringify({ error: foodsError.message }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
      );
    }
    foodsById = new Map(
      (foodRows ?? []).map(
        (f: { id: string; name: string; allergens: string[] | null }) =>
          [f.id, { name: f.name, allergens: f.allergens ?? [] }] as const
      )
    );
  }

  // US-716: replace clears the target week for the selected kids first; merge
  // leaves what is there and lets the upsert settle collisions.
  if (mode === 'replace') {
    const uniqueDates = [
      ...new Set(
        template.meal_plan_template_entries.map((e: { day_of_week: number }) =>
          dateForOffset(startDate, e.day_of_week)
        )
      ),
    ];
    if (uniqueDates.length > 0) {
      const { error: clearError } = await supabaseClient
        .from('plan_entries')
        .delete()
        .in('kid_id', kidIds)
        .in('date', uniqueDates);
      if (clearError) {
        return new Response(
          JSON.stringify({ error: clearError.message }),
          { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  const { rows: planEntries, recipeOnly, skipped } = buildTemplatePlanRows({
    templateEntries: template.meal_plan_template_entries,
    kids,
    foodsById,
    userId,
    householdId: profile.household_id,
    startDate,
    templateName: template.name,
  });

  // US-716: upsert on the key added in 20260901000010, so applying the same
  // template to the same week twice updates rather than duplicating.
  let insertedEntries: unknown[] = [];
  if (planEntries.length > 0) {
    const { data, error: insertError } = await supabaseClient
      .from('plan_entries')
      .upsert(planEntries, {
        onConflict: 'household_id,kid_id,date,meal_slot,food_id',
        ignoreDuplicates: false,
      })
      .select();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
      );
    }
    insertedEntries = data ?? [];
  }

  // US-716: a recipe-only entry has no food to put in food_id, which is NOT
  // NULL. It used to be inserted as null and rejected. schedule_recipe_to_plan
  // expands the recipe's own foods instead.
  let recipeEntriesCreated = 0;
  for (const item of recipeOnly) {
    const { data: count, error: rpcError } = await supabaseClient.rpc('schedule_recipe_to_plan', {
      p_kid_id: item.kid_id,
      p_recipe_id: item.recipe_id,
      p_date: item.date,
      p_meal_slot: item.meal_slot,
    });
    if (rpcError) {
      // A recipe with no foods, or one this caller may not schedule, is not a
      // reason to fail the whole apply.
      console.warn('US-716: recipe-only template entry not scheduled', {
        recipe_id: item.recipe_id,
        kid_id: item.kid_id,
        reason: rpcError.message,
      });
      continue;
    }
    recipeEntriesCreated += Number(count) || 0;
  }

  // Increment times_used counter
  await supabaseClient
    .from('meal_plan_templates')
    .update({ times_used: (template.times_used || 0) + 1 })
    .eq('id', templateId);

  return new Response(
    JSON.stringify({
      message: 'Template applied successfully',
      entriesCreated: insertedEntries.length + recipeEntriesCreated,
      entries: insertedEntries,
      recipeEntriesCreated,
      skipped,
    }),
    { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
    .lte('date', endDate);
  // US-716: no is_primary_dish filter. It dropped every side dish, so a saved
  // week came back as one food per slot and the rest of the meal was lost.
  // The rows are grouped by (date, meal_slot, recipe_id) below instead.

  // Optionally filter by specific kid
  if (kidId) {
    query = query.eq('kid_id', kidId);
  }

  const { data: planEntries, error: planError } = await query;

  if (planError || !planEntries || planEntries.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No plan entries found for the specified week' }),
      { status: 404, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
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
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  // US-716: group by (date, meal_slot, recipe_id) instead of mapping one plan
  // row to one template entry, which lost every non-primary food in a meal.
  const templateEntries = groupPlannedWeekIntoTemplateEntries(planEntries, startDate).map(
    (group) => ({ template_id: template.id, ...group })
  );

  const { error: entriesError } = await supabaseClient
    .from('meal_plan_template_entries')
    .insert(templateEntries);

  if (entriesError) {
    // Rollback: delete the template
    await supabaseClient.from('meal_plan_templates').delete().eq('id', template.id);
    return new Response(
      JSON.stringify({ error: entriesError.message }),
      { status: 400, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      message: 'Week saved as template successfully',
      template,
      entriesCount: templateEntries.length,
    }),
    { status: 201, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders(), 'Content-Type': 'application/json' } }
  );
}
