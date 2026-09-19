-- US-707: the activation half of the conversion funnel.
--
-- funnel_events held landing_view (2020 rows), quiz_start (157), quiz_complete
-- (41) and signup (29), and then stopped. Everything after an account exists --
-- did they finish setup, add a child, put a food in the pantry, plan a meal --
-- went to GA4 through analytics.trackEvent, which carries no id that joins back
-- to Supabase. So "of the people who signed up, how many ever planned a meal"
-- was a question the data could not answer.
--
-- THERE IS NOTHING TO EXTEND ON THE TABLE, and the story's acceptance criterion
-- assumed otherwise. funnel_events.event_type is plain TEXT: no CHECK
-- constraint, no enum, only a comment on the column listing the values
-- (20260205000000_conversion_funnel_tracking.sql:38). A new event type is
-- therefore insertable today, by this client and by any older one, with no
-- migration at all -- which also means the backward-compatibility question the
-- criterion raises does not arise. Adding a CHECK now is deliberately NOT done:
-- it would be a tightening constraint against rows already in the table, which
-- is on this repo's never-in-one-migration list, and it would buy a guarantee
-- nothing currently depends on.
--
-- What IS real is the reporting view, which enumerates the seven acquisition
-- types and would silently ignore the six new ones. CREATE OR REPLACE VIEW
-- keeps the existing columns in their existing order and appends -- so an older
-- client selecting landing_views or overall_conversion_rate reads exactly what
-- it read before.
--
-- The activation columns count DISTINCT user_id, not rows. An acquisition event
-- is one per visit and adding them up is the number you want; activation asks
-- whether an ACCOUNT was ever used, so the same arithmetic gives the wrong
-- answer. src/lib/activationFunnel.ts also fires each of these at most once per
-- user per device, but that marker is per browser and cannot be relied on -- a
-- parent who adds their first food on a phone and again on a laptop writes two
-- rows. Counting distinct users makes the figure correct regardless.

CREATE OR REPLACE VIEW conversion_funnel_summary AS
SELECT
  date_trunc('day', created_at)::date AS date,
  COUNT(*) FILTER (WHERE event_type = 'landing_view') AS landing_views,
  COUNT(*) FILTER (WHERE event_type = 'quiz_start') AS quiz_starts,
  COUNT(*) FILTER (WHERE event_type = 'quiz_complete') AS quiz_completes,
  COUNT(*) FILTER (WHERE event_type = 'email_capture') AS email_captures,
  COUNT(*) FILTER (WHERE event_type = 'signup') AS signups,
  COUNT(*) FILTER (WHERE event_type = 'trial_start') AS trial_starts,
  COUNT(*) FILTER (WHERE event_type = 'paid_conversion') AS paid_conversions,
  -- Conversion rates
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'landing_view') > 0
    THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'quiz_start')::DECIMAL /
                COUNT(*) FILTER (WHERE event_type = 'landing_view')) * 100, 2)
    ELSE 0
  END AS landing_to_quiz_rate,
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'quiz_start') > 0
    THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'quiz_complete')::DECIMAL /
                COUNT(*) FILTER (WHERE event_type = 'quiz_start')) * 100, 2)
    ELSE 0
  END AS quiz_completion_rate,
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'quiz_complete') > 0
    THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'email_capture')::DECIMAL /
                COUNT(*) FILTER (WHERE event_type = 'quiz_complete')) * 100, 2)
    ELSE 0
  END AS email_capture_rate,
  CASE WHEN COUNT(*) FILTER (WHERE event_type = 'landing_view') > 0
    THEN ROUND((COUNT(*) FILTER (WHERE event_type = 'paid_conversion')::DECIMAL /
                COUNT(*) FILTER (WHERE event_type = 'landing_view')) * 100, 2)
    ELSE 0
  END AS overall_conversion_rate,
  -- US-707, appended: the activation steps, by distinct account.
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'onboarding_start') AS onboarding_starts,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'onboarding_complete') AS onboarding_completes,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'onboarding_skip') AS onboarding_skips,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'child_created') AS children_created,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'food_added') AS foods_added,
  COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'meal_planned') AS meals_planned
FROM funnel_events
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY date_trunc('day', created_at)::date
ORDER BY date DESC;

COMMENT ON VIEW conversion_funnel_summary IS
  'Daily conversion funnel. The acquisition columns count events; the activation columns (US-707) count distinct user_id, because an account is activated once however many foods it adds.';

-- The column comment is the only place the vocabulary is written down, so it is
-- the place that goes stale. Keep it current with FunnelEventType in
-- src/lib/conversion-tracking.ts.
COMMENT ON COLUMN funnel_events.event_type IS
  'Acquisition: landing_view, quiz_start, quiz_complete, email_capture, signup, trial_start, paid_conversion. Activation (US-707, once per user): onboarding_start, onboarding_complete, onboarding_skip, child_created, food_added, meal_planned. Plain TEXT with no CHECK on purpose -- see 20260918000005.';

GRANT SELECT ON conversion_funnel_summary TO authenticated;
