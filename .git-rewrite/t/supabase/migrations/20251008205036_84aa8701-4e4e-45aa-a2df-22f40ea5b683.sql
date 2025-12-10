-- Create promotional campaigns table
CREATE TABLE IF NOT EXISTS public.promotional_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  affected_plan_ids UUID[] NOT NULL DEFAULT '{}',
  discount_duration_type TEXT NOT NULL DEFAULT 'campaign_only' CHECK (discount_duration_type IN ('campaign_only', 'first_period', 'forever')),
  stripe_coupon_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create complementary subscriptions table
CREATE TABLE IF NOT EXISTS public.complementary_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  granted_by UUID NOT NULL,
  reason TEXT,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ,
  is_permanent BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add campaign tracking to user subscriptions
ALTER TABLE public.user_subscriptions 
ADD COLUMN IF NOT EXISTS promotional_campaign_id UUID REFERENCES public.promotional_campaigns(id),
ADD COLUMN IF NOT EXISTS is_complementary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS complementary_subscription_id UUID REFERENCES public.complementary_subscriptions(id);

-- Enable RLS
ALTER TABLE public.promotional_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complementary_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for promotional_campaigns
CREATE POLICY "Admins can manage promotional campaigns"
ON public.promotional_campaigns
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active campaigns"
ON public.promotional_campaigns
FOR SELECT
USING (is_active = true AND start_date <= now() AND (end_date IS NULL OR end_date >= now()));

-- RLS Policies for complementary_subscriptions
CREATE POLICY "Admins can manage complementary subscriptions"
ON public.complementary_subscriptions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own complementary subscriptions"
ON public.complementary_subscriptions
FOR SELECT
USING (user_id = auth.uid());

-- Create trigger for updating updated_at
CREATE TRIGGER update_promotional_campaigns_updated_at
BEFORE UPDATE ON public.promotional_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_complementary_subscriptions_updated_at
BEFORE UPDATE ON public.complementary_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to get active promotional campaigns for a plan
CREATE OR REPLACE FUNCTION public.get_active_campaign_for_plan(p_plan_id UUID)
RETURNS TABLE(
  campaign_id UUID,
  discount_type TEXT,
  discount_value NUMERIC,
  discount_duration_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.discount_type,
    pc.discount_value,
    pc.discount_duration_type
  FROM public.promotional_campaigns pc
  WHERE pc.is_active = true
    AND pc.start_date <= now()
    AND (pc.end_date IS NULL OR pc.end_date >= now())
    AND p_plan_id = ANY(pc.affected_plan_ids)
  ORDER BY pc.created_at DESC
  LIMIT 1;
END;
$$;