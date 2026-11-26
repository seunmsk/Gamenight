-- Run once in Supabase → COW project → SQL Editor → New query → paste → Run.
-- Creates the RSVP table for MSK's Game Night. Does not touch any Close of Work tables.
create table if not exists public.gamenight_rsvps (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 60),
  phone text,
  status text not null check (status in ('yes','maybe','no')),
  dates text[] not null default '{}',
  plus_ones int not null default 0 check (plus_ones between 0 and 10),
  items text[] not null default '{}',
  note text check (note is null or char_length(note) <= 200),
  cash_amount int check (cash_amount is null or cash_amount >= 0),
  presenting text check (presenting is null or char_length(presenting) <= 80)
);
-- in case an older version of the table already exists
alter table public.gamenight_rsvps add column if not exists presenting text;
alter table public.gamenight_rsvps add column if not exists dates text[] not null default '{}';

alter table public.gamenight_rsvps enable row level security;

drop policy if exists "anyone can rsvp" on public.gamenight_rsvps;
drop policy if exists "anyone can read board" on public.gamenight_rsvps;
create policy "anyone can rsvp" on public.gamenight_rsvps for insert to anon with check (true);
create policy "anyone can read board" on public.gamenight_rsvps for select to anon using (true);

-- Guests can add an RSVP and read the board, but can't edit or delete anything.
revoke all on public.gamenight_rsvps from anon;
grant select (name, status, dates, plus_ones, items, note, cash_amount, presenting, created_at) on public.gamenight_rsvps to anon;
grant insert (name, phone, status, dates, plus_ones, items, note, cash_amount, presenting) on public.gamenight_rsvps to anon;
