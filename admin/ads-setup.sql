-- Game Night ads. Run once in Supabase → COW project → SQL Editor. Safe to run again.
-- BEFORE RUNNING: change the email on the "insert into public.gamenight_admins" line to the
-- email you'll log in with. Then create that user: Authentication → Users → Add user →
-- Create new user (tick "Auto confirm user").

-- 1. Who can manage ads
create table if not exists public.gamenight_admins (email text primary key);
alter table public.gamenight_admins enable row level security;   -- no policies: nobody reads it directly
insert into public.gamenight_admins (email) values (lower('YOUR-EMAIL@example.com')) on conflict do nothing;

create or replace function public.is_gamenight_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gamenight_admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
grant execute on function public.is_gamenight_admin() to anon, authenticated;

-- 2. The ads
create table if not exists public.gamenight_ads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 70),
  body text check (body is null or char_length(body) <= 160),
  link text check (link is null or link ~ '^https://'),
  image_url text,
  advertiser text,                -- who paid (admin only)
  notes text,                     -- amount, contact, etc. (admin only)
  active boolean not null default true,
  starts_on date,
  ends_on date,
  sort int not null default 0
);
alter table public.gamenight_ads enable row level security;

drop policy if exists "public sees live ads" on public.gamenight_ads;
drop policy if exists "admins see all ads" on public.gamenight_ads;
drop policy if exists "admins add ads" on public.gamenight_ads;
drop policy if exists "admins edit ads" on public.gamenight_ads;
drop policy if exists "admins delete ads" on public.gamenight_ads;
create policy "public sees live ads" on public.gamenight_ads for select to anon, authenticated
  using (active and (starts_on is null or starts_on <= current_date) and (ends_on is null or ends_on >= current_date));
create policy "admins see all ads" on public.gamenight_ads for select to authenticated using (public.is_gamenight_admin());
create policy "admins add ads" on public.gamenight_ads for insert to authenticated with check (public.is_gamenight_admin());
create policy "admins edit ads" on public.gamenight_ads for update to authenticated using (public.is_gamenight_admin()) with check (public.is_gamenight_admin());
create policy "admins delete ads" on public.gamenight_ads for delete to authenticated using (public.is_gamenight_admin());

revoke all on public.gamenight_ads from anon, authenticated;
grant select (id, title, body, link, image_url, active, starts_on, ends_on, sort, created_at) on public.gamenight_ads to anon;
grant select, insert, update, delete on public.gamenight_ads to authenticated;

-- 3. Ad images (public bucket: anyone can view, only admins can upload or delete)
insert into storage.buckets (id, name, public) values ('gamenight-ads', 'gamenight-ads', true) on conflict (id) do nothing;
drop policy if exists "gamenight ads upload" on storage.objects;
drop policy if exists "gamenight ads update" on storage.objects;
drop policy if exists "gamenight ads delete" on storage.objects;
create policy "gamenight ads upload" on storage.objects for insert to authenticated with check (bucket_id = 'gamenight-ads' and public.is_gamenight_admin());
create policy "gamenight ads update" on storage.objects for update to authenticated using (bucket_id = 'gamenight-ads' and public.is_gamenight_admin());
create policy "gamenight ads delete" on storage.objects for delete to authenticated using (bucket_id = 'gamenight-ads' and public.is_gamenight_admin());
