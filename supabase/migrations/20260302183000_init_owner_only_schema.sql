-- CaritasApp initial schema
-- Owner-only access per shop, multi-shop support, EUR currency, Europe/Rome timezone default.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  timezone text not null default 'Europe/Rome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.volunteer_hours (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  volunteer_name text not null check (char_length(trim(volunteer_name)) > 0),
  work_date date not null,
  start_time time not null,
  end_time time not null,
  hours numeric(5, 2) not null,
  notes text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hours > 0 and hours <= 24),
  check (end_time > start_time)
);

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  session_date date not null,
  opening_cash numeric(12, 2) not null check (opening_cash >= 0),
  closing_cash_counted numeric(12, 2) check (closing_cash_counted >= 0),
  notes text,
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, session_date)
);

create table if not exists public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  cash_session_id uuid not null references public.cash_sessions (id) on delete cascade,
  entry_date timestamptz not null default now(),
  type text not null check (
    type in ('sale', 'expense', 'float_in', 'float_out', 'deposit_to_bank', 'adjustment')
  ),
  direction text not null check (direction in ('in', 'out')),
  category text,
  amount numeric(12, 2) not null check (amount > 0),
  description text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  entry_date timestamptz not null default now(),
  type text not null check (type in ('cash_deposit', 'withdrawal', 'bank_fee', 'adjustment', 'other')),
  direction text not null check (direction in ('in', 'out')),
  amount numeric(12, 2) not null check (amount > 0),
  reference text,
  description text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  entity_type text not null check (entity_type in ('cash_entry', 'bank_entry')),
  entity_id uuid not null,
  storage_path text not null unique,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shops_owner on public.shops (owner_user_id);
create index if not exists idx_volunteer_hours_shop_date on public.volunteer_hours (shop_id, work_date desc);
create index if not exists idx_cash_sessions_shop_date on public.cash_sessions (shop_id, session_date desc);
create index if not exists idx_cash_entries_shop_date on public.cash_entries (shop_id, entry_date desc);
create index if not exists idx_bank_ledger_shop_date on public.bank_ledger_entries (shop_id, entry_date desc);
create index if not exists idx_receipts_shop on public.receipts (shop_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_shops_updated_at on public.shops;
create trigger set_shops_updated_at
before update on public.shops
for each row
execute function public.set_updated_at();

drop trigger if exists set_volunteer_hours_updated_at on public.volunteer_hours;
create trigger set_volunteer_hours_updated_at
before update on public.volunteer_hours
for each row
execute function public.set_updated_at();

drop trigger if exists set_cash_sessions_updated_at on public.cash_sessions;
create trigger set_cash_sessions_updated_at
before update on public.cash_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists set_cash_entries_updated_at on public.cash_entries;
create trigger set_cash_entries_updated_at
before update on public.cash_entries
for each row
execute function public.set_updated_at();

drop trigger if exists set_bank_ledger_entries_updated_at on public.bank_ledger_entries;
create trigger set_bank_ledger_entries_updated_at
before update on public.bank_ledger_entries
for each row
execute function public.set_updated_at();

drop trigger if exists set_receipts_updated_at on public.receipts;
create trigger set_receipts_updated_at
before update on public.receipts
for each row
execute function public.set_updated_at();

create or replace function public.calculate_volunteer_hours()
returns trigger
language plpgsql
as $$
declare
  minutes_diff integer;
begin
  if new.end_time <= new.start_time then
    raise exception 'end_time must be after start_time';
  end if;

  minutes_diff := extract(epoch from (new.end_time - new.start_time)) / 60;
  new.hours := round((minutes_diff::numeric / 60), 2);

  if new.hours <= 0 then
    raise exception 'hours must be greater than zero';
  end if;

  return new;
end;
$$;

drop trigger if exists volunteer_hours_calculate on public.volunteer_hours;
create trigger volunteer_hours_calculate
before insert or update on public.volunteer_hours
for each row
execute function public.calculate_volunteer_hours();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

insert into public.profiles (id, full_name, email)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
  coalesce(u.email, '')
from auth.users as u
on conflict (id) do update
set
  full_name = excluded.full_name,
  email = excluded.email,
  updated_at = now();

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.volunteer_hours enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_entries enable row level security;
alter table public.bank_ledger_entries enable row level security;
alter table public.receipts enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "shops_select_owner" on public.shops;
create policy "shops_select_owner"
on public.shops
for select
using (owner_user_id = auth.uid());

drop policy if exists "shops_insert_owner" on public.shops;
create policy "shops_insert_owner"
on public.shops
for insert
with check (owner_user_id = auth.uid());

drop policy if exists "shops_update_owner" on public.shops;
create policy "shops_update_owner"
on public.shops
for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "shops_delete_owner" on public.shops;
create policy "shops_delete_owner"
on public.shops
for delete
using (owner_user_id = auth.uid());

drop policy if exists "volunteer_hours_owner_select" on public.volunteer_hours;
create policy "volunteer_hours_owner_select"
on public.volunteer_hours
for select
using (
  exists (
    select 1
    from public.shops s
    where s.id = volunteer_hours.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "volunteer_hours_owner_insert" on public.volunteer_hours;
create policy "volunteer_hours_owner_insert"
on public.volunteer_hours
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.shops s
    where s.id = volunteer_hours.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "volunteer_hours_owner_update" on public.volunteer_hours;
create policy "volunteer_hours_owner_update"
on public.volunteer_hours
for update
using (
  exists (
    select 1
    from public.shops s
    where s.id = volunteer_hours.shop_id
      and s.owner_user_id = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.shops s
    where s.id = volunteer_hours.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "volunteer_hours_owner_delete" on public.volunteer_hours;
create policy "volunteer_hours_owner_delete"
on public.volunteer_hours
for delete
using (
  exists (
    select 1
    from public.shops s
    where s.id = volunteer_hours.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "cash_sessions_owner_select" on public.cash_sessions;
create policy "cash_sessions_owner_select"
on public.cash_sessions
for select
using (
  exists (
    select 1
    from public.shops s
    where s.id = cash_sessions.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "cash_sessions_owner_insert" on public.cash_sessions;
create policy "cash_sessions_owner_insert"
on public.cash_sessions
for insert
with check (
  exists (
    select 1
    from public.shops s
    where s.id = cash_sessions.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "cash_sessions_owner_update" on public.cash_sessions;
create policy "cash_sessions_owner_update"
on public.cash_sessions
for update
using (
  exists (
    select 1
    from public.shops s
    where s.id = cash_sessions.shop_id
      and s.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.shops s
    where s.id = cash_sessions.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "cash_sessions_owner_delete" on public.cash_sessions;
create policy "cash_sessions_owner_delete"
on public.cash_sessions
for delete
using (
  exists (
    select 1
    from public.shops s
    where s.id = cash_sessions.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "cash_entries_owner_select" on public.cash_entries;
create policy "cash_entries_owner_select"
on public.cash_entries
for select
using (
  exists (
    select 1
    from public.shops s
    where s.id = cash_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "cash_entries_owner_insert" on public.cash_entries;
create policy "cash_entries_owner_insert"
on public.cash_entries
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.shops s
    where s.id = cash_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "cash_entries_owner_update" on public.cash_entries;
create policy "cash_entries_owner_update"
on public.cash_entries
for update
using (
  exists (
    select 1
    from public.shops s
    where s.id = cash_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.shops s
    where s.id = cash_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "cash_entries_owner_delete" on public.cash_entries;
create policy "cash_entries_owner_delete"
on public.cash_entries
for delete
using (
  exists (
    select 1
    from public.shops s
    where s.id = cash_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "bank_entries_owner_select" on public.bank_ledger_entries;
create policy "bank_entries_owner_select"
on public.bank_ledger_entries
for select
using (
  exists (
    select 1
    from public.shops s
    where s.id = bank_ledger_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "bank_entries_owner_insert" on public.bank_ledger_entries;
create policy "bank_entries_owner_insert"
on public.bank_ledger_entries
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.shops s
    where s.id = bank_ledger_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "bank_entries_owner_update" on public.bank_ledger_entries;
create policy "bank_entries_owner_update"
on public.bank_ledger_entries
for update
using (
  exists (
    select 1
    from public.shops s
    where s.id = bank_ledger_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.shops s
    where s.id = bank_ledger_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "bank_entries_owner_delete" on public.bank_ledger_entries;
create policy "bank_entries_owner_delete"
on public.bank_ledger_entries
for delete
using (
  exists (
    select 1
    from public.shops s
    where s.id = bank_ledger_entries.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "receipts_owner_select" on public.receipts;
create policy "receipts_owner_select"
on public.receipts
for select
using (
  exists (
    select 1
    from public.shops s
    where s.id = receipts.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "receipts_owner_insert" on public.receipts;
create policy "receipts_owner_insert"
on public.receipts
for insert
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.shops s
    where s.id = receipts.shop_id
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "receipts_owner_delete" on public.receipts;
create policy "receipts_owner_delete"
on public.receipts
for delete
using (
  exists (
    select 1
    from public.shops s
    where s.id = receipts.shop_id
      and s.owner_user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "receipts_storage_select" on storage.objects;
create policy "receipts_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'receipts'
  and split_part(name, '/', 1) = 'shop'
  and exists (
    select 1
    from public.shops s
    where s.id::text = split_part(name, '/', 2)
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "receipts_storage_insert" on storage.objects;
create policy "receipts_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and split_part(name, '/', 1) = 'shop'
  and exists (
    select 1
    from public.shops s
    where s.id::text = split_part(name, '/', 2)
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "receipts_storage_update" on storage.objects;
create policy "receipts_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'receipts'
  and split_part(name, '/', 1) = 'shop'
  and exists (
    select 1
    from public.shops s
    where s.id::text = split_part(name, '/', 2)
      and s.owner_user_id = auth.uid()
  )
)
with check (
  bucket_id = 'receipts'
  and split_part(name, '/', 1) = 'shop'
  and exists (
    select 1
    from public.shops s
    where s.id::text = split_part(name, '/', 2)
      and s.owner_user_id = auth.uid()
  )
);

drop policy if exists "receipts_storage_delete" on storage.objects;
create policy "receipts_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'receipts'
  and split_part(name, '/', 1) = 'shop'
  and exists (
    select 1
    from public.shops s
    where s.id::text = split_part(name, '/', 2)
      and s.owner_user_id = auth.uid()
  )
);
