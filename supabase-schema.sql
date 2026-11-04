-- BIG ALIEN GIFT CARD: Supabase starter schema
-- Run in Supabase SQL Editor only after reviewing it for your project.
-- Admin privileges must be granted manually by the project owner.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create table if not exists public.withdrawal_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  category text not null default 'Other',
  region text not null default 'All',
  rate_ngn_per_usd numeric(14,2) not null default 0 check (rate_ngn_per_usd >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  gift_card_id uuid references public.gift_cards(id) on delete set null,
  brand text not null,
  region text not null,
  card_value numeric(14,2) not null check (card_value > 0),
  currency text not null,
  customer_note text,
  status text not null default 'Pending review'
    check (status in ('Pending review','Under review','Approved','Rejected','Paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  trade_request_id uuid not null unique references public.trade_requests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  withdrawal_account_id uuid references public.withdrawal_accounts(id) on delete restrict,
  amount_ngn numeric(14,2) not null check (amount_ngn >= 0),
  status text not null default 'Pending'
    check (status in ('Pending','Processing','Paid','Failed')),
  paid_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.withdrawal_accounts enable row level security;
alter table public.gift_cards enable row level security;
alter table public.trade_requests enable row level security;
alter table public.payouts enable row level security;

-- Profiles: users can read/update their own basic profile; admins can manage all.
drop policy if exists "profile read own or admin" on public.profiles;
create policy "profile read own or admin" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists "profile update own" on public.profiles;
create policy "profile update own" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = 'customer');
drop policy if exists "profile admin manage" on public.profiles;
create policy "profile admin manage" on public.profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Withdrawal accounts: private to owner and admins. Never expose these publicly.
drop policy if exists "withdrawal account owner read" on public.withdrawal_accounts;
create policy "withdrawal account owner read" on public.withdrawal_accounts
for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "withdrawal account owner insert" on public.withdrawal_accounts;
create policy "withdrawal account owner insert" on public.withdrawal_accounts
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "withdrawal account owner update" on public.withdrawal_accounts;
create policy "withdrawal account owner update" on public.withdrawal_accounts
for update to authenticated using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "withdrawal account owner delete" on public.withdrawal_accounts;
create policy "withdrawal account owner delete" on public.withdrawal_accounts
for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Gift cards: customers see active cards; admins manage catalogue and rates.
drop policy if exists "active gift cards readable" on public.gift_cards;
create policy "active gift cards readable" on public.gift_cards
for select to anon, authenticated using (is_active = true or public.is_admin());
drop policy if exists "admin manage gift cards" on public.gift_cards;
create policy "admin manage gift cards" on public.gift_cards
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Trades: customers create and read only their own requests; admins review/update.
drop policy if exists "customer read own trades" on public.trade_requests;
create policy "customer read own trades" on public.trade_requests
for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "customer create own trades" on public.trade_requests;
create policy "customer create own trades" on public.trade_requests
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "admin update trades" on public.trade_requests;
create policy "admin update trades" on public.trade_requests
for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Payouts: customers can see their own payout status; only admins create/change payouts.
drop policy if exists "customer read own payouts" on public.payouts;
create policy "customer read own payouts" on public.payouts
for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "admin manage payouts" on public.payouts;
create policy "admin manage payouts" on public.payouts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Create profile rows automatically when users sign up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- After signing up, promote ONLY your own account using its Auth user UUID:
-- update public.profiles set role = 'admin' where id = 'YOUR-AUTH-USER-UUID';
