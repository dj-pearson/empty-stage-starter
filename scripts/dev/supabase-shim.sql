-- Minimal stand-in for what Supabase provides before the first migration runs.
-- Not committed: this exists to run supabase/migrations + supabase/tests in a
-- bare Postgres, which is the CI Migration Test job's content.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticator NOINHERIT LOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE supabase_admin SUPERUSER;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE supabase_auth_admin;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE dashboard_user;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT anon, authenticated, service_role TO authenticator;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS vault;

-- Supabase's schema-level default ACL on public (US-804 documents this).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_sign_in_at timestamptz,
  deleted_at timestamptz,
  phone text,
  confirmed_at timestamptz,
  is_sso_user boolean DEFAULT false,
  aud text DEFAULT 'authenticated',
  role text DEFAULT 'authenticated'
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text,
  provider_id text,
  identity_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.audit_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb,
  created_at timestamptz DEFAULT now(),
  ip_address varchar(64) DEFAULT ''
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.email', true), '');
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid,
  public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb,
  path_tokens text[]
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql AS $$
DECLARE parts text[];
BEGIN
  parts := string_to_array(name, '/');
  RETURN parts[1:array_length(parts, 1) - 1];
END $$;

-- pg_cron is not installed here; migrations call cron.schedule().
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigserial PRIMARY KEY, schedule text, command text, jobname text
);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job (schedule, command, jobname) VALUES (schedule, command, job_name)
  RETURNING jobid;
$$;
CREATE OR REPLACE FUNCTION cron.schedule(schedule text, command text)
RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job (schedule, command) VALUES (schedule, command) RETURNING jobid;
$$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_name text) RETURNS boolean
LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = job_name; SELECT true; $$;

-- net.http_post, used by a few migrations to call edge functions.
CREATE SCHEMA IF NOT EXISTS net;
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds int DEFAULT 5000)
RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;

CREATE OR REPLACE FUNCTION vault.create_secret(secret text, name text DEFAULT NULL, description text DEFAULT '')
RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;

-- Realtime's publication. Migrations do ALTER PUBLICATION supabase_realtime
-- ADD TABLE, which errors if it does not exist. A from-scratch run is what
-- surfaced this; an incremental one had already failed earlier and hid it.
DO $$ BEGIN
  CREATE PUBLICATION supabase_realtime;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
