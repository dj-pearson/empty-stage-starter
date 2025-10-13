-- Add subscription_tier to profiles if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'profiles' AND column_name = 'subscription_tier') THEN
    ALTER TABLE profiles ADD COLUMN subscription_tier TEXT DEFAULT 'standard';
  END IF;
END $$;

-- Fix the referrals foreign key to profiles
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_referred_user_id_fkey;
ALTER TABLE referrals ADD CONSTRAINT referrals_referred_user_id_fkey 
  FOREIGN KEY (referred_user_id) REFERENCES profiles(id) ON DELETE CASCADE;