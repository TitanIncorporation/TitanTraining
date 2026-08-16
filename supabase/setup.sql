-- Titan Training: full data tunnel (run once in Supabase SQL Editor)

-- Profiles: one row per auth user, full profile JSON
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists data jsonb;
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- Training plans
create table if not exists public.training_plans (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists training_plans_user_id_idx on public.training_plans (user_id);

-- Workouts (planned + completed + future Strava-linked)
create table if not exists public.workouts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  date date,
  source text default 'planned',
  updated_at timestamptz not null default now()
);

create index if not exists workouts_user_id_idx on public.workouts (user_id);
create index if not exists workouts_date_idx on public.workouts (date);

-- Activities (Strava / imports — ready for connection)
create table if not exists public.activities (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  external_id text,
  source text default 'strava',
  start_date timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists activities_user_id_idx on public.activities (user_id);
create unique index if not exists activities_user_external_idx
  on public.activities (user_id, external_id)
  where external_id is not null;

-- RLS
alter table public.profiles enable row level security;
alter table public.training_plans enable row level security;
alter table public.workouts enable row level security;
alter table public.activities enable row level security;

drop policy if exists "profiles_own" on public.profiles;
create policy "profiles_own" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "plans_own" on public.training_plans;
create policy "plans_own" on public.training_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "workouts_own" on public.workouts;
create policy "workouts_own" on public.workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "activities_own" on public.activities;
create policy "activities_own" on public.activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
