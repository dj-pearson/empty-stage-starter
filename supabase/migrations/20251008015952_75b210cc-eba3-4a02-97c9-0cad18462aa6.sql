-- Add admin role for user
INSERT INTO public.user_roles (user_id, role)
VALUES ('dc48c711-f059-443a-b4f2-585be6683c63', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;