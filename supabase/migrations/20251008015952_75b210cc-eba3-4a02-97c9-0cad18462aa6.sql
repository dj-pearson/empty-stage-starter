-- Add admin role for a specific user.
-- CI-fix: guard against a clean replay where this hardcoded auth user does
-- not exist (the bare INSERT violated user_roles -> auth.users FK). Only seed
-- the role when the user is actually present; idempotent via ON CONFLICT.
INSERT INTO public.user_roles (user_id, role)
SELECT 'dc48c711-f059-443a-b4f2-585be6683c63', 'admin'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = 'dc48c711-f059-443a-b4f2-585be6683c63')
ON CONFLICT (user_id, role) DO NOTHING;
