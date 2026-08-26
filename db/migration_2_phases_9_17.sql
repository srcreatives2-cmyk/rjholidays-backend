-- Migration 2: Phases 9-17 additions
-- Run this in Supabase SQL Editor AFTER schema.sql

-- Phase 16: vendor/voucher details per booking (hotel, cab, driver info admin fills manually)
alter table bookings add column if not exists vendor_details jsonb default '{}'::jsonb;

-- Phase 11: Customer Dashboard magic-link auth
create table if not exists customer_login_tokens (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade,
  token text unique not null default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Phase 17: public review submission token per booking (no login required to leave a review)
alter table bookings add column if not exists review_token text unique default encode(gen_random_bytes(16), 'hex');
alter table bookings add column if not exists review_requested_at timestamptz;

-- Phase 13: quick index to find quotes needing follow-up
create index if not exists idx_quotes_status_validity on quotes(status, validity_date);

-- Phase 15: track coupon usage increments safely
create or replace function increment_coupon_usage(coupon_code_input text)
returns void as $$
begin
  update coupons set times_used = times_used + 1 where code = coupon_code_input;
end;
$$ language plpgsql;
