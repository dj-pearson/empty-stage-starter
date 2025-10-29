-- Secure function to apply internal link updates with admin check
CREATE OR REPLACE FUNCTION public.apply_internal_link(
  p_post_id uuid,
  p_updated_content text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Ensure caller is an authenticated admin
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'::app_role
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Update the post content
  UPDATE blog_posts
  SET content = p_updated_content,
      updated_at = NOW()
  WHERE id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  RETURN TRUE;
END;
$$;

-- Optional: add comment for documentation
COMMENT ON FUNCTION public.apply_internal_link(uuid, text)
IS 'Updates blog_posts.content if caller is admin (bypasses RLS via SECURITY DEFINER). Used by internal linking approvals.';