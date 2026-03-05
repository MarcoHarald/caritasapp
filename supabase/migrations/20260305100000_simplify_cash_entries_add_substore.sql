-- Simplify cash entries: decouple from cash_sessions, add substore tagging.
-- cash_sessions table is kept for historical data but no longer required for new entries.

-- Make cash_session_id nullable so new entries don't need a session
alter table public.cash_entries alter column cash_session_id drop not null;

-- Add substore column for tagging which substore revenue comes from
alter table public.cash_entries add column if not exists substore text;

-- Index for filtering by substore
create index if not exists idx_cash_entries_substore
  on public.cash_entries (shop_id, substore)
  where substore is not null;
