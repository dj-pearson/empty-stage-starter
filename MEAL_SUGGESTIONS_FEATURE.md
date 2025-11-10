# Quick Meal Suggestions Feature

## Overview

The Quick Meal Suggestions feature uses AI (Claude) to provide personalized meal recommendations based on household preferences, past kid votes, available ingredients, and contextual factors. It eliminates decision paralysis by instantly suggesting meals that are likely to be accepted by both parents and kids.

## Business Value

### Key Benefits
- **Reduces Planning Friction**: Instant suggestions eliminate "what should we eat?" paralysis
- **Increases Engagement**: Interactive AI recommendations create delight factor
- **Improves Outcomes**: Data-driven suggestions increase meal acceptance rates
- **Drives Template Usage**: Suggests using templates alongside new recipes
- **Premium Feature**: AI-powered recommendations can be monetized

### Expected Metrics
- **40%** reduction in time to create weekly meal plan
- **25%** increase in kid meal approval scores
- **30%** increase in recipe variety
- **50%** of users try at least one suggestion per week

## Architecture

### Database Schema

**Tables Created:**
1. `meal_suggestions` - AI-generated recommendations with reasoning
2. `suggestion_feedback` - User feedback to improve future recommendations
3. `suggestion_preferences` - Household-specific filters and settings
4. `suggestion_analytics` - Daily metrics on suggestion performance

### AI Suggestion Engine

**Uses Claude 3.5 Sonnet** to analyze:
- Household context (kids, ages, dietary restrictions)
- Past meal votes (kid favorites with >70% approval)
- Recent meals (avoid repetition)
- Pantry items (prioritize available ingredients)
- Time constraints (max prep/cook time)
- Difficulty preferences (easy, medium, hard)
- Seasonal preferences

**Fallback to Smart Ranking** if no AI API key:
- Scoring algorithm based on multiple factors
- Kid favorites: +30 points
- Quick meals (<30 min): +15 points
- Easy difficulty: +10 points
- Variety (not recent): +10 points
- Perfect timing: +15-20 points

## Components

### 1. MealSuggestionCard
Displays individual meal suggestion with AI reasoning.

**Features:**
- Recipe image with confidence score badge
- AI reasoning in highlighted box
- Match factor badges (kid favorite, quick, easy, variety)
- Time, difficulty, predicted approval metrics
- Accept/Reject action buttons

**Usage:**
```tsx
<MealSuggestionCard
  suggestion={suggestion}
  onAccept={(s) => addToPlan(s)}
  onReject={(s) => dismiss(s)}
/>
```

### 2. QuickSuggestionsPanel
Main panel showing all suggestions with generation controls.

**Features:**
- Lists active suggestions (sorted by confidence)
- "Generate Suggestions" button
- Options dialog (meal type filter, count)
- Refresh button for new suggestions
- Empty state with call-to-action

**Usage:**
```tsx
<QuickSuggestionsPanel
  householdId={householdId}
  kids={kids}
  onSuggestionAccepted={() => reloadMealPlan()}
/>
```

## Edge Function

### generate-meal-suggestions
Generates AI-powered meal recommendations.

**Endpoint:** `POST /functions/v1/generate-meal-suggestions`

**Request:**
```json
{
  "householdId": "uuid",
  "mealSlot": "dinner",  // Optional: breakfast, lunch, dinner, snack1
  "date": "2025-11-15",  // Optional: specific date
  "count": 5             // Optional: number of suggestions (default: 5)
}
```

**Response:**
```json
{
  "suggestions": [
    {
      "id": "uuid",
      "recipe_id": "uuid",
      "recipe_name": "Spaghetti Bolognese",
      "reasoning": "Kids love this meal based on past votes. Quick 30-minute meal. Easy to prepare.",
      "confidence_score": 92,
      "predicted_kid_approval": 87,
      "match_factors": ["kid_favorite", "quick", "easy_to_make"],
      "estimated_prep_time": 10,
      "estimated_cook_time": 20,
      "difficulty": "easy"
    }
  ],
  "count": 5,
  "context": {
    "totalRecipes": 87,
    "recentRecipesExcluded": 12,
    "kidFavoritesAvailable": 8
  }
}
```

**Process:**
1. Gather household context (preferences, votes, pantry)
2. Filter eligible recipes (exclude recent, apply filters)
3. Use Claude AI or smart ranking to score recipes
4. Save top N suggestions to database
5. Update analytics

## Database Functions

### accept_meal_suggestion()
Accepts suggestion and creates plan entries for all kids.

```sql
SELECT accept_meal_suggestion(
  p_suggestion_id := 'suggestion-uuid',
  p_kid_ids := ARRAY['kid1-uuid', 'kid2-uuid']
);
```

### reject_meal_suggestion()
Rejects suggestion with feedback for learning.

```sql
SELECT reject_meal_suggestion(
  p_suggestion_id := 'suggestion-uuid',
  p_feedback_type := 'not_interested',  -- or 'too_complex', 'missing_ingredients', etc.
  p_feedback_text := 'Optional detailed feedback'
);
```

### get_recent_recipe_ids()
Returns recipe IDs used in last N days for variety checking.

### get_kid_favorite_recipes()
Returns recipes with high kid approval scores (>70%).

## Integration Guide

### Step 1: Add to Dashboard

```tsx
import { QuickSuggestionsPanel } from '@/components/QuickSuggestionsPanel';

function Dashboard() {
  const { householdId, kids } = useHousehold();

  return (
    <div className="container py-6">
      <QuickSuggestionsPanel
        householdId={householdId}
        kids={kids}
        onSuggestionAccepted={() => {
          // Reload meal plan
          queryClient.invalidateQueries(['meal-plan']);
          toast.success('Added to meal plan!');
        }}
      />
    </div>
  );
}
```

### Step 2: Configure AI (Optional)

Set `ANTHROPIC_API_KEY` environment variable in Supabase:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

If not set, system falls back to smart ranking algorithm.

### Step 3: Set User Preferences

```tsx
async function savePreferences(preferences) {
  await supabase.from('suggestion_preferences').upsert({
    household_id: householdId,
    user_id: userId,
    dietary_restrictions: ['vegetarian', 'gluten_free'],
    max_prep_time: 30,
    prefer_quick_meals: true,
    prioritize_kid_favorites: true,
    avoid_recent_recipes: true,
    recent_recipe_window_days: 14,
  });
}
```

## User Flows

### Flow 1: Manual Generation
1. Parent opens meal planning dashboard
2. Clicks "Generate Suggestions"
3. AI analyzes household context (2-3 seconds)
4. Shows 5 personalized suggestions with reasoning
5. Parent clicks "Add to Plan" on favorite
6. Meal added to calendar for all kids
7. Suggestion marked as accepted

### Flow 2: Reviewing Suggestions
1. Parent sees suggestion card
2. Reads AI reasoning: "Kids love this meal based on past votes. Quick 30-minute meal."
3. Checks match factors: Kid Favorite, Quick, Easy
4. Sees 92% confidence, 87% predicted approval
5. Decides to accept or reject

### Flow 3: Rejecting with Feedback
1. Parent clicks "Not Interested"
2. Suggestion marked as rejected
3. Feedback recorded for AI learning
4. Won't suggest similar meals in future

## Testing Checklist

### Database
- [ ] Migration runs successfully
- [ ] All tables and indexes created
- [ ] RLS policies prevent cross-household access
- [ ] Functions work correctly

### Edge Function
- [ ] Generates suggestions with household context
- [ ] AI integration works (if API key set)
- [ ] Smart ranking fallback works
- [ ] Saves suggestions to database
- [ ] Handles errors gracefully

### Components
- [ ] MealSuggestionCard displays correctly
- [ ] QuickSuggestionsPanel loads suggestions
- [ ] Accept adds meal to plan
- [ ] Reject removes suggestion
- [ ] Generate button works
- [ ] Options dialog allows filtering

### Edge Cases
- [ ] Household with no kids
- [ ] No eligible recipes
- [ ] All recipes recently used
- [ ] AI API timeout/failure
- [ ] No pantry items

## Deployment

### 1. Run Migration
```bash
supabase db push
```

### 2. Deploy Function
```bash
supabase functions deploy generate-meal-suggestions
```

### 3. Set AI Key (Optional)
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Test Generation
```bash
curl -X POST \
  'YOUR_URL/functions/v1/generate-meal-suggestions' \
  -H 'Authorization: Bearer TOKEN' \
  -d '{"householdId": "uuid", "count": 5}'
```

## Performance

### Optimization
- Limits recipe query to 100 most relevant
- Filters in database before AI analysis
- Caches suggestions for 7 days (expires_at)
- Smart ranking fallback for speed

### Scaling
- AI calls: ~2-3 seconds per request
- Smart ranking: <500ms per request
- Supports thousands of concurrent households
- Consider rate limiting for AI API

## Troubleshooting

### No Suggestions Generated
1. Check recipes exist in database
2. Verify household has preferences
3. Check recent_recipe_window not too restrictive
4. Review edge function logs

### AI Not Working
1. Verify ANTHROPIC_API_KEY is set
2. Check API key is valid
3. Review function logs for errors
4. Fallback to smart ranking should activate

### Low Quality Suggestions
1. Increase kid vote data
2. Adjust confidence thresholds
3. Review feedback patterns
4. Tune scoring algorithm

## Future Enhancements

### Phase 2
- [ ] Automated daily suggestions
- [ ] "Surprise me" mode (random high-confidence pick)
- [ ] Batch suggestions for entire week
- [ ] Suggestion scheduling (generate every Monday)

### Phase 3
- [ ] Learning from rejected suggestions
- [ ] Explain why suggestions were made (expanded reasoning)
- [ ] Compare suggestions side-by-side
- [ ] Save favorite suggestions as templates
- [ ] Social suggestions (what similar households are eating)

## License

Internal use only - TryEatPal Meal Planning App
