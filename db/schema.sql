-- RJ Holidays — Database Schema (Supabase / Postgres)
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New Query)
-- Safe to run top-to-bottom on a fresh Supabase project.

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- STAFF (single-user mode today; table supports multi-user later)
-- ============================================================
create table if not exists staff (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique not null,
  role text not null default 'admin' check (role in ('admin','agent')),
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text not null,
  whatsapp text,
  email text,
  country text default 'India',
  created_at timestamptz not null default now()
);
create index if not exists idx_customers_phone on customers(phone);

-- ============================================================
-- ENQUIRIES (raw form submissions — every submission gets an ID immediately)
-- ============================================================
create table if not exists enquiries (
  id uuid primary key default uuid_generate_v4(),
  enquiry_code text unique not null, -- e.g. RJH-2026-00123
  customer_id uuid references customers(id),
  name text not null,
  mobile text not null,
  whatsapp text,
  email text,
  destination text not null,
  travel_date date,
  return_date date,
  adults int not null default 1,
  children int not null default 0,
  budget text,
  hotel_category text,
  meal_preference text,
  vehicle_requirement text,
  flight_requirement boolean default false,
  special_requirements text,
  -- UTM / attribution capture
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer_url text,
  landing_page text,
  lead_id uuid, -- set once a lead is created from this enquiry
  created_at timestamptz not null default now()
);

-- ============================================================
-- LEADS (CRM pipeline)
-- ============================================================
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  lead_code text unique not null, -- same as enquiry_code for now
  customer_id uuid references customers(id),
  enquiry_id uuid references enquiries(id),
  destination text not null,
  travel_date date,
  return_date date,
  adults int not null default 1,
  children int not null default 0,
  budget text,
  requirements text,
  lead_source text default 'Direct' check (
    lead_source in ('Google Ads','Meta Ads','Instagram','Facebook','WhatsApp','Direct','Referral','Other')
  ),
  status text not null default 'New Lead' check (
    status in ('New Lead','Contacted','Requirement Confirmed','Quotation Sent','Follow-up',
               'Negotiation','Payment Pending','Confirmed','Traveling','Completed','Lost')
  ),
  assigned_staff_id uuid references staff(id),
  notes jsonb default '[]'::jsonb, -- array of {text, created_at}
  follow_up_date date,
  -- UTM carried over from enquiry for reporting convenience
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_destination on leads(destination);

alter table enquiries
  add constraint fk_enquiries_lead foreign key (lead_id) references leads(id);

-- ============================================================
-- PACKAGES
-- ============================================================
create table if not exists packages (
  id uuid primary key default uuid_generate_v4(),
  destination text not null,
  name text not null,
  duration_nights int not null,
  duration_days int not null,
  base_price_double_occupancy numeric(10,2) not null, -- per person, INR
  default_meal_plan text,
  inclusions text,
  exclusions text,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

-- Seasonal / date-based pricing modifiers (admin-managed, no code changes needed)
create table if not exists package_pricing_rules (
  id uuid primary key default uuid_generate_v4(),
  package_id uuid references packages(id) on delete cascade,
  label text not null, -- e.g. "Peak Summer", "Snow Season", "Off-Season"
  start_date date not null,
  end_date date not null,
  modifier_type text not null check (modifier_type in ('percent','fixed_amount')),
  modifier_value numeric(10,2) not null, -- e.g. +20 (percent) or +2000 (fixed, per person)
  created_at timestamptz not null default now()
);
create index if not exists idx_pricing_rules_package on package_pricing_rules(package_id);

-- Vehicle rates: vehicle type x group size band -> price
create table if not exists vehicle_rates (
  id uuid primary key default uuid_generate_v4(),
  vehicle_type text not null, -- Sedan / Innova / Tempo Traveller etc.
  min_group_size int not null,
  max_group_size int not null,
  price numeric(10,2) not null, -- total price for the trip (admin decides basis: per day/trip)
  destination text, -- nullable = applies to all destinations
  created_at timestamptz not null default now()
);

-- Add-ons (guest opt-in extras)
create table if not exists addons (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  price numeric(10,2) not null,
  package_id uuid references packages(id), -- nullable = universal add-on
  is_active boolean default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- QUOTES
-- ============================================================
create table if not exists quotes (
  id uuid primary key default uuid_generate_v4(),
  quote_code text unique not null, -- e.g. RJH-Q-2026-00045
  lead_id uuid references leads(id),
  customer_id uuid references customers(id),
  package_id uuid references packages(id),
  travel_date date,
  return_date date,
  adults int not null default 1,
  children int not null default 0,
  -- pricing breakdown (auto + manual combined, stored as computed snapshot)
  base_rate_per_person numeric(10,2),
  season_label text,
  vehicle_type text,
  vehicle_cost numeric(10,2) default 0,
  hotel_category text,
  hotel_adjustment numeric(10,2) default 0,
  room_config_note text,
  room_config_adjustment numeric(10,2) default 0,
  addons jsonb default '[]'::jsonb, -- array of {name, price}
  coupon_code text,
  discount_amount numeric(10,2) default 0,
  total_amount numeric(10,2) not null default 0,
  advance_amount numeric(10,2) not null default 0,
  balance_amount numeric(10,2) not null default 0,
  itinerary jsonb default '[]'::jsonb, -- array of {day, title, description}
  inclusions text,
  exclusions text,
  cancellation_policy text,
  terms_and_conditions text,
  validity_date date,
  status text not null default 'Draft' check (status in ('Draft','Sent','Accepted','Expired')),
  pdf_url text,
  view_token text unique not null default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quotes_lead on quotes(lead_id);

-- ============================================================
-- BOOKINGS
-- ============================================================
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  booking_code text unique not null,
  quote_id uuid references quotes(id),
  customer_id uuid references customers(id),
  package_id uuid references packages(id),
  travel_date date,
  return_date date,
  travellers_count int,
  total_amount numeric(10,2) not null default 0,
  advance_paid numeric(10,2) not null default 0,
  balance_due numeric(10,2) not null default 0,
  payment_status text not null default 'Payment Pending' check (
    payment_status in ('Payment Pending','Advance Paid','Fully Paid')
  ),
  booking_status text not null default 'Payment Pending' check (
    booking_status in ('Payment Pending','Confirmed','Traveling','Completed','Cancelled')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PAYMENTS (manual today; Razorpay fields ready for later)
-- ============================================================
create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references bookings(id) on delete cascade,
  amount numeric(10,2) not null,
  payment_method text not null check (
    payment_method in ('manual_bank_transfer','manual_cash','manual_upi','razorpay')
  ),
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  verified_server_side boolean default false,
  status text not null default 'verified' check (status in ('pending','verified','failed','refunded')),
  reference_note text,
  recorded_by uuid references staff(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- DOCUMENTS (generated PDFs: quote/invoice/voucher/receipt/itinerary)
-- ============================================================
create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references bookings(id),
  quote_id uuid references quotes(id),
  type text not null check (type in ('quotation','invoice','voucher','receipt','itinerary')),
  file_url text,
  generated_at timestamptz not null default now()
);

-- ============================================================
-- COUPONS
-- ============================================================
create table if not exists coupons (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  discount_type text not null check (discount_type in ('fixed','percent')),
  discount_value numeric(10,2) not null,
  destination text,
  package_id uuid references packages(id),
  min_booking_value numeric(10,2) default 0,
  expiry_date date,
  usage_limit int,
  times_used int default 0,
  is_active boolean default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- REVIEWS
-- ============================================================
create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references bookings(id),
  customer_id uuid references customers(id),
  rating int check (rating between 1 and 5),
  review_text text,
  status text default 'pending' check (status in ('pending','approved','hidden')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helpful view: lead pipeline counts (used by admin dashboard later)
-- ============================================================
create or replace view lead_pipeline_summary as
select status, count(*) as count
from leads
group by status;
