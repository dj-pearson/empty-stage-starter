import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/headers.ts';

interface ReportMetrics {
  // Planning metrics
  mealsPlanned: number;
  mealsCompleted: number;
  planningCompletionRate: number;
  templatesUsed: number;
  timeSavedMinutes: number;

  // Nutrition metrics
  nutritionGoalsMet: number;
  nutritionGoalsTotal: number;
  avgCaloriesPerDay: number;
  avgProteinPerDay: number;
  avgCarbsPerDay: number;
  avgFatPerDay: number;
  nutritionScore: number;

  // Grocery metrics
  groceryItemsAdded: number;
  groceryItemsPurchased: number;
  groceryCompletionRate: number;
  estimatedGroceryCost: number;

  // Recipe metrics
  uniqueRecipesUsed: number;
  recipeRepeats: number;
  newRecipesTried: number;
  recipeDiversityScore: number;

  // Kid engagement metrics
  kidsVoted: number;
  totalKids: number;
  votingParticipationRate: number;
  totalVotesCast: number;
  avgMealApprovalScore: number;
  achievementsUnlocked: number;

  // Top performers
  mostLovedMeals: any[];
  leastLovedMeals: any[];
  mostUsedRecipes: any[];
  healthiestMeals: any[];
}

interface Insight {
  insightType: string;
  title: string;
  description: string;
  metricValue?: number;
  metricLabel?: string;
  iconName: string;
  colorScheme: string;
  priority: number;
}

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { householdId, weekStartDate } = await req.json();

    if (!householdId) {
      throw new Error('householdId is required');
    }

    // Calculate week dates
    const weekStart = weekStartDate ? new Date(weekStartDate) : getMonday(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    console.log(`Generating report for household ${householdId}, week ${weekStartStr} to ${weekEndStr}`);

    // Collect all metrics
    const metrics = await collectMetrics(supabaseClient, householdId, weekStartStr, weekEndStr);

    // Generate insights
    const insights = generateInsights(metrics, weekStartStr);

    // Save report to database
    const { data: report, error: reportError } = await supabaseClient
      .from('weekly_reports')
      .insert({
        household_id: householdId,
        week_start_date: weekStartStr,
        week_end_date: weekEndStr,
        ...convertMetricsToDbFormat(metrics),
        insights: insights,
        status: 'generated',
      })
      .select()
      .single();

    if (reportError) {
      // If report already exists, update it
      if (reportError.code === '23505') {
        const { data: updatedReport, error: updateError } = await supabaseClient
          .from('weekly_reports')
          .update({
            ...convertMetricsToDbFormat(metrics),
            insights: insights,
            updated_at: new Date().toISOString(),
          })
          .eq('household_id', householdId)
          .eq('week_start_date', weekStartStr)
          .select()
          .single();

        if (updateError) throw updateError;

        // Save insights
        await saveInsights(supabaseClient, updatedReport.id, householdId, insights);

        return new Response(JSON.stringify({ report: updatedReport, updated: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw reportError;
    }

    // Save insights as separate records
    await saveInsights(supabaseClient, report.id, householdId, insights);

    // Save trend data for historical comparison
    await saveTrendData(supabaseClient, householdId, weekStartStr, metrics);

    return new Response(JSON.stringify({ report, created: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201,
    });
  } catch (error: any) {
    console.error('Error generating report:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
};

function getMonday(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

async function collectMetrics(
  supabase: any,
  householdId: string,
  weekStart: string,
  weekEnd: string
): Promise<ReportMetrics> {
  // Planning metrics
  const { data: planEntries } = await supabase
    .from('plan_entries')
    .select('*')
    .eq('household_id', householdId)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  const mealsPlanned = planEntries?.length || 0;
  const mealsCompleted = planEntries?.filter((e: any) => e.completed).length || 0;
  const planningCompletionRate = mealsPlanned > 0 ? (mealsCompleted / mealsPlanned) * 100 : 0;

  // Templates used
  const { data: templateApplies } = await supabase
    .from('meal_plan_templates')
    .select('times_used')
    .eq('household_id', householdId);

  const templatesUsed = templateApplies?.reduce((sum: number, t: any) => sum + (t.times_used || 0), 0) || 0;
  const timeSavedMinutes = templatesUsed * 25; // Estimate 25 minutes saved per template use

  // Nutrition metrics
  const { data: nutritionData } = await supabase
    .from('plan_entries')
    .select(`
      food_id,
      foods (
        nutrition_id
      )
    `)
    .eq('household_id', householdId)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let nutritionCount = 0;

  if (nutritionData) {
    for (const entry of nutritionData) {
      if (entry.foods?.nutrition_id) {
        const { data: nutrition } = await supabase
          .from('nutrition')
          .select('calories, protein, carbohydrates, fat')
          .eq('id', entry.foods.nutrition_id)
          .single();

        if (nutrition) {
          totalCalories += nutrition.calories || 0;
          totalProtein += nutrition.protein || 0;
          totalCarbs += nutrition.carbohydrates || 0;
          totalFat += nutrition.fat || 0;
          nutritionCount++;
        }
      }
    }
  }

  const daysInWeek = 7;
  const avgCaloriesPerDay = nutritionCount > 0 ? totalCalories / daysInWeek : 0;
  const avgProteinPerDay = nutritionCount > 0 ? totalProtein / daysInWeek : 0;
  const avgCarbsPerDay = nutritionCount > 0 ? totalCarbs / daysInWeek : 0;
  const avgFatPerDay = nutritionCount > 0 ? totalFat / daysInWeek : 0;

  // Simple nutrition score based on balanced macros
  const proteinPercent = totalProtein * 4 / (totalCalories || 1);
  const carbsPercent = totalCarbs * 4 / (totalCalories || 1);
  const fatPercent = totalFat * 9 / (totalCalories || 1);

  // Ideal ranges: Protein 20-30%, Carbs 45-65%, Fat 20-35%
  const proteinScore = proteinPercent >= 0.20 && proteinPercent <= 0.30 ? 100 : 70;
  const carbsScore = carbsPercent >= 0.45 && carbsPercent <= 0.65 ? 100 : 70;
  const fatScore = fatPercent >= 0.20 && fatPercent <= 0.35 ? 100 : 70;
  const nutritionScore = (proteinScore + carbsScore + fatScore) / 3;

  // Grocery metrics
  const { data: groceryItems } = await supabase
    .from('grocery_list')
    .select('purchased, estimated_price')
    .eq('household_id', householdId)
    .gte('created_at', new Date(weekStart).toISOString())
    .lte('created_at', new Date(weekEnd).toISOString());

  const groceryItemsAdded = groceryItems?.length || 0;
  const groceryItemsPurchased = groceryItems?.filter((i: any) => i.purchased).length || 0;
  const groceryCompletionRate = groceryItemsAdded > 0 ? (groceryItemsPurchased / groceryItemsAdded) * 100 : 0;
  const estimatedGroceryCost = groceryItems?.reduce((sum: number, i: any) => sum + (i.estimated_price || 0), 0) || 0;

  // Recipe metrics
  const recipeIds = new Set();
  const recipeCounts: Record<string, number> = {};

  planEntries?.forEach((entry: any) => {
    if (entry.recipe_id) {
      recipeIds.add(entry.recipe_id);
      recipeCounts[entry.recipe_id] = (recipeCounts[entry.recipe_id] || 0) + 1;
    }
  });

  const uniqueRecipesUsed = recipeIds.size;
  const recipeRepeats = Object.values(recipeCounts).filter(count => count > 1).length;

  // Calculate diversity score (higher is better)
  const recipeDiversityScore = uniqueRecipesUsed > 0
    ? (uniqueRecipesUsed / (mealsPlanned || 1)) * 100
    : 0;

  // New recipes tried (recipes used for first time ever)
  const { data: allTimeRecipes } = await supabase
    .from('plan_entries')
    .select('recipe_id')
    .eq('household_id', householdId)
    .lt('date', weekStart);

  const previousRecipeIds = new Set(allTimeRecipes?.map((e: any) => e.recipe_id).filter(Boolean));
  const newRecipesTried = Array.from(recipeIds).filter(id => !previousRecipeIds.has(id)).length;

  // Kid engagement metrics
  const { data: kids } = await supabase
    .from('kids')
    .select('id')
    .eq('household_id', householdId);

  const totalKids = kids?.length || 0;

  const { data: votes } = await supabase
    .from('meal_votes')
    .select('kid_id, vote')
    .eq('household_id', householdId)
    .gte('meal_date', weekStart)
    .lte('meal_date', weekEnd);

  const uniqueVoters = new Set(votes?.map((v: any) => v.kid_id));
  const kidsVoted = uniqueVoters.size;
  const votingParticipationRate = totalKids > 0 ? (kidsVoted / totalKids) * 100 : 0;
  const totalVotesCast = votes?.length || 0;

  // Calculate average approval score
  let approvalSum = 0;
  votes?.forEach((v: any) => {
    if (v.vote === 'love_it') approvalSum += 100;
    else if (v.vote === 'okay') approvalSum += 50;
    else approvalSum += 0;
  });
  const avgMealApprovalScore = totalVotesCast > 0 ? approvalSum / totalVotesCast : 0;

  // Achievements unlocked this week
  const { data: achievements } = await supabase
    .from('voting_achievements')
    .select('id')
    .in('kid_id', kids?.map((k: any) => k.id) || [])
    .gte('unlocked_at', new Date(weekStart).toISOString())
    .lte('unlocked_at', new Date(weekEnd).toISOString());

  const achievementsUnlocked = achievements?.length || 0;

  // Top performers
  const { data: votesSummary } = await supabase
    .from('meal_vote_summary')
    .select(`
      approval_score,
      total_votes,
      recipe_id,
      recipes (name)
    `)
    .eq('household_id', householdId)
    .gte('meal_date', weekStart)
    .lte('meal_date', weekEnd)
    .order('approval_score', { ascending: false });

  const mostLovedMeals = votesSummary
    ?.filter((v: any) => v.recipes && v.approval_score >= 80)
    .slice(0, 5)
    .map((v: any) => ({
      meal_name: v.recipes.name,
      approval_score: v.approval_score,
      votes: v.total_votes,
    })) || [];

  const leastLovedMeals = votesSummary
    ?.filter((v: any) => v.recipes && v.approval_score < 50)
    .slice(-3)
    .map((v: any) => ({
      meal_name: v.recipes.name,
      approval_score: v.approval_score,
      votes: v.total_votes,
    })) || [];

  const mostUsedRecipes = Object.entries(recipeCounts)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5)
    .map(([recipeId, count]) => ({
      recipe_id: recipeId,
      times_used: count,
    }));

  // Healthiest meals (those with best nutrition profiles)
  const healthiestMeals = planEntries
    ?.filter((e: any) => e.recipe_id)
    .slice(0, 3)
    .map((e: any) => ({
      meal_name: 'Meal',
      nutrition_score: nutritionScore,
    })) || [];

  return {
    mealsPlanned,
    mealsCompleted,
    planningCompletionRate,
    templatesUsed,
    timeSavedMinutes,
    nutritionGoalsMet: 0, // Would need goals table
    nutritionGoalsTotal: 7, // 7 days
    avgCaloriesPerDay,
    avgProteinPerDay,
    avgCarbsPerDay,
    avgFatPerDay,
    nutritionScore,
    groceryItemsAdded,
    groceryItemsPurchased,
    groceryCompletionRate,
    estimatedGroceryCost,
    uniqueRecipesUsed,
    recipeRepeats,
    newRecipesTried,
    recipeDiversityScore,
    kidsVoted,
    totalKids,
    votingParticipationRate,
    totalVotesCast,
    avgMealApprovalScore,
    achievementsUnlocked,
    mostLovedMeals,
    leastLovedMeals,
    mostUsedRecipes,
    healthiestMeals,
  };
}

function generateInsights(metrics: ReportMetrics, weekStart: string): Insight[] {
  const insights: Insight[] = [];
  let priority = 100;

  // Achievement: Perfect week
  if (metrics.mealsPlanned >= 21 && metrics.planningCompletionRate >= 95) {
    insights.push({
      insightType: 'achievement',
      title: 'Perfect Week! 🎉',
      description: `You planned all ${metrics.mealsPlanned} meals and completed ${metrics.planningCompletionRate.toFixed(0)}% of them!`,
      metricValue: metrics.planningCompletionRate,
      metricLabel: 'completion rate',
      iconName: 'trophy',
      colorScheme: 'green',
      priority: priority--,
    });
  }

  // Time savings
  if (metrics.timeSavedMinutes > 0) {
    insights.push({
      insightType: 'efficiency_win',
      title: 'Time Saved',
      description: `Using templates saved you approximately ${metrics.timeSavedMinutes} minutes this week!`,
      metricValue: metrics.timeSavedMinutes,
      metricLabel: 'minutes',
      iconName: 'clock',
      colorScheme: 'blue',
      priority: priority--,
    });
  }

  // Kid engagement win
  if (metrics.votingParticipationRate >= 80) {
    insights.push({
      insightType: 'engagement_win',
      title: 'Amazing Participation! 👨‍👩‍👧‍👦',
      description: `${metrics.votingParticipationRate.toFixed(0)}% of kids voted on meals this week!`,
      metricValue: metrics.votingParticipationRate,
      metricLabel: 'participation',
      iconName: 'users',
      colorScheme: 'green',
      priority: priority--,
    });
  }

  // High meal approval
  if (metrics.avgMealApprovalScore >= 75) {
    insights.push({
      insightType: 'engagement_win',
      title: 'Kids Love the Meals!',
      description: `Average meal approval score: ${metrics.avgMealApprovalScore.toFixed(0)}%`,
      metricValue: metrics.avgMealApprovalScore,
      metricLabel: 'approval',
      iconName: 'heart',
      colorScheme: 'green',
      priority: priority--,
    });
  } else if (metrics.avgMealApprovalScore < 50 && metrics.totalVotesCast > 5) {
    insights.push({
      insightType: 'concern',
      title: 'Low Meal Approval',
      description: `Kids gave meals a ${metrics.avgMealApprovalScore.toFixed(0)}% approval rating. Consider adjusting meal choices.`,
      metricValue: metrics.avgMealApprovalScore,
      metricLabel: 'approval',
      iconName: 'alert-triangle',
      colorScheme: 'yellow',
      priority: priority--,
    });
  }

  // Variety win
  if (metrics.newRecipesTried >= 3) {
    insights.push({
      insightType: 'variety_win',
      title: 'Adventurous Eating!',
      description: `You tried ${metrics.newRecipesTried} new recipes this week!`,
      metricValue: metrics.newRecipesTried,
      metricLabel: 'new recipes',
      iconName: 'sparkles',
      colorScheme: 'purple',
      priority: priority--,
    });
  }

  // Recipe diversity
  if (metrics.recipeDiversityScore >= 70) {
    insights.push({
      insightType: 'variety_win',
      title: 'Great Variety!',
      description: `${metrics.recipeDiversityScore.toFixed(0)}% meal diversity this week!`,
      metricValue: metrics.recipeDiversityScore,
      metricLabel: 'diversity',
      iconName: 'shuffle',
      colorScheme: 'purple',
      priority: priority--,
    });
  } else if (metrics.recipeDiversityScore < 40) {
    insights.push({
      insightType: 'suggestion',
      title: 'Add More Variety',
      description: 'Consider trying new recipes to increase meal diversity.',
      metricValue: metrics.recipeDiversityScore,
      metricLabel: 'diversity',
      iconName: 'lightbulb',
      colorScheme: 'yellow',
      priority: priority--,
    });
  }

  // Nutrition win
  if (metrics.nutritionScore >= 85) {
    insights.push({
      insightType: 'nutrition_win',
      title: 'Excellent Nutrition! 🥗',
      description: `Nutrition score: ${metrics.nutritionScore.toFixed(0)}/100. Great macro balance!`,
      metricValue: metrics.nutritionScore,
      metricLabel: 'score',
      iconName: 'check-circle',
      colorScheme: 'green',
      priority: priority--,
    });
  }

  // Grocery efficiency
  if (metrics.groceryCompletionRate >= 90) {
    insights.push({
      insightType: 'efficiency_win',
      title: 'Shopping List Pro! 🛒',
      description: `You purchased ${metrics.groceryCompletionRate.toFixed(0)}% of your grocery list!`,
      metricValue: metrics.groceryCompletionRate,
      metricLabel: 'completed',
      iconName: 'shopping-cart',
      colorScheme: 'blue',
      priority: priority--,
    });
  }

  // Cost estimate
  if (metrics.estimatedGroceryCost > 0) {
    insights.push({
      insightType: 'cost_savings',
      title: 'Grocery Budget',
      description: `Estimated grocery cost this week: $${metrics.estimatedGroceryCost.toFixed(2)}`,
      metricValue: metrics.estimatedGroceryCost,
      metricLabel: 'dollars',
      iconName: 'dollar-sign',
      colorScheme: 'blue',
      priority: priority--,
    });
  }

  // Achievements unlocked
  if (metrics.achievementsUnlocked > 0) {
    insights.push({
      insightType: 'achievement',
      title: 'New Achievements! 🏆',
      description: `Kids unlocked ${metrics.achievementsUnlocked} achievement${metrics.achievementsUnlocked > 1 ? 's' : ''} this week!`,
      metricValue: metrics.achievementsUnlocked,
      metricLabel: 'achievements',
      iconName: 'award',
      colorScheme: 'yellow',
      priority: priority--,
    });
  }

  return insights;
}

function convertMetricsToDbFormat(metrics: ReportMetrics) {
  return {
    meals_planned: metrics.mealsPlanned,
    meals_completed: metrics.mealsCompleted,
    planning_completion_rate: metrics.planningCompletionRate,
    templates_used: metrics.templatesUsed,
    time_saved_minutes: metrics.timeSavedMinutes,
    nutrition_goals_met: metrics.nutritionGoalsMet,
    nutrition_goals_total: metrics.nutritionGoalsTotal,
    avg_calories_per_day: metrics.avgCaloriesPerDay,
    avg_protein_per_day: metrics.avgProteinPerDay,
    avg_carbs_per_day: metrics.avgCarbsPerDay,
    avg_fat_per_day: metrics.avgFatPerDay,
    nutrition_score: metrics.nutritionScore,
    grocery_items_added: metrics.groceryItemsAdded,
    grocery_items_purchased: metrics.groceryItemsPurchased,
    grocery_completion_rate: metrics.groceryCompletionRate,
    estimated_grocery_cost: metrics.estimatedGroceryCost,
    unique_recipes_used: metrics.uniqueRecipesUsed,
    recipe_repeats: metrics.recipeRepeats,
    new_recipes_tried: metrics.newRecipesTried,
    recipe_diversity_score: metrics.recipeDiversityScore,
    kids_voted: metrics.kidsVoted,
    total_kids: metrics.totalKids,
    voting_participation_rate: metrics.votingParticipationRate,
    total_votes_cast: metrics.totalVotesCast,
    avg_meal_approval_score: metrics.avgMealApprovalScore,
    achievements_unlocked: metrics.achievementsUnlocked,
    most_loved_meals: metrics.mostLovedMeals,
    least_loved_meals: metrics.leastLovedMeals,
    most_used_recipes: metrics.mostUsedRecipes,
    healthiest_meals: metrics.healthiestMeals,
  };
}

async function saveInsights(
  supabase: any,
  reportId: string,
  householdId: string,
  insights: Insight[]
) {
  // Delete existing insights for this report
  await supabase
    .from('report_insights')
    .delete()
    .eq('report_id', reportId);

  // Insert new insights
  if (insights.length > 0) {
    const insightRecords = insights.map(insight => ({
      report_id: reportId,
      household_id: householdId,
      insight_type: insight.insightType,
      title: insight.title,
      description: insight.description,
      metric_value: insight.metricValue,
      metric_label: insight.metricLabel,
      icon_name: insight.iconName,
      color_scheme: insight.colorScheme,
      priority: insight.priority,
    }));

    await supabase.from('report_insights').insert(insightRecords);
  }
}

async function saveTrendData(
  supabase: any,
  householdId: string,
  weekStart: string,
  metrics: ReportMetrics
) {
  const trends = [
    { metric_name: 'meals_planned', value: metrics.mealsPlanned },
    { metric_name: 'planning_completion_rate', value: metrics.planningCompletionRate },
    { metric_name: 'nutrition_score', value: metrics.nutritionScore },
    { metric_name: 'voting_participation_rate', value: metrics.votingParticipationRate },
    { metric_name: 'avg_meal_approval_score', value: metrics.avgMealApprovalScore },
    { metric_name: 'recipe_diversity_score', value: metrics.recipeDiversityScore },
    { metric_name: 'grocery_completion_rate', value: metrics.groceryCompletionRate },
  ];

  for (const trend of trends) {
    await supabase.rpc('save_report_trend', {
      p_household_id: householdId,
      p_metric_name: trend.metric_name,
      p_week_start: weekStart,
      p_value: trend.value,
    });
  }
}
