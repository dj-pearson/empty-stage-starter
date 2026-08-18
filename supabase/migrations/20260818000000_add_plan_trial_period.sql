-- US-630: make the advertised free trial real.
--
-- Landing.tsx and Pricing.tsx have said "Start Free Trial" / "Free trial
-- available" while create-checkout built a plain mode:'subscription' session
-- with no trial configuration at all. Unless a trial was set on the Stripe
-- Price out of band, every one of those buttons charged the card on click.
--
-- Trial length is data, not code: it lives per plan so it can be changed
-- without a deploy, and so a plan can opt out by leaving it NULL.
--
-- Additive per CLAUDE.md: a new NULLABLE column on an existing table. Shipped
-- iOS builds select * from subscription_plans and ignore unknown keys, so
-- nothing in the field breaks.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS trial_period_days INTEGER;

COMMENT ON COLUMN public.subscription_plans.trial_period_days IS
  'Free-trial length in days applied at checkout. NULL or 0 means no trial. '
  'Read by supabase/functions/create-checkout; surfaced in pricing copy. '
  'Changing this changes what customers are promised, so keep the ROSCA '
  'disclosure on the CTA in step with it.';

-- Paid plans get a trial; the Free plan never reaches checkout.
UPDATE public.subscription_plans
   SET trial_period_days = 7
 WHERE price_monthly > 0
   AND trial_period_days IS NULL;
