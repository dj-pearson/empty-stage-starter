-- Apple Sign In private-relay binding support.
--
-- Apple Sign In users who choose "Hide My Email" land in auth.users with an
-- @privaterelay.appleid.com address. They have no password (Apple-only auth).
-- This migration adds:
--   1. current_user_has_password() — SECURITY DEFINER fn so the client can
--      detect whether the caller has set a password without exposing
--      auth.users to RLS.
--   2. email_bind_requests — short-lived OTP records used by the
--      bind-email-request / bind-email-verify edge functions to swap the
--      relay address for a real one and let the user set a password.

-- -------------------------------------------------------------------
-- 1. Has-password helper
-- -------------------------------------------------------------------
create or replace function public.current_user_has_password()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    (select length(coalesce(encrypted_password, '')) > 0
     from auth.users
     where id = auth.uid()),
    false
  )
$$;

revoke all on function public.current_user_has_password() from public;
grant execute on function public.current_user_has_password() to authenticated;

-- -------------------------------------------------------------------
-- 1b. Helper for the bind-email-request edge function to detect
--     collisions before sending a verification code.
-- -------------------------------------------------------------------
create or replace function public.email_taken_by_other(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users
    where lower(email) = lower(p_email)
      and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  )
$$;

revoke all on function public.email_taken_by_other(text) from public;
grant execute on function public.email_taken_by_other(text) to authenticated, service_role;

-- -------------------------------------------------------------------
-- 2. Email bind requests
-- -------------------------------------------------------------------
create table if not exists public.email_bind_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_bind_requests_user_active_idx
  on public.email_bind_requests (user_id, created_at desc)
  where consumed_at is null;

create index if not exists email_bind_requests_target_idx
  on public.email_bind_requests (lower(requested_email), created_at desc);

alter table public.email_bind_requests enable row level security;

-- No client-facing policies. All reads/writes go through edge functions
-- using the service role key — clients only ever see the JSON responses.
-- RLS is enabled (with no policies) so anon/authenticated cannot bypass.

comment on table public.email_bind_requests is
  'Short-lived 6-digit codes for binding a real email to an Apple-relay account. Service-role only; no client policies by design.';
