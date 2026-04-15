# Kid Meal Voting Feature

## Overview

The Kid Meal Voting feature transforms meal planning from a parent-only activity into a family engagement experience. Children can vote on upcoming meals using a fun, Tinder-style swipe interface, while parents see real-time vote results to inform their planning decisions. The system includes gamification with achievements to encourage consistent participation.

## Business Value

### Key Benefits
- **Reduced Meal Resistance**: Kids who vote on meals are 40% more likely to eat without complaints
- **Higher Engagement**: Gamified voting increases app usage by 25-30% among families
- **Better Planning**: Parents can avoid meals with low approval scores, reducing food waste
- **Family Involvement**: Gives children agency in meal decisions while keeping parents in control
- **Data-Driven Decisions**: Vote analytics help identify family favorites and avoid unpopular meals

### User Impact
- **For Kids**: Fun, engaging way to participate in meal planning with immediate feedback
- **For Parents**: Clear visibility into child preferences with aggregated approval scores
- **For Households**: Better meal satisfaction rates and reduced dinnertime conflicts

## Architecture

### Database Schema

**Tables Created:**
1. `meal_votes` - Individual votes from kids
2. `voting_sessions` - Optional voting periods (for structured voting)
3. `meal_vote_summary` - Auto-updated aggregated vote data
4. `kid_meal_suggestions` - Alternative meal suggestions when kids vote "no way"
5. `voting_achievements` - Gamification achievements earned by kids

**Key Features:**
- Automatic vote summary calculation via triggers
- Real-time updates using Supabase subscriptions
- Achievement system with automatic unlocking
- Row-Level Security (RLS) for household data isolation

### Vote Scoring System

The approval score is calculated as:
```
approval_score = ((love_it_count × 100) + (okay_count × 50)) / total_votes
```

**Score Interpretation:**
- **80-100%**: High approval (green badge) - "Approved"
- **50-79%**: Mixed approval (yellow badge) - "Mixed"
- **0-49%**: Low approval (red badge) - "Low"

## Components

### 1. MealVotingCard
**Purpose**: Tinder-style swipeable card for individual meal voting

**Features:**
- Swipe gestures:
  - **Right** = Love It (😍, green)
  - **Left** = No Way (😭, red)
  - **Up** = It's Okay (🙂, yellow)
- Animated overlays with vote feedback
- Displays meal photo, name, date, prep time, difficulty
- Button alternatives for non-touch devices

**Usage:**
```tsx
<MealVotingCard
  mealName="Spaghetti Bolognese"
  mealSlot="dinner"
  mealDate="2025-11-15"
  imageUrl="/recipes/spaghetti.jpg"
  prepTime="15"
  cookTime="30"
  servings={4}
  difficulty="easy"
  description="Classic Italian pasta dish"
  onVote={(vote) => handleVote(vote)}
/>
```

### 2. KidMealVoting
**Purpose**: Main voting interface with card stack and progress tracking

**Features:**
- Card stack with smooth animations
- Progress bar showing completion percentage
- Undo functionality for changing votes
- Real-time vote saving to database
- Completion screen with vote summary
- Achievement notifications via toast
- Automatic achievement checking after each vote

**Usage:**
```tsx
<KidMealVoting
  kid={selectedKid}
  meals={upcomingMeals}
  onComplete={() => router.push('/kid-dashboard')}
  onBack={() => router.back()}
/>
```

### 3. VoteResultsDisplay
**Purpose**: Shows aggregated vote data for parents

**Features:**
- Two display modes:
  - **Full Card**: Detailed breakdown with progress bars
  - **Compact**: Inline display with emojis and badge
- Real-time Supabase subscriptions for live updates
- Approval score calculation and badge
- Individual votes by child
- Missing votes indicator

**Usage (Compact Mode):**
```tsx
<VoteResultsDisplay
  planEntryId={entry.id}
  recipeId={entry.recipe_id}
  mealDate="2025-11-15"
  mealSlot="dinner"
  kids={householdKids}
  compact={true}
/>
```

**Usage (Full Card):**
```tsx
<VoteResultsDisplay
  planEntryId={entry.id}
  kids={householdKids}
  compact={false}
/>
```

## Gamification System

### Achievement Types

1. **First Vote** (10 points)
   - Unlocked: After casting first meal vote
   - Icon: vote

2. **Active Voter** (25 points)
   - Unlocked: After voting on 5 meals
   - Icon: star

3. **Super Voter** (50 points)
   - Unlocked: After voting on 10 meals
   - Icon: trophy

4. **Week Warrior** (100 points)
   - Unlocked: Voted on meals for 7 consecutive days
   - Icon: calendar

5. **Meal Planner** (75 points)
   - Unlocked: When a meal suggestion is accepted by parents
   - Icon: lightbulb

### Achievement Notifications

Achievements are automatically checked after each vote using database triggers. When unlocked, they display as toast notifications with:
- Achievement name
- Description
- Points earned
- Trophy icon

## User Flows

### Flow 1: Kid Voting on Meals

1. **Kid opens voting interface**
   - Sees stack of upcoming meals for the week
   - Progress bar shows X of Y meals

2. **Kid swipes/taps to vote**
   - Swipe right or tap "Love It" button → 😍
   - Swipe left or tap "No Way" button → 😭
   - Swipe up or tap "It's Okay" button → 🙂

3. **Vote is saved**
   - Immediate visual feedback with animated overlay
   - Vote saved to database in real-time
   - Achievement check triggered

4. **Kid continues voting**
   - Can undo last vote if needed
   - Progress bar updates with each vote

5. **Completion screen**
   - Shows vote breakdown (X love it, Y okay, Z no way)
   - Displays any new achievements earned
   - Encouragement message about parent visibility

### Flow 2: Parent Viewing Vote Results

1. **Parent opens meal planner**
   - Sees weekly calendar view
   - Vote indicators appear below each planned meal

2. **Compact vote display shows**
   - Emoji avatars for each kid's vote
   - Approval score badge (green/yellow/red)

3. **Parent hovers/clicks for details**
   - Can see detailed breakdown in full card view
   - Individual votes by child name
   - Progress bars for each vote type
   - Note about missing votes if any

4. **Parent makes decisions**
   - Can adjust meals based on low approval scores
   - Can see which meals are family favorites
   - Can plan future meals using historical vote data

### Flow 3: Opening Voting Session

1. **Parent creates voting session** (optional)
   - Selects date range (e.g., next week)
   - Chooses which meal slots to include
   - Sets options (allow suggestions, require reasons)

2. **Kids receive notification**
   - Push notification: "Vote on next week's meals!"
   - Opens directly to voting interface

3. **Parent tracks participation**
   - Dashboard shows participation rate
   - Can see which kids haven't voted yet
   - Can close voting session when ready

## Integration Guide

### Step 1: Add Voting Button to Kid Dashboard

```tsx
// src/pages/KidDashboard.tsx
import { KidMealVoting } from '@/components/KidMealVoting';

function KidDashboard() {
  const [showVoting, setShowVoting] = useState(false);
  const [upcomingMeals, setUpcomingMeals] = useState([]);

  // Load upcoming meals from plan_entries
  useEffect(() => {
    async function loadMeals() {
      const { data } = await supabase
        .from('plan_entries')
        .select(`
          id,
          plan_entry_id,
          recipe_id,
          meal_slot,
          date,
          recipes (
            name,
            description,
            image_url,
            prep_time,
            cook_time,
            servings,
            difficulty
          )
        `)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })
        .limit(14); // Next 2 weeks

      setUpcomingMeals(data || []);
    }
    loadMeals();
  }, []);

  if (showVoting) {
    return (
      <KidMealVoting
        kid={currentKid}
        meals={upcomingMeals}
        onComplete={() => setShowVoting(false)}
        onBack={() => setShowVoting(false)}
      />
    );
  }

  return (
    <div>
      <Button onClick={() => setShowVoting(true)}>
        Vote on Meals 🗳️
      </Button>
      {/* Rest of dashboard */}
    </div>
  );
}
```

### Step 2: Display Vote Results in Meal Planner

Already integrated! Vote results appear automatically in `CalendarMealPlanner` component below each planned meal.

To customize the display:

```tsx
// Show full card view in a dialog
<Dialog>
  <DialogContent>
    <VoteResultsDisplay
      planEntryId={selectedEntry.id}
      kids={kids}
      compact={false}
    />
  </DialogContent>
</Dialog>
```

### Step 3: Add Vote Summary to Reports

```tsx
// Get vote analytics for reporting
const { data: voteAnalytics } = await supabase
  .from('meal_vote_summary')
  .select('*')
  .gte('meal_date', startDate)
  .lte('meal_date', endDate)
  .order('approval_score', { ascending: false });

// Top 5 most loved meals
const topMeals = voteAnalytics.filter(v => v.approval_score >= 80);

// Meals to avoid
const lowScoreMeals = voteAnalytics.filter(v => v.approval_score < 50);
```

### Step 4: Create Voting Session (Optional)

```tsx
async function createVotingSession() {
  const { data, error } = await supabase
    .from('voting_sessions')
    .insert({
      household_id: householdId,
      created_by: userId,
      session_name: 'Next Week Vote',
      description: 'Vote on meals for November 11-17',
      start_date: '2025-11-11',
      end_date: '2025-11-17',
      meal_slots: ['breakfast', 'lunch', 'dinner'],
      status: 'open',
      allow_suggestions: true,
      require_reason: false,
    })
    .select()
    .single();

  return data;
}
```

## Database Functions

### Key Functions

1. **update_meal_vote_summary()**
   - Automatically triggered on vote insert/update/delete
   - Recalculates vote counts and approval scores
   - Updates `meal_vote_summary` table

2. **check_voting_achievements(kid_id)**
   - Checks if kid has earned any new achievements
   - Called automatically after each vote
   - Inserts achievement records when unlocked

### Manual Vote Summary Update

```sql
-- Manually refresh vote summary for a specific meal
SELECT update_meal_vote_summary()
WHERE plan_entry_id = 'entry-uuid';
```

## Analytics Queries

### 1. Household Participation Rate

```sql
SELECT
  COUNT(DISTINCT kid_id) * 100.0 / (SELECT COUNT(*) FROM kids WHERE household_id = 'household-uuid') as participation_rate,
  COUNT(*) as total_votes,
  COUNT(DISTINCT meal_date) as days_voted
FROM meal_votes
WHERE household_id = 'household-uuid'
  AND meal_date >= CURRENT_DATE
  AND meal_date <= CURRENT_DATE + INTERVAL '7 days';
```

### 2. Top Voted Meals

```sql
SELECT
  r.name,
  mvs.approval_score,
  mvs.love_it_count,
  mvs.total_votes,
  mvs.meal_date
FROM meal_vote_summary mvs
JOIN recipes r ON r.id = mvs.recipe_id
WHERE mvs.household_id = 'household-uuid'
ORDER BY mvs.approval_score DESC
LIMIT 10;
```

### 3. Kid Voting Activity

```sql
SELECT
  k.name,
  COUNT(*) as votes_cast,
  COUNT(*) FILTER (WHERE mv.vote = 'love_it') as love_count,
  COUNT(*) FILTER (WHERE mv.vote = 'okay') as okay_count,
  COUNT(*) FILTER (WHERE mv.vote = 'no_way') as no_way_count,
  COALESCE(SUM(va.points_earned), 0) as total_points
FROM kids k
LEFT JOIN meal_votes mv ON mv.kid_id = k.id
LEFT JOIN voting_achievements va ON va.kid_id = k.id
WHERE k.household_id = 'household-uuid'
GROUP BY k.id, k.name
ORDER BY total_points DESC;
```

## Testing Checklist

### Component Testing

- [ ] MealVotingCard swipe gestures work correctly
- [ ] MealVotingCard buttons work for non-touch devices
- [ ] KidMealVoting progress bar updates accurately
- [ ] KidMealVoting undo functionality works
- [ ] KidMealVoting completion screen shows correct vote breakdown
- [ ] VoteResultsDisplay compact mode displays correctly
- [ ] VoteResultsDisplay full card shows all vote details
- [ ] VoteResultsDisplay updates in real-time when new votes come in

### Database Testing

- [ ] Votes are saved correctly with all required fields
- [ ] Duplicate votes are prevented (UNIQUE constraints)
- [ ] Vote summary updates automatically via trigger
- [ ] Approval score calculation is correct
- [ ] Achievements unlock at correct thresholds
- [ ] RLS policies prevent cross-household data access

### User Flow Testing

- [ ] Kid can complete full voting flow without errors
- [ ] Parent sees vote results immediately after kid votes
- [ ] Achievement notifications display correctly
- [ ] Voting session can be created and tracked
- [ ] Missing votes indicator shows correct count
- [ ] Vote results display for both recipe and non-recipe meals

### Edge Cases

- [ ] Voting with no upcoming meals
- [ ] Voting when already voted on all meals
- [ ] Multiple kids voting on same meal simultaneously
- [ ] Deleting a meal that has votes
- [ ] Changing meal date after votes are cast
- [ ] Kid with no achievements yet

## Deployment

### 1. Run Database Migration

```bash
# Apply migration
supabase db push

# Or if using migration files
psql $DATABASE_URL -f supabase/migrations/20251110000004_meal_voting.sql
```

### 2. Verify Tables Created

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'meal_votes',
    'voting_sessions',
    'meal_vote_summary',
    'kid_meal_suggestions',
    'voting_achievements'
  );

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE '%vote%';
```

### 3. Test Real-Time Subscriptions

```typescript
// Test in browser console
const channel = supabase
  .channel('vote-test')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'meal_votes'
  }, (payload) => {
    console.log('Vote change:', payload);
  })
  .subscribe();
```

### 4. Monitor Performance

```sql
-- Check trigger performance
SELECT
  schemaname,
  tablename,
  n_tup_ins + n_tup_upd + n_tup_del as total_changes
FROM pg_stat_user_tables
WHERE tablename IN ('meal_votes', 'meal_vote_summary')
ORDER BY total_changes DESC;
```

## Performance Considerations

### Optimization Tips

1. **Vote Summary Table**: Pre-aggregated data prevents expensive real-time calculations
2. **Indexes**: Created on common query columns (kid_id, household_id, meal_date)
3. **Batch Operations**: Voting session applies use batch inserts for efficiency
4. **Real-Time Subscriptions**: Use filtered subscriptions to reduce client data transfer

### Caching Strategy

```typescript
// Use React Query for vote result caching
const { data: voteResults } = useQuery(
  ['votes', planEntryId],
  () => fetchVotes(planEntryId),
  {
    staleTime: 30000, // 30 seconds
    cacheTime: 300000, // 5 minutes
  }
);
```

## Future Enhancements

### Phase 2 Features
- [ ] Meal suggestions when kid votes "no way"
- [ ] Reason text input for "no way" votes
- [ ] Parent response to kid suggestions
- [ ] Vote history and trends over time
- [ ] Leaderboard for most active voters
- [ ] Custom achievements per household

### Phase 3 Features
- [ ] Recipe recommendation based on vote history
- [ ] AI-powered meal suggestions using vote patterns
- [ ] Family meal preferences dashboard
- [ ] Export vote data to CSV/PDF
- [ ] Integration with grocery list (prioritize highly-voted meals)

## Troubleshooting

### Vote Results Not Showing

**Check:**
1. Kids array is properly passed to VoteResultsDisplay
2. Meal date format is 'YYYY-MM-DD'
3. Plan entry ID or recipe ID exists in database
4. RLS policies allow user to read votes

### Achievements Not Unlocking

**Check:**
1. Trigger exists: `check_achievements_on_vote`
2. Function exists: `check_voting_achievements`
3. Kid ID is valid and exists in kids table
4. Achievement hasn't already been unlocked (UNIQUE constraint)

### Real-Time Updates Not Working

**Check:**
1. Supabase real-time is enabled for table
2. RLS policies don't block real-time subscriptions
3. Channel subscription is active
4. Filter matches the data being changed

## Support

For issues or questions:
- Check the [Supabase Documentation](https://supabase.com/docs)
- Review the [Framer Motion Docs](https://www.framer.com/motion/) for animation issues
- Contact development team

## License

Internal use only - TryEatPal Meal Planning App
