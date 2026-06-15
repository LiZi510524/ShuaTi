create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_banks (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_username text not null,
  name text not null,
  course text,
  chapter text,
  tags text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  question_count integer not null default 0,
  counts jsonb not null default '{}'::jsonb,
  save_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  bank_id text not null references public.question_banks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  order_no integer not null,
  stem text not null,
  answer text not null,
  analysis text,
  type text not null check (type in ('single', 'multiple', 'judge', 'fill')),
  options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_progress (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_id text not null,
  question_id text not null,
  selected_answer text,
  answered boolean not null default false,
  correct boolean not null default false,
  attempts integer not null default 0,
  wrong_count integer not null default 0,
  favorite boolean not null default false,
  mastered boolean not null default false,
  last_answered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles(username);
create index if not exists question_banks_owner_idx on public.question_banks(owner_id);
create index if not exists question_banks_public_idx on public.question_banks(visibility, updated_at desc);
create index if not exists questions_bank_idx on public.questions(bank_id, order_no);
create index if not exists progress_user_idx on public.question_progress(user_id, bank_id);

alter table public.profiles enable row level security;
alter table public.question_banks enable row level security;
alter table public.questions enable row level security;
alter table public.question_progress enable row level security;

drop policy if exists "profiles are public readable" on public.profiles;
create policy "profiles are public readable"
on public.profiles for select
using (true);

drop policy if exists "users manage own profile" on public.profiles;
create policy "users manage own profile"
on public.profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "public banks are readable" on public.question_banks;
create policy "public banks are readable"
on public.question_banks for select
using (visibility = 'public' or owner_id = auth.uid());

drop policy if exists "owners manage banks" on public.question_banks;
create policy "owners manage banks"
on public.question_banks for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "public bank questions are readable" on public.questions;
create policy "public bank questions are readable"
on public.questions for select
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.question_banks b
    where b.id = questions.bank_id and b.visibility = 'public'
  )
);

drop policy if exists "owners manage questions" on public.questions;
create policy "owners manage questions"
on public.questions for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "users manage own progress" on public.question_progress;
create policy "users manage own progress"
on public.question_progress for all
using (user_id = auth.uid())
with check (user_id = auth.uid());
