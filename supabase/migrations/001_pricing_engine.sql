-- Pricing Engine — Initial Migration
-- Run in Supabase SQL editor or via supabase CLI

-- ─────────────────────────────────────────
-- Roles
-- ─────────────────────────────────────────
create table if not exists user_roles (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  role       text not null check (role in ('sales','manager','finance','admin','super_admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- Vendors (finance/admin/super_admin only)
-- ─────────────────────────────────────────
create table if not exists vendors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  code         text not null unique,
  is_preferred boolean default false,
  is_active    boolean default true,
  created_at   timestamptz default now()
);

create table if not exists vendor_pricing (
  id                    uuid primary key default gen_random_uuid(),
  vendor_id             uuid references vendors(id) on delete cascade,
  channel_type          text not null check (channel_type in ('inbound','outbound','blended')),
  plan_type             text not null check (plan_type in ('pulse','unlimited')),
  avg_call_duration_sec int,
  cost_per_unit         numeric(10,4) not null,
  unit_type             text not null check (unit_type in ('per_minute','per_call','per_channel')),
  valid_from            date not null,
  valid_to              date,
  created_at            timestamptz default now()
);

-- ─────────────────────────────────────────
-- Quotes
-- ─────────────────────────────────────────
create table if not exists quotes (
  id                       uuid primary key default gen_random_uuid(),
  quote_number             text not null unique,
  customer_name            text not null,
  customer_email           text,
  created_by               text not null,
  status                   text not null default 'draft'
                           check (status in ('draft','pending_approval','approved','rejected','revision_requested','finalized')),
  commitment_period_months int not null default 12,
  validity_days            int not null default 30,
  notes                    text,
  terms_and_conditions     text,
  exclusions               text,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

create table if not exists quote_channels (
  id                    uuid primary key default gen_random_uuid(),
  quote_id              uuid references quotes(id) on delete cascade,
  channel_type          text not null check (channel_type in ('inbound','outbound','blended')),
  plan_type             text not null check (plan_type in ('pulse','unlimited')),
  concurrent_channels   int not null,
  avg_call_duration_sec int,
  monthly_minutes       int,
  traffic_distribution  jsonb default '{"peak": 50, "off_peak": 50}',
  commitment_volume     int,
  discount_at_channel   numeric(5,2) default 0,
  sort_order            int default 0
);

create table if not exists quote_addons (
  id         uuid primary key default gen_random_uuid(),
  quote_id   uuid references quotes(id) on delete cascade,
  addon_type text not null check (addon_type in ('agentic_voice','ai_services','recording','analytics','other')),
  name       text not null,
  unit_price numeric(10,4) not null,
  quantity   int not null default 1,
  discount   numeric(5,2) default 0
);

-- ─────────────────────────────────────────
-- Pricing Results
-- ─────────────────────────────────────────
create table if not exists quote_pricing (
  id                       uuid primary key default gen_random_uuid(),
  quote_id                 uuid references quotes(id) on delete cascade,
  lowest_vendor_cost       numeric(12,4),
  avg_vendor_cost          numeric(12,4),
  preferred_vendor_cost    numeric(12,4),
  base_price               numeric(12,4),
  floor_price              numeric(12,4),
  min_margin_price         numeric(12,4),
  suggested_price          numeric(12,4),
  sales_input_price        numeric(12,4),
  manual_discount_pct      numeric(5,2) default 0,
  recommended_discount_pct numeric(5,2),
  final_price              numeric(12,4),
  gross_margin_pct         numeric(5,2),
  gross_profit             numeric(12,4),
  profit_status            text check (profit_status in ('healthy','near_minimum','loss')),
  approval_required        boolean default false,
  calculated_at            timestamptz default now(),
  calculated_by            text
);

-- ─────────────────────────────────────────
-- Approval Workflow
-- ─────────────────────────────────────────
create table if not exists approval_requests (
  id                     uuid primary key default gen_random_uuid(),
  quote_id               uuid references quotes(id) on delete cascade,
  requested_by           text not null,
  requested_at           timestamptz default now(),
  status                 text not null default 'pending'
                         check (status in ('pending','approved','rejected','revision_requested')),
  reviewed_by            text,
  reviewed_at            timestamptz,
  remarks                text,
  trigger_reason         text check (trigger_reason in ('below_floor','below_margin_threshold','excess_discount','loss_making')),
  expected_margin        numeric(5,2),
  revenue_impact         numeric(12,4),
  discount_justification text
);

-- ─────────────────────────────────────────
-- Audit Log (append-only)
-- ─────────────────────────────────────────
create table if not exists audit_logs (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null check (entity_type in ('quote','pricing','approval','vendor','config')),
  entity_id      uuid not null,
  action         text not null,
  changed_by     text not null,
  changed_at     timestamptz default now(),
  previous_value jsonb,
  updated_value  jsonb,
  remarks        text
);

-- ─────────────────────────────────────────
-- Pricing Configuration
-- ─────────────────────────────────────────
create table if not exists pricing_config (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  value       numeric not null,
  description text,
  updated_by  text,
  updated_at  timestamptz default now()
);

insert into pricing_config (key, value, description) values
  ('target_margin_pct',   30, 'Default target margin %'),
  ('minimum_margin_pct',  15, 'Minimum margin % — below this triggers approval'),
  ('healthy_margin_pct',  25, 'Threshold for green profit status'),
  ('amber_margin_pct',    15, 'Threshold for amber profit status'),
  ('max_discount_pct',    20, 'Max permissible discount % without approval'),
  ('quote_validity_days', 30, 'Default quote validity in days')
on conflict (key) do nothing;

-- ─────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────
alter table vendors enable row level security;
create policy "vendors_restricted" on vendors for select
  using (exists (
    select 1 from user_roles
    where email = auth.jwt() ->> 'email'
    and role in ('finance','admin','super_admin')
  ));

alter table vendor_pricing enable row level security;
create policy "vendor_pricing_restricted" on vendor_pricing for select
  using (exists (
    select 1 from user_roles
    where email = auth.jwt() ->> 'email'
    and role in ('finance','admin','super_admin')
  ));

alter table quotes enable row level security;
create policy "quotes_access" on quotes for all
  using (
    created_by = auth.jwt() ->> 'email'
    or exists (
      select 1 from user_roles
      where email = auth.jwt() ->> 'email'
      and role in ('manager','finance','admin','super_admin')
    )
  );
