-- Run this once in Supabase: SQL Editor → New query → Run.
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) <= 60),
  url text not null,
  category text not null default 'Favorites',
  logo text,
  is_pinned boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.bookmarks enable row level security;

create policy "Users manage their own bookmarks"
on public.bookmarks
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- If you already ran this file, run the two lines below as a migration.
alter table public.bookmarks add column if not exists is_pinned boolean not null default false;
alter table public.bookmarks add column if not exists sort_order integer not null default 0;
