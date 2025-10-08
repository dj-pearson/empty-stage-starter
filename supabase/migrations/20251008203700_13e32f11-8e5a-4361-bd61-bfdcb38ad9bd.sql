-- Create email marketing tables

-- Email lists table
CREATE TABLE public.email_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subscriber_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Email subscribers table
CREATE TABLE public.email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  status TEXT DEFAULT 'active',
  source TEXT,
  confirmed BOOLEAN DEFAULT false,
  list_id UUID REFERENCES public.email_lists(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Email campaigns table  
CREATE TABLE public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  template_id UUID,
  list_id UUID REFERENCES public.email_lists(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft',
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_opens INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  open_rate DECIMAL DEFAULT 0,
  click_rate DECIMAL DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Email templates table
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subject_template TEXT NOT NULL,
  content_template TEXT NOT NULL,
  category TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admins only
CREATE POLICY "Admins can manage email lists"
  ON public.email_lists FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage email subscribers"
  ON public.email_subscribers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage email campaigns"
  ON public.email_campaigns FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage email templates"
  ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to get email marketing stats
CREATE OR REPLACE FUNCTION public.get_email_marketing_stats()
RETURNS TABLE(
  total_subscribers INTEGER,
  active_subscribers INTEGER,
  total_campaigns INTEGER,
  sent_campaigns INTEGER,
  avg_open_rate DECIMAL,
  avg_click_rate DECIMAL
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_subscribers,
    COUNT(*) FILTER (WHERE status = 'active')::INTEGER as active_subscribers,
    (SELECT COUNT(*)::INTEGER FROM email_campaigns) as total_campaigns,
    (SELECT COUNT(*) FILTER (WHERE status = 'sent')::INTEGER FROM email_campaigns) as sent_campaigns,
    COALESCE((SELECT AVG(open_rate) FROM email_campaigns WHERE status = 'sent'), 0)::DECIMAL as avg_open_rate,
    COALESCE((SELECT AVG(click_rate) FROM email_campaigns WHERE status = 'sent'), 0)::DECIMAL as avg_click_rate
  FROM email_subscribers;
END;
$$;