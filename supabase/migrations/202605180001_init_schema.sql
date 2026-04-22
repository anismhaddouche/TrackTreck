-- Safe runnable version adapted from the provided production schema
-- for local Supabase development.

create extension if not exists pgcrypto;

-- Enums replacing USER-DEFINED types from the source schema
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('client', 'admin', 'agent');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum ('new', 'contacted', 'qualified', 'won', 'lost');
  end if;

  if not exists (select 1 from pg_type where typname = 'offer_status') then
    create type public.offer_status as enum ('draft', 'pending_review', 'published', 'rejected');
  end if;
end
$$;

create table if not exists public.agencies (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  nif text,
  address text,
  status text default 'active',
  town text
);

create table if not exists public.airlines (
  id integer generated always as identity primary key,
  name text not null unique
);

-- We create profiles without the FK to auth.users for now,
-- so the local DB migration stays easy to run.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  role public.user_role not null default 'client',
  created_at timestamptz not null default now(),
  email text,
  agency_id bigint references public.agencies(id)
);

create table if not exists public.hotels (
  id bigint generated always as identity primary key,
  name text not null,
  city text not null,
  stars real,
  google_maps_url text,
  s3_photo_urls text[],
  created_at timestamptz not null default now(),
  google_place_id text unique,
  formatted_address text,
  country text
);

create table if not exists public.tours (
  id bigint generated always as identity primary key,
  agency_id bigint references public.agencies(id),
  title text not null,
  countries text[],
  duration_nights integer check (duration_nights >= 0),
  airline text,
  description text,
  itinerary jsonb,
  status public.offer_status default 'draft',
  photo_urls text[],
  created_at timestamptz default now(),
  is_global_pricing boolean default false,
  global_pricing jsonb,
  lead_price numeric default 0,
  services jsonb default '{"excluded": [], "included": []}'::jsonb,
  published_notified_at timestamptz,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  last_updated_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  is_sponsored boolean default false,
  needs_review boolean not null default true
);

create table if not exists public.tour_steps (
  id bigint generated always as identity primary key,
  tour_id bigint references public.tours(id) on delete cascade,
  city text not null,
  step_order integer not null,
  duration_nights integer default 1
);

create table if not exists public.departures (
  id bigint generated always as identity primary key,
  tour_id bigint references public.tours(id) on delete cascade,
  departure_city text not null,
  stock integer default 0 check (stock >= 0),
  flight_departure_time timestamptz not null,
  flight_arrival_time timestamptz not null,
  return_flight_departure_time timestamptz not null,
  return_flight_arrival_time timestamptz not null
);

create table if not exists public.hotel_options (
  id bigint generated always as identity primary key,
  tour_step_id bigint references public.tour_steps(id) on delete cascade,
  hotel_id bigint references public.hotels(id),
  pricing jsonb not null default '{}'::jsonb,
  is_default boolean default false,
  custom_hotel_name text
);

create table if not exists public.leads (
  id bigint generated always as identity primary key,
  tour_id bigint not null references public.tours(id) on delete cascade,
  assignee_id uuid references public.profiles(id),
  client_first_name text not null,
  client_last_name text not null,
  client_phone text not null,
  client_email text,
  chosen_price numeric not null,
  status public.lead_status not null default 'new',
  internal_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.commissions (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.tour_revisions (
  id uuid primary key default gen_random_uuid(),
  tour_id bigint references public.tours(id) on delete cascade,
  reviewer_id uuid references public.profiles(id),
  comment text not null,
  created_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);