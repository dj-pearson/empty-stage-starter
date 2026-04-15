# Automated Weekly Reports Feature

## Overview

The Automated Weekly Reports feature provides parents with comprehensive weekly summaries of their meal planning activities, nutrition tracking, kid engagement, and household efficiency metrics. Reports are automatically generated on a schedule and include actionable insights, trend comparisons, and personalized recommendations.

## Business Value

### Key Benefits
- **Increased Retention**: Regular touchpoints keep users engaged (15-20% retention improvement expected)
- **Value Demonstration**: Quantifies time saved, money spent, and family health metrics
- **Behavior Change**: Insights and trends motivate continued use and improvement
- **Engagement Driver**: Notifications bring users back to the app weekly
- **Premium Feature**: Can be positioned as a premium/paid feature for monetization

### Expected Metrics
- **15-20%** improvement in user retention
- **30%** increase in weekly active users
- **50%** of users view reports within 24 hours
- **25%** increase in template usage after seeing time-saved metrics

## Architecture

### Database Schema

**Tables Created:**
1. `weekly_reports` - Comprehensive weekly summaries with all metrics
2. `report_insights` - Individual insights and achievements
3. `report_preferences` - User preferences for generation and delivery
4. `report_trends` - Historical metric data for trend analysis

### Metrics Tracked (40+ Data Points)

**Planning**: Meals planned/completed, completion rate, templates used, time saved
**Nutrition**: Average macros per day, nutrition score (0-100)
**Grocery**: Items added/purchased, completion rate, estimated cost
**Recipes**: Unique recipes, repeats, new tried, diversity score
**Kids**: Participation rate, approval score, votes cast, achievements
**Top Performers**: Most/least loved meals, most used recipes

## Components

### 1. WeeklyReportCard
Displays comprehensive weekly report with metrics and insights.

**Usage:**
```tsx
<WeeklyReportCard
  report={weeklyReport}
  insights={reportInsights}
  detailed={true}
  onMarkViewed={(id) => markReportViewed(id)}
/>
```

**Features:**
- Two modes: detailed (full) and summary (highlights)
- Color-coded insights with icons
- Progress bars for completion rates
- Expandable metric sections

### 2. ReportHistory
Shows list of past reports and allows manual generation.

**Usage:**
```tsx
<ReportHistory
  householdId={currentHouseholdId}
  className="max-w-4xl mx-auto"
/>
```

**Features:**
- Last 12 weeks of reports
- "Generate This Week" button
- Report summary cards
- Dialog for full report view
- New report badges

## Edge Functions

### 1. generate-weekly-report
Generates comprehensive report for a household.

**Endpoint:** `POST /functions/v1/generate-weekly-report`

**Request:**
```json
{
  "householdId": "uuid",
  "weekStartDate": "2025-11-04"  // Optional
}
```

**Process:**
1. Calculate week dates (Monday-Sunday)
2. Query all relevant tables (plan_entries, meal_votes, grocery_list, etc.)
3. Calculate 40+ metrics
4. Generate 10+ insight types based on thresholds
5. Save report and insights
6. Save trend data for historical comparison

**Insights Generated:**
- Perfect Week (100% completion)
- Time Saved (template usage)
- High Kid Participation (>80%)
- High/Low Meal Approval
- New Recipes Tried (>3)
- Recipe Variety (diversity score)
- Nutrition Excellence (>85 score)
- Grocery Efficiency (>90% completion)
- Achievements Unlocked

### 2. schedule-weekly-reports
Automated scheduler for all households.

**Endpoint:** `POST /functions/v1/schedule-weekly-reports`

**Process:**
1. Get current day of week
2. Query households with auto-generation enabled
3. Generate reports for each household
4. Send notifications (email/push) if enabled
5. Mark reports as 'sent'
6. Return summary of results

## Integration Guide

### Step 1: Add to Dashboard

```tsx
import { ReportHistory } from '@/components/ReportHistory';

function Dashboard() {
  const { householdId } = useHousehold();

  return (
    <div className="container py-6">
      <h1 className="text-3xl font-bold mb-6">Weekly Reports</h1>
      <ReportHistory householdId={householdId} />
    </div>
  );
}
```

### Step 2: Set Up Cron Job

```sql
-- Schedule for every Monday at 9 AM
SELECT cron.schedule(
  'generate-weekly-reports',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'YOUR_SUPABASE_URL/functions/v1/schedule-weekly-reports',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

**Verify Cron:**
```sql
SELECT * FROM cron.job WHERE jobname = 'generate-weekly-reports';

-- View execution history
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'generate-weekly-reports')
ORDER BY start_time DESC LIMIT 10;
```

### Step 3: Configure Preferences

```tsx
async function saveReportPreferences(preferences) {
  await supabase.from('report_preferences').upsert({
    household_id: householdId,
    user_id: userId,
    auto_generate: preferences.autoGenerate,
    generation_day: preferences.generationDay,
    email_delivery: preferences.emailDelivery,
    push_notification: preferences.pushNotification,
    summary_level: preferences.summaryLevel,
  });
}
```

### Step 4: Handle Notifications

```tsx
function handleNotification(notification) {
  if (notification.data.type === 'weekly_report') {
    router.push(`/reports?view=${notification.data.reportId}`);
  }
}
```

## User Flows

### Flow 1: Automatic Report Generation
1. Monday 9 AM: Cron triggers schedule-weekly-reports
2. System generates reports for all households with auto-generation enabled
3. Push notification sent: "📊 Your Weekly Meal Report is Ready!"
4. Parent taps notification → Opens app to reports page
5. Views full report with insights
6. Report marked as 'viewed'

### Flow 2: Manual Generation
1. Parent opens Reports page
2. Clicks "Generate This Week"
3. Report generated and list refreshes
4. New report shows with "New" badge
5. Automatically opens full report dialog

### Flow 3: Historical Review
1. Parent browses report history (last 12 weeks)
2. Clicks on past report
3. Dialog shows full details
4. Compares trends week-over-week

## Analytics Queries

### Report Engagement
```sql
SELECT
  COUNT(*) as total_reports,
  COUNT(*) FILTER (WHERE viewed_at IS NOT NULL) as viewed,
  (COUNT(*) FILTER (WHERE viewed_at IS NOT NULL)::float / COUNT(*)) * 100 as view_rate,
  AVG(EXTRACT(EPOCH FROM (viewed_at - generated_at)) / 3600) as avg_hours_to_view
FROM weekly_reports
WHERE generated_at >= now() - INTERVAL '3 months';
```

### Top Households
```sql
SELECT
  wr.household_id,
  AVG(wr.planning_completion_rate) as avg_completion,
  AVG(wr.nutrition_score) as avg_nutrition,
  AVG(wr.voting_participation_rate) as avg_participation
FROM weekly_reports wr
WHERE wr.week_start_date >= now() - INTERVAL '4 weeks'
GROUP BY wr.household_id
HAVING COUNT(*) >= 3
ORDER BY avg_completion DESC LIMIT 10;
```

### Metric Trends
```sql
SELECT
  metric_name,
  week_start_date,
  AVG(metric_value) as avg_value
FROM report_trends
WHERE household_id = 'uuid'
  AND metric_name IN ('nutrition_score', 'voting_participation_rate')
GROUP BY metric_name, week_start_date
ORDER BY week_start_date DESC;
```

## Testing Checklist

### Database
- [ ] Migration runs successfully
- [ ] All tables created with correct schema
- [ ] RLS policies prevent cross-household access
- [ ] Unique constraints work
- [ ] Foreign keys enforced

### Edge Functions
- [ ] generate-weekly-report creates report
- [ ] All metrics calculated correctly
- [ ] Insights generated based on thresholds
- [ ] Duplicate weeks update instead of error
- [ ] schedule-weekly-reports processes multiple households
- [ ] Notifications queued when enabled

### Components
- [ ] WeeklyReportCard displays correctly
- [ ] Detailed vs summary modes work
- [ ] ReportHistory loads past reports
- [ ] "Generate This Week" button works
- [ ] Loading states appear
- [ ] Viewing marks report as viewed

### Edge Cases
- [ ] Household with no activity
- [ ] Household with no kids
- [ ] Week with zero meals
- [ ] Regenerating same week
- [ ] Concurrent generation requests

## Deployment

### 1. Run Migration
```bash
supabase db push
```

### 2. Deploy Functions
```bash
supabase functions deploy generate-weekly-report
supabase functions deploy schedule-weekly-reports
```

### 3. Set Up Cron
```sql
-- See "Step 2: Set Up Cron Job" above
```

### 4. Test Manually
```bash
curl -X POST \
  'YOUR_URL/functions/v1/generate-weekly-report' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"householdId": "uuid"}'
```

### 5. Monitor
```sql
-- Check cron execution
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'generate-weekly-reports')
ORDER BY start_time DESC LIMIT 20;
```

## Performance

### Optimization
- Indexes on household_id, dates, status
- JSON columns for flexible data (top meals, insights)
- Separate trends table to avoid bloat
- Sequential processing to avoid overwhelming DB

### Scaling
- **1,000 households**: Current setup handles easily (~5-10 min)
- **10,000+ households**: Consider batching (1,000/minute) or queue system

## Troubleshooting

### Reports Not Generating
1. Check cron job is active
2. Verify edge function deployed
3. Check report_preferences has auto_generate=true
4. Review cron.job_run_details for errors

### Missing Data
1. Verify plan_entries exist for household
2. Check date range (Monday-Sunday)
3. Review edge function logs

### Performance Issues
1. Check indexes created
2. Monitor query execution time
3. Review number of households processed

## Future Enhancements

### Phase 2
- Compare with other households (benchmarking)
- Export to PDF
- Email delivery with HTML formatting
- Custom date ranges
- Goal setting and tracking
- Weekly challenges

### Phase 3
- AI-powered recommendations
- Predictive analytics
- Social sharing
- Household leaderboards
- Fitness tracker integration

## License

Internal use only - TryEatPal Meal Planning App
