-- Create referral program configuration table
CREATE TABLE public.referral_program_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL DEFAULT 'standard', -- 'standard', 'professional', 'enterprise'
  
  -- Referrer rewards
  referrer_reward_type TEXT NOT NULL DEFAULT 'free_months', -- 'free_months', 'percent_off', 'dollar_off'
  referrer_reward_value NUMERIC NOT NULL DEFAULT 1,
  referrer_reward_duration_months INTEGER DEFAULT 1, -- for free_months or percent_off
  
  -- Referred user rewards
  referred_reward_type TEXT NOT NULL DEFAULT 'free_months',
  referred_reward_value NUMERIC NOT NULL DEFAULT 1,
  referred_reward_duration_months INTEGER DEFAULT 1,
  
  -- Program settings
  is_active BOOLEAN DEFAULT true,
  min_referrals_for_reward INTEGER DEFAULT 1,
  max_rewards_per_user INTEGER DEFAULT NULL, -- NULL = unlimited
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(tier)
);

-- Create referral codes table
CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL UNIQUE,
  
  -- Analytics
  clicks INTEGER DEFAULT 0,
  signups INTEGER DEFAULT 0,
  successful_referrals INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Create referrals tracking table
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referral_code TEXT NOT NULL,
  
  -- Status tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'rewarded', 'cancelled'
  completed_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  
  -- UTM tracking
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(referred_user_id)
);

-- Create referral rewards table
CREATE TABLE public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE CASCADE,
  
  reward_type TEXT NOT NULL, -- 'free_months', 'percent_off', 'dollar_off'
  reward_value NUMERIC NOT NULL,
  reward_duration_months INTEGER,
  
  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'applied', 'expired', 'cancelled'
  applied_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Metadata
  user_tier TEXT, -- tier at time of reward
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.referral_program_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for referral_program_config
CREATE POLICY "Admins can manage referral config"
  ON public.referral_program_config
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active referral config"
  ON public.referral_program_config
  FOR SELECT
  USING (is_active = true);

-- RLS Policies for referral_codes
CREATE POLICY "Users can view their own referral code"
  ON public.referral_codes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own referral code"
  ON public.referral_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update referral code stats"
  ON public.referral_codes
  FOR UPDATE
  USING (true);

CREATE POLICY "Admins can view all referral codes"
  ON public.referral_codes
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for referrals
CREATE POLICY "Users can view their referrals"
  ON public.referrals
  FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

CREATE POLICY "System can create referrals"
  ON public.referrals
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update referrals"
  ON public.referrals
  FOR UPDATE
  USING (true);

CREATE POLICY "Admins can view all referrals"
  ON public.referrals
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for referral_rewards
CREATE POLICY "Users can view their own rewards"
  ON public.referral_rewards
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage rewards"
  ON public.referral_rewards
  FOR ALL
  USING (true);

CREATE POLICY "Admins can view all rewards"
  ON public.referral_rewards
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Create function to generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8 character code
    new_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
    
    -- Check if code exists
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = new_code) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$;

-- Create function to auto-generate referral code for new users
CREATE OR REPLACE FUNCTION create_user_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO referral_codes (user_id, code)
  VALUES (NEW.id, generate_referral_code());
  
  RETURN NEW;
END;
$$;

-- Trigger to create referral code on user signup
CREATE TRIGGER on_user_created_create_referral_code
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_referral_code();

-- Insert default configurations
INSERT INTO referral_program_config (tier, referrer_reward_type, referrer_reward_value, referred_reward_type, referred_reward_value)
VALUES 
  ('standard', 'free_months', 1, 'free_months', 1),
  ('professional', 'free_months', 1, 'percent_off', 20),
  ('enterprise', 'free_months', 2, 'percent_off', 25);

-- Create indexes for performance
CREATE INDEX idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX idx_referral_codes_code ON referral_codes(code);
CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred_user_id ON referrals(referred_user_id);
CREATE INDEX idx_referrals_status ON referrals(status);
CREATE INDEX idx_referral_rewards_user_id ON referral_rewards(user_id);
CREATE INDEX idx_referral_rewards_status ON referral_rewards(status);