-- Idempotent post-init repairs for the self-hosted Supabase database.
--
-- The `supabase/postgres` image *should* create all roles, the `auth` schema,
-- and the `auth.factor_type` enum during its own initialization. In a few
-- deployments we have seen these missing — typically when the data volume
-- was reused from a vanilla postgres image, or when a previous boot crashed
-- between init steps. This script repairs those gaps without touching
-- anything the image already set up.
--
-- It is safe to re-run. Apply with:
--
--   docker compose -f docker-compose.prod.yml exec -T supabase-db \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/init/99-bootstrap-fixes.sql
--
-- Run AFTER setting SUPABASE_DB_PASSWORD in .env — that same password is
-- used here to (re)align the auth/storage admin roles.

\set ON_ERROR_STOP on

-- ------------------------------------------------------------------
-- Roles required by Supabase services
-- ------------------------------------------------------------------
DO $$
DECLARE
  pw text := current_setting('custom.supabase_db_password', true);
BEGIN
  IF pw IS NULL OR pw = '' THEN
    -- Fall back to the active POSTGRES_PASSWORD set on the container.
    -- (psql executes this as the postgres superuser already.)
    pw := current_setting('cluster_name', true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin LOGIN CREATEDB CREATEROLE REPLICATION BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN NOINHERIT CREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin LOGIN NOINHERIT CREATEROLE;
  END IF;
END$$;

-- Membership / privileges
GRANT anon, authenticated, service_role TO authenticator;
GRANT usage ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- `auth` schema (used by GoTrue / supabase-auth)
-- ------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;

-- factor_type enum (added in newer GoTrue versions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'auth' AND t.typname = 'factor_type'
  ) THEN
    CREATE TYPE auth.factor_type AS ENUM ('totp', 'webauthn');
  END IF;
END$$;

-- ------------------------------------------------------------------
-- `storage` schema (used by storage-api)
-- ------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated, service_role;

-- search_path repair: storage-api issues queries like `select ... from buckets`
-- (no schema qualifier). Without these, every Storage call returns
-- `relation "buckets" does not exist`.
ALTER ROLE supabase_storage_admin SET search_path = storage, public;
ALTER ROLE authenticator          SET search_path = public, storage, extensions;

GRANT USAGE ON SCHEMA storage TO supabase_storage_admin, service_role, anon, authenticated;
GRANT ALL   ON ALL TABLES    IN SCHEMA storage TO supabase_storage_admin, service_role;
GRANT ALL   ON ALL SEQUENCES IN SCHEMA storage TO supabase_storage_admin, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA storage
  GRANT ALL ON TABLES TO supabase_storage_admin, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage
  GRANT ALL ON SEQUENCES TO supabase_storage_admin, service_role;

-- ------------------------------------------------------------------
-- Default Storage bucket — idempotent
-- ------------------------------------------------------------------
-- Created only if storage.buckets already exists (the storage-api container
-- runs its own migrations on first boot, which creates the table). If it
-- doesn't yet, this is a no-op and you can re-run the script later.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('travel-offer-assets', 'travel-offer-assets', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END$$;

-- ------------------------------------------------------------------
-- public schema access for the admin validation prototype
-- ------------------------------------------------------------------
-- The admin SPA talks to PostgREST with the anon JWT (no end-user auth yet).
-- PostgREST queries return [] unless the anon/authenticated roles can both
-- USE the schema AND have row-visibility on every business table. We grant
-- table privileges and enable RLS with a permissive "allow-all" policy so
-- the prototype works end-to-end.
--
-- !! Security note !!
-- This effectively makes the listed tables world-readable/writable through
-- the anon key. Acceptable for the current admin-only prototype where the
-- anon key itself is the perimeter (the SPA is behind nothing else). Before
-- onboarding real end-users, replace `anon_admin_access` with role-aware
-- policies (e.g. require `auth.jwt() ->> 'role' = 'admin'`) and split read
-- vs write per role. `schema_migrations` is intentionally NOT included —
-- it is internal Supabase-CLI tracking and must stay locked down.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

DO $$
DECLARE
  t text;
  business_tables text[] := ARRAY[
    'agencies',
    'airlines',
    'departures',
    'hotel_options',
    'hotels',
    'tour_revisions',
    'tour_steps',
    'tours'
  ];
BEGIN
  FOREACH t IN ARRAY business_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
          AND policyname = 'anon_admin_access'
      ) THEN
        EXECUTE format($p$
          CREATE POLICY anon_admin_access ON public.%I
          FOR ALL TO anon, authenticated
          USING (true) WITH CHECK (true)
        $p$, t);
      END IF;
    END IF;
  END LOOP;
END$$;

-- Sequences backing the business tables — needed for INSERTs that rely on
-- defaults like `nextval(...)`.
DO $$
DECLARE
  s record;
BEGIN
  FOR s IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %I.%I TO anon, authenticated',
      s.sequence_schema, s.sequence_name);
  END LOOP;
END$$;

-- Note: align the admin role passwords to match SUPABASE_DB_PASSWORD.
-- We do this from outside via psql `-v pw=...`. See bootstrap-supabase-db.sh.
