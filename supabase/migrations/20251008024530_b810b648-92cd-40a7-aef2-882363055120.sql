-- Create AI settings table
CREATE TABLE public.ai_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL, -- 'claude', 'openai', 'gemini', etc.
  model_name text NOT NULL,
  api_key_env_var text NOT NULL, -- Name of the environment variable containing the API key
  auth_type text NOT NULL DEFAULT 'bearer', -- 'bearer', 'x-api-key', 'api-key'
  endpoint_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  temperature numeric,
  max_tokens integer,
  additional_params jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage AI settings
CREATE POLICY "Admins can view AI settings"
  ON public.ai_settings FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert AI settings"
  ON public.ai_settings FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update AI settings"
  ON public.ai_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete AI settings"
  ON public.ai_settings FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_ai_settings_updated_at
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default Claude Sonnet 4.5 configuration
INSERT INTO public.ai_settings (
  name,
  provider,
  model_name,
  api_key_env_var,
  auth_type,
  endpoint_url,
  is_active,
  temperature,
  max_tokens
) VALUES (
  'Claude Sonnet 4.5',
  'claude',
  'claude-sonnet-4-5-20250929',
  'CLAUDE_API_KEY',
  'x-api-key',
  'https://api.anthropic.com/v1/messages',
  true,
  0.7,
  4096
);