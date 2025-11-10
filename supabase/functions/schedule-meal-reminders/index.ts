import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, securityHeaders, noCacheHeaders } from "../_shared/headers.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase with service role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting meal reminder scheduling...');

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Get next day
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterStr = dayAfter.toISOString().split('T')[0];

    // Get all plan entries for tomorrow and day after
    const { data: planEntries, error: planError } = await supabaseAdmin
      .from('plan_entries')
      .select(`
        *,
        kids (
          id,
          name,
          household_id
        ),
        foods (
          id,
          name
        ),
        recipes (
          id,
          name
        )
      `)
      .gte('date', tomorrowStr)
      .lte('date', dayAfterStr)
      .eq('is_primary_dish', true); // Only primary dishes to avoid duplicates

    if (planError) {
      console.error('Error fetching plan entries:', planError);
      throw planError;
    }

    console.log(`Found ${planEntries?.length || 0} planned meals`);

    if (!planEntries || planEntries.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No planned meals to remind about', scheduled: 0 }),
        { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let scheduledCount = 0;

    // Group by household to get users
    const householdIds = [...new Set(planEntries.map((entry: any) => entry.kids.household_id))];

    for (const householdId of householdIds) {
      // Get users in household with notification preferences
      const { data: users, error: userError } = await supabaseAdmin
        .from('profiles')
        .select(`
          user_id,
          notification_preferences (
            meal_reminders,
            meal_reminder_time_minutes,
            push_enabled
          )
        `)
        .eq('household_id', householdId);

      if (userError || !users) {
        console.error(`Error fetching users for household ${householdId}:`, userError);
        continue;
      }

      // Process meals for this household
      const householdMeals = planEntries.filter(
        (entry: any) => entry.kids.household_id === householdId
      );

      for (const user of users) {
        // Check if user has meal reminders enabled
        const prefs = user.notification_preferences?.[0];
        if (!prefs || !prefs.meal_reminders || !prefs.push_enabled) {
          continue;
        }

        const reminderMinutes = prefs.meal_reminder_time_minutes || 60;

        // Create reminders for each meal
        for (const meal of householdMeals) {
          try {
            // Calculate reminder time based on meal slot
            const mealTime = getMealTime(meal.meal_slot, meal.date);
            if (!mealTime) continue;

            const reminderTime = new Date(mealTime.getTime() - (reminderMinutes * 60 * 1000));

            // Don't schedule reminders in the past
            if (reminderTime < new Date()) {
              continue;
            }

            // Check if reminder already exists
            const { data: existing } = await supabaseAdmin
              .from('notification_queue')
              .select('id')
              .eq('user_id', user.user_id)
              .eq('notification_type', 'meal_reminder')
              .eq('scheduled_for', reminderTime.toISOString())
              .eq('data->>plan_entry_id', meal.id)
              .single();

            if (existing) {
              // console.log(`Reminder already scheduled for meal ${meal.id}`);
              continue;
            }

            // Create meal name for notification
            const mealName = meal.recipes?.name || meal.foods?.name || 'your meal';
            const kidName = meal.kids.name;

            // Insert notification
            await supabaseAdmin
              .from('notification_queue')
              .insert({
                user_id: user.user_id,
                household_id: householdId,
                notification_type: 'meal_reminder',
                title: `Time for ${meal.meal_slot}!`,
                body: `${kidName}'s ${meal.meal_slot}: ${mealName} in ${reminderMinutes} minutes`,
                data: {
                  plan_entry_id: meal.id,
                  kid_id: meal.kid_id,
                  meal_slot: meal.meal_slot,
                  meal_name: mealName,
                  action_url: `/dashboard/planner?date=${meal.date}`
                },
                channel: 'push',
                scheduled_for: reminderTime.toISOString(),
                priority: 'normal'
              });

            scheduledCount++;

          } catch (error) {
            console.error(`Error scheduling reminder for meal ${meal.id}:`, error);
          }
        }
      }
    }

    console.log(`Scheduled ${scheduledCount} meal reminders`);

    return new Response(
      JSON.stringify({
        message: 'Meal reminders scheduled',
        scheduled: scheduledCount
      }),
      { status: 200, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in schedule-meal-reminders:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, ...securityHeaders, ...noCacheHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Get typical meal time based on meal slot
function getMealTime(mealSlot: string, dateStr: string): Date | null {
  const date = new Date(dateStr);

  // Set typical meal times
  switch (mealSlot) {
    case 'breakfast':
      date.setHours(7, 30, 0, 0); // 7:30 AM
      break;
    case 'lunch':
      date.setHours(12, 0, 0, 0); // 12:00 PM
      break;
    case 'dinner':
      date.setHours(18, 0, 0, 0); // 6:00 PM
      break;
    case 'snack1':
      date.setHours(10, 0, 0, 0); // 10:00 AM
      break;
    case 'snack2':
      date.setHours(15, 0, 0, 0); // 3:00 PM
      break;
    case 'try_bite':
      date.setHours(16, 0, 0, 0); // 4:00 PM
      break;
    default:
      return null;
  }

  return date;
}

// Schedule grocery reminders
export async function scheduleGroceryReminders(supabaseAdmin: any) {
  console.log('Scheduling grocery reminders...');

  // Get all users with grocery_reminders enabled
  const { data: users, error: userError } = await supabaseAdmin
    .from('notification_preferences')
    .select(`
      user_id,
      household_id,
      grocery_reminder_day,
      grocery_reminder_time
    `)
    .eq('grocery_reminders', true)
    .eq('push_enabled', true);

  if (userError || !users) {
    console.error('Error fetching users for grocery reminders:', userError);
    return 0;
  }

  let scheduled = 0;

  for (const user of users) {
    try {
      // Calculate next reminder time based on day and time preferences
      const reminderDay = user.grocery_reminder_day || 'saturday';
      const reminderTime = user.grocery_reminder_time || '09:00:00';

      const nextReminderDate = getNextDayOfWeek(reminderDay, reminderTime);

      // Check if already scheduled
      const { data: existing } = await supabaseAdmin
        .from('notification_queue')
        .select('id')
        .eq('user_id', user.user_id)
        .eq('notification_type', 'grocery_reminder')
        .eq('scheduled_for', nextReminderDate.toISOString())
        .single();

      if (existing) {
        continue;
      }

      // Insert notification
      await supabaseAdmin
        .from('notification_queue')
        .insert({
          user_id: user.user_id,
          household_id: user.household_id,
          notification_type: 'grocery_reminder',
          title: 'Time to grocery shop! 🛒',
          body: "Don't forget to shop for this week's meals",
          data: {
            action_url: '/dashboard/grocery'
          },
          channel: 'push',
          scheduled_for: nextReminderDate.toISOString(),
          priority: 'normal'
        });

      scheduled++;

    } catch (error) {
      console.error(`Error scheduling grocery reminder for user ${user.user_id}:`, error);
    }
  }

  console.log(`Scheduled ${scheduled} grocery reminders`);
  return scheduled;
}

// Get next occurrence of a day of week
function getNextDayOfWeek(dayName: string, timeStr: string): Date {
  const days = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6
  };

  const targetDay = days[dayName.toLowerCase()] ?? 6;
  const today = new Date();
  const currentDay = today.getDay();

  // Calculate days until target day
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) {
    daysUntil += 7; // Next week
  }

  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + daysUntil);

  // Set time
  const [hours, minutes] = timeStr.split(':').map(Number);
  nextDate.setHours(hours, minutes, 0, 0);

  return nextDate;
}
