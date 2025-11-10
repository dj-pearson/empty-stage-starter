-- Smart Grocery Delivery Integration
-- Seamlessly order groceries from meal plans through delivery services
-- Supports multiple providers (Instacart, Amazon Fresh, Walmart, etc.)

-- Delivery provider configurations
CREATE TABLE IF NOT EXISTS delivery_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Provider info
  provider_name TEXT NOT NULL UNIQUE, -- 'instacart', 'amazon_fresh', 'walmart', 'shipt', 'target'
  display_name TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT,

  -- Availability
  is_active BOOLEAN DEFAULT true,
  supported_regions JSONB, -- Array of zip codes or regions

  -- API configuration
  api_endpoint TEXT,
  requires_oauth BOOLEAN DEFAULT false,
  auth_type TEXT, -- 'oauth', 'api_key', 'none'

  -- Features
  supports_scheduled_delivery BOOLEAN DEFAULT false,
  supports_express_delivery BOOLEAN DEFAULT false,
  supports_price_matching BOOLEAN DEFAULT false,
  min_order_amount DECIMAL(10,2),
  delivery_fee DECIMAL(10,2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User connections to delivery providers
CREATE TABLE IF NOT EXISTS user_delivery_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES delivery_providers(id) ON DELETE CASCADE,

  -- Account details
  provider_user_id TEXT, -- External user ID from provider
  account_email TEXT,
  is_connected BOOLEAN DEFAULT false,

  -- OAuth tokens (encrypted)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- API keys (encrypted)
  api_key TEXT,

  -- Preferences
  preferred_store_id TEXT,
  preferred_store_name TEXT,
  default_delivery_window TEXT, -- 'same_day', 'next_day', 'scheduled'

  -- Status
  last_connected_at TIMESTAMPTZ,
  connection_status TEXT DEFAULT 'active' CHECK (connection_status IN ('active', 'expired', 'disconnected', 'error')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, provider_id)
);

-- Grocery delivery orders
CREATE TABLE IF NOT EXISTS grocery_delivery_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES delivery_providers(id) ON DELETE SET NULL,
  account_id UUID REFERENCES user_delivery_accounts(id) ON DELETE SET NULL,

  -- Order details
  external_order_id TEXT, -- Order ID from delivery provider
  order_number TEXT, -- Human-readable order number

  -- Items
  items JSONB NOT NULL, -- Array of {food_id, name, quantity, unit, estimated_price, actual_price, available}
  item_count INTEGER,

  -- Pricing
  subtotal DECIMAL(10,2),
  delivery_fee DECIMAL(10,2),
  service_fee DECIMAL(10,2),
  tax DECIMAL(10,2),
  tip DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  estimated_amount DECIMAL(10,2), -- Estimate before order placed

  -- Delivery details
  delivery_address JSONB, -- {street, city, state, zip, instructions}
  delivery_window_start TIMESTAMPTZ,
  delivery_window_end TIMESTAMPTZ,
  delivery_type TEXT CHECK (delivery_type IN ('standard', 'express', 'scheduled')),

  -- Status tracking
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',           -- Being prepared
    'pending',         -- Ready to submit
    'submitted',       -- Sent to provider
    'confirmed',       -- Provider confirmed
    'shopping',        -- Shopper picking items
    'out_for_delivery',-- In transit
    'delivered',       -- Completed
    'cancelled',       -- Cancelled
    'failed'           -- Failed to process
  )),

  -- Shopper info (if available from provider)
  shopper_name TEXT,
  shopper_phone TEXT,
  shopper_rating DECIMAL(3,2),

  -- Timestamps
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Notes
  order_notes TEXT,
  substitution_preferences TEXT, -- 'allow', 'contact_me', 'refund'

  -- Source tracking
  created_from_meal_plan BOOLEAN DEFAULT false,
  meal_plan_week_start DATE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order status history
CREATE TABLE IF NOT EXISTS delivery_order_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES grocery_delivery_orders(id) ON DELETE CASCADE,

  status TEXT NOT NULL,
  status_message TEXT,
  metadata JSONB, -- Additional data from provider

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Item substitutions
CREATE TABLE IF NOT EXISTS order_substitutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES grocery_delivery_orders(id) ON DELETE CASCADE,

  -- Original item
  original_food_id UUID REFERENCES foods(id) ON DELETE SET NULL,
  original_item_name TEXT NOT NULL,
  original_quantity DECIMAL(10,2),
  original_price DECIMAL(10,2),

  -- Substituted item
  substituted_item_name TEXT,
  substituted_quantity DECIMAL(10,2),
  substituted_price DECIMAL(10,2),

  -- Reason
  reason TEXT CHECK (reason IN ('out_of_stock', 'price_change', 'customer_approved', 'shopper_suggestion')),
  customer_approved BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Delivery pricing cache (for cost estimates)
CREATE TABLE IF NOT EXISTS delivery_pricing_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES delivery_providers(id) ON DELETE CASCADE,

  -- Item details
  item_name TEXT NOT NULL,
  item_category TEXT,

  -- Pricing
  price DECIMAL(10,2),
  unit TEXT,
  store_name TEXT,

  -- Cache metadata
  zip_code TEXT,
  last_updated TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days',

  created_at TIMESTAMPTZ DEFAULT now()
);

-- User preferences for grocery delivery
CREATE TABLE IF NOT EXISTS delivery_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Preferred provider
  preferred_provider_id UUID REFERENCES delivery_providers(id) ON DELETE SET NULL,

  -- Delivery preferences
  default_delivery_type TEXT DEFAULT 'standard',
  preferred_delivery_day TEXT[], -- ['monday', 'wednesday', 'friday']
  preferred_delivery_time TEXT, -- '6pm-8pm'

  -- Substitution preferences
  allow_substitutions BOOLEAN DEFAULT true,
  substitution_preference TEXT DEFAULT 'contact_me' CHECK (substitution_preference IN ('allow', 'contact_me', 'refund')),

  -- Budget
  weekly_grocery_budget DECIMAL(10,2),
  notify_if_over_budget BOOLEAN DEFAULT true,

  -- Auto-order
  auto_order_enabled BOOLEAN DEFAULT false,
  auto_order_day TEXT, -- 'sunday', 'monday', etc.
  auto_order_threshold DECIMAL(10,2), -- Only auto-order if total > threshold

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_delivery_providers_active ON delivery_providers(is_active);
CREATE INDEX IF NOT EXISTS idx_delivery_providers_name ON delivery_providers(provider_name);

CREATE INDEX IF NOT EXISTS idx_user_delivery_accounts_user ON user_delivery_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_delivery_accounts_household ON user_delivery_accounts(household_id);
CREATE INDEX IF NOT EXISTS idx_user_delivery_accounts_provider ON user_delivery_accounts(provider_id);
CREATE INDEX IF NOT EXISTS idx_user_delivery_accounts_status ON user_delivery_accounts(connection_status);

CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_household ON grocery_delivery_orders(household_id);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_user ON grocery_delivery_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_provider ON grocery_delivery_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_status ON grocery_delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_external ON grocery_delivery_orders(external_order_id);
CREATE INDEX IF NOT EXISTS idx_grocery_delivery_orders_created ON grocery_delivery_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_order_history_order ON delivery_order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_order_history_created ON delivery_order_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_substitutions_order ON order_substitutions(order_id);

CREATE INDEX IF NOT EXISTS idx_delivery_pricing_cache_provider ON delivery_pricing_cache(provider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_pricing_cache_item ON delivery_pricing_cache(item_name);
CREATE INDEX IF NOT EXISTS idx_delivery_pricing_cache_expires ON delivery_pricing_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_delivery_preferences_household ON delivery_preferences(household_id);
CREATE INDEX IF NOT EXISTS idx_delivery_preferences_user ON delivery_preferences(user_id);

-- Row Level Security
ALTER TABLE delivery_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_delivery_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_pricing_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_preferences ENABLE ROW LEVEL SECURITY;

-- delivery_providers policies (public read)
CREATE POLICY "Anyone can view active providers"
  ON delivery_providers FOR SELECT
  USING (is_active = true);

-- user_delivery_accounts policies
CREATE POLICY "Users can view their accounts"
  ON user_delivery_accounts FOR SELECT
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their accounts"
  ON user_delivery_accounts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their accounts"
  ON user_delivery_accounts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their accounts"
  ON user_delivery_accounts FOR DELETE
  USING (user_id = auth.uid());

-- grocery_delivery_orders policies
CREATE POLICY "Users can view household orders"
  ON grocery_delivery_orders FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create orders"
  ON grocery_delivery_orders FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their orders"
  ON grocery_delivery_orders FOR UPDATE
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- delivery_order_history policies
CREATE POLICY "Users can view order history"
  ON delivery_order_history FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM grocery_delivery_orders
      WHERE household_id IN (
        SELECT household_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

-- order_substitutions policies
CREATE POLICY "Users can view substitutions"
  ON order_substitutions FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM grocery_delivery_orders
      WHERE household_id IN (
        SELECT household_id FROM profiles WHERE user_id = auth.uid()
      )
    )
  );

-- delivery_pricing_cache policies (read-only for users)
CREATE POLICY "Users can view pricing cache"
  ON delivery_pricing_cache FOR SELECT
  USING (true);

-- delivery_preferences policies
CREATE POLICY "Users can view their preferences"
  ON delivery_preferences FOR SELECT
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their preferences"
  ON delivery_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their preferences"
  ON delivery_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_delivery_providers_updated_at
  BEFORE UPDATE ON delivery_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_user_delivery_accounts_updated_at
  BEFORE UPDATE ON user_delivery_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_grocery_delivery_orders_updated_at
  BEFORE UPDATE ON grocery_delivery_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_delivery_preferences_updated_at
  BEFORE UPDATE ON delivery_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to create order from grocery list
CREATE OR REPLACE FUNCTION create_order_from_grocery_list(
  p_household_id UUID,
  p_user_id UUID,
  p_provider_id UUID,
  p_delivery_type TEXT DEFAULT 'standard'
)
RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_items JSONB;
  v_item_count INTEGER;
  v_estimated_total DECIMAL(10,2);
BEGIN
  -- Get grocery list items for household
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'food_id', gl.food_id,
        'name', f.name,
        'quantity', gl.quantity,
        'unit', f.unit,
        'category', f.category,
        'estimated_price', COALESCE(f.price, 0),
        'available', true
      )
    ),
    COUNT(*),
    SUM(COALESCE(f.price, 0) * gl.quantity)
  INTO v_items, v_item_count, v_estimated_total
  FROM grocery_list gl
  JOIN foods f ON f.id = gl.food_id
  WHERE gl.household_id = p_household_id
    AND gl.purchased = false
    AND gl.food_id IS NOT NULL;

  IF v_items IS NULL OR v_item_count = 0 THEN
    RAISE EXCEPTION 'No items in grocery list';
  END IF;

  -- Create order
  INSERT INTO grocery_delivery_orders (
    household_id,
    user_id,
    provider_id,
    items,
    item_count,
    estimated_amount,
    delivery_type,
    status,
    created_from_meal_plan,
    substitution_preferences
  )
  VALUES (
    p_household_id,
    p_user_id,
    p_provider_id,
    v_items,
    v_item_count,
    v_estimated_total,
    p_delivery_type,
    'draft',
    true,
    'contact_me'
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'item_count', v_item_count,
    'estimated_total', v_estimated_total
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update order status
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_status TEXT,
  p_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Update order status
  UPDATE grocery_delivery_orders
  SET
    status = p_status,
    submitted_at = CASE WHEN p_status = 'submitted' AND submitted_at IS NULL THEN now() ELSE submitted_at END,
    confirmed_at = CASE WHEN p_status = 'confirmed' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END,
    delivered_at = CASE WHEN p_status = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
    cancelled_at = CASE WHEN p_status = 'cancelled' AND cancelled_at IS NULL THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = p_order_id;

  -- Add to history
  INSERT INTO delivery_order_history (
    order_id,
    status,
    status_message,
    metadata
  )
  VALUES (
    p_order_id,
    p_status,
    p_message,
    p_metadata
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default providers
INSERT INTO delivery_providers (provider_name, display_name, logo_url, is_active, supported_regions, min_order_amount, delivery_fee)
VALUES
  ('instacart', 'Instacart', '/providers/instacart.png', true, '["*"]', 10.00, 3.99),
  ('amazon_fresh', 'Amazon Fresh', '/providers/amazon-fresh.png', true, '["*"]', 35.00, 0.00),
  ('walmart', 'Walmart Grocery', '/providers/walmart.png', true, '["*"]', 35.00, 0.00),
  ('shipt', 'Shipt', '/providers/shipt.png', true, '["*"]', 35.00, 5.99),
  ('target', 'Target Same Day', '/providers/target.png', true, '["*"]', 35.00, 5.99)
ON CONFLICT (provider_name) DO NOTHING;

-- Comments
COMMENT ON TABLE delivery_providers IS 'Supported grocery delivery service providers';
COMMENT ON TABLE user_delivery_accounts IS 'User connections to delivery service accounts';
COMMENT ON TABLE grocery_delivery_orders IS 'Grocery orders placed through delivery services';
COMMENT ON TABLE delivery_order_history IS 'Status change history for orders';
COMMENT ON TABLE order_substitutions IS 'Items substituted by shoppers';
COMMENT ON TABLE delivery_pricing_cache IS 'Cached pricing data from providers for estimates';
COMMENT ON TABLE delivery_preferences IS 'User preferences for grocery delivery';

COMMENT ON FUNCTION create_order_from_grocery_list IS 'Creates delivery order from household grocery list';
COMMENT ON FUNCTION update_order_status IS 'Updates order status and records in history';
