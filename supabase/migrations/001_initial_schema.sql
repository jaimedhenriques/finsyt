-- ─────────────────────────────────────────────────────────────────────────────
-- Finsyt Database Schema
-- Run in Supabase SQL Editor or via supabase db push
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ── Profiles (extends auth.users) ────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  full_name     text,
  avatar_url    text,
  company       text,
  job_title     text,
  country       text,
  timezone      text default 'UTC',
  preferences   jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Subscriptions ─────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                       uuid primary key default uuid_generate_v4(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id       text,
  stripe_subscription_id   text,
  plan                     text not null default 'free', -- free | pro | enterprise
  status                   text not null default 'active', -- active | trialing | past_due | canceled | inactive
  current_period_end       timestamptz,
  cancel_at_period_end     boolean default false,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  unique (user_id)
);

alter table public.subscriptions enable row level security;

create policy "Users can read their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Service role can upsert subscriptions (Stripe webhook)
create policy "Service role can manage subscriptions"
  on public.subscriptions for all
  using (true)
  with check (true);

-- ── Watchlists ────────────────────────────────────────────────────────────────
create table if not exists public.watchlists (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'My Watchlist',
  symbols     text[] default '{}',
  color       text default '#1B4FFF',
  is_default  boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.watchlists enable row level security;

create policy "Users can CRUD their own watchlists"
  on public.watchlists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_watchlists_user_id on public.watchlists(user_id);

-- ── Alerts ────────────────────────────────────────────────────────────────────
create table if not exists public.alerts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  symbol          text not null,
  alert_type      text not null, -- price_above | price_below | pct_change | news | earnings
  threshold       numeric,
  condition       text,
  message         text,
  is_active       boolean default true,
  triggered_at    timestamptz,
  triggered_count int default 0,
  channel         text default 'email', -- email | slack | push
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.alerts enable row level security;

create policy "Users can CRUD their own alerts"
  on public.alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_alerts_user_id on public.alerts(user_id);
create index if not exists idx_alerts_symbol on public.alerts(symbol);
create index if not exists idx_alerts_active on public.alerts(is_active) where is_active = true;

-- ── Research Sessions / Chat History ─────────────────────────────────────────
create table if not exists public.research_sessions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  messages    jsonb default '[]',
  metadata    jsonb default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.research_sessions enable row level security;

create policy "Users can CRUD their own research sessions"
  on public.research_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_research_sessions_user_id on public.research_sessions(user_id);

-- ── Saved Formulas / Screens ──────────────────────────────────────────────────
create table if not exists public.saved_screens (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  filters     jsonb default '{}',
  sort_by     text,
  sort_dir    text default 'desc',
  is_public   boolean default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.saved_screens enable row level security;

create policy "Users can CRUD their own screens"
  on public.saved_screens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Public screens are readable by all"
  on public.saved_screens for select
  using (is_public = true);

-- ── API Usage Tracking ────────────────────────────────────────────────────────
create table if not exists public.api_usage (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete set null,
  endpoint    text not null,
  tokens_used int default 0,
  latency_ms  int,
  status_code int,
  created_at  timestamptz default now()
);

alter table public.api_usage enable row level security;

create policy "Users can view their own API usage"
  on public.api_usage for select
  using (auth.uid() = user_id);

create index if not exists idx_api_usage_user_id on public.api_usage(user_id);
create index if not exists idx_api_usage_created_at on public.api_usage(created_at desc);

-- ── Helper: updated_at trigger ────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles','subscriptions','watchlists','alerts','research_sessions','saved_screens'] loop
    execute format('
      drop trigger if exists set_updated_at on public.%I;
      create trigger set_updated_at before update on public.%I
      for each row execute procedure public.set_updated_at();
    ', t, t);
  end loop;
end $$;
