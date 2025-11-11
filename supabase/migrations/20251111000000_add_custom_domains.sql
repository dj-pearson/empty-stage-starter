-- Create custom domains table for Professional tier white-labeling
CREATE TABLE IF NOT EXISTS professional_custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_name TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'active', 'failed')),
  dns_records JSONB DEFAULT '{}'::jsonb,
  verification_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  verified_at TIMESTAMPTZ,
  ssl_certificate_status TEXT DEFAULT 'pending' CHECK (ssl_certificate_status IN ('pending', 'issued', 'failed')),
  ssl_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_domain_name CHECK (
    domain_name ~ '^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*)*\.[a-zA-Z]{2,}$'
  )
);

-- Create brand customization table for Professional tier white-labeling
CREATE TABLE IF NOT EXISTS professional_brand_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Color theme
  primary_color TEXT DEFAULT '#2f6d3c',
  secondary_color TEXT DEFAULT '#a5d6a7',
  accent_color TEXT DEFAULT '#ffa45b',

  -- Branding assets
  business_name TEXT,
  logo_url TEXT,
  favicon_url TEXT,

  -- Content customization
  platform_tagline TEXT,
  footer_text TEXT,

  -- Contact information
  contact_email TEXT,
  phone_number TEXT,
  support_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_colors CHECK (
    primary_color ~ '^#[0-9A-Fa-f]{6}$' AND
    secondary_color ~ '^#[0-9A-Fa-f]{6}$' AND
    accent_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  CONSTRAINT valid_email CHECK (contact_email IS NULL OR contact_email ~ '^[^@]+@[^@]+\.[^@]+$')
);

-- Create indexes for performance
CREATE INDEX idx_professional_domains_user_id ON professional_custom_domains(user_id);
CREATE INDEX idx_professional_domains_status ON professional_custom_domains(status);
CREATE INDEX idx_professional_domains_domain_name ON professional_custom_domains(domain_name);
CREATE INDEX idx_professional_brand_settings_user_id ON professional_brand_settings(user_id);

-- Enable Row Level Security
ALTER TABLE professional_custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_brand_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for professional_custom_domains
CREATE POLICY "Users can view their own custom domain"
  ON professional_custom_domains FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own custom domain"
  ON professional_custom_domains FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    -- Check that user has Professional subscription
    EXISTS (
      SELECT 1 FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = auth.uid()
      AND us.status = 'active'
      AND sp.name = 'Professional'
    )
  );

CREATE POLICY "Users can update their own custom domain"
  ON professional_custom_domains FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own custom domain"
  ON professional_custom_domains FOR DELETE
  USING (user_id = auth.uid());

-- RLS Policies for professional_brand_settings
CREATE POLICY "Users can view their own brand settings"
  ON professional_brand_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own brand settings"
  ON professional_brand_settings FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    -- Check that user has Professional subscription
    EXISTS (
      SELECT 1 FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = auth.uid()
      AND us.status = 'active'
      AND sp.name = 'Professional'
    )
  );

CREATE POLICY "Users can update their own brand settings"
  ON professional_brand_settings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own brand settings"
  ON professional_brand_settings FOR DELETE
  USING (user_id = auth.uid());

-- Policy to allow public viewing of brand settings for custom domains (for white-label display)
CREATE POLICY "Public can view brand settings for verified domains"
  ON professional_brand_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM professional_custom_domains pcd
      WHERE pcd.user_id = professional_brand_settings.user_id
      AND pcd.status IN ('verified', 'active')
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_professional_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_professional_brand_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_professional_domains_updated_at
  BEFORE UPDATE ON professional_custom_domains
  FOR EACH ROW
  EXECUTE FUNCTION update_professional_domains_updated_at();

CREATE TRIGGER update_professional_brand_settings_updated_at
  BEFORE UPDATE ON professional_brand_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_professional_brand_settings_updated_at();

-- Function to automatically populate DNS records when domain is added
CREATE OR REPLACE FUNCTION generate_dns_records()
RETURNS TRIGGER AS $$
BEGIN
  NEW.dns_records = jsonb_build_object(
    'verification', jsonb_build_object(
      'type', 'TXT',
      'name', '_eatpal-verification',
      'value', NEW.verification_token,
      'ttl', 3600
    ),
    'cname', jsonb_build_object(
      'type', 'CNAME',
      'name', '@',
      'value', 'eatpal.com',
      'ttl', 3600
    ),
    'www_cname', jsonb_build_object(
      'type', 'CNAME',
      'name', 'www',
      'value', 'eatpal.com',
      'ttl', 3600
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER populate_dns_records
  BEFORE INSERT ON professional_custom_domains
  FOR EACH ROW
  EXECUTE FUNCTION generate_dns_records();

-- Comments for documentation
COMMENT ON TABLE professional_custom_domains IS 'Stores custom domain configurations for Professional tier users white-labeling';
COMMENT ON TABLE professional_brand_settings IS 'Stores brand customization settings for Professional tier users white-labeling';
COMMENT ON COLUMN professional_custom_domains.status IS 'Domain verification status: pending, verified, active, failed';
COMMENT ON COLUMN professional_custom_domains.verification_token IS 'Unique token for DNS verification';
COMMENT ON COLUMN professional_brand_settings.primary_color IS 'Primary brand color in hex format';
