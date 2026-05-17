# Pricing Engine — Technical Design
**Project:** Nirmaan CE (PlanX)  
**Version:** 1.0  
**Date:** 2026-05-17  
**Status:** Design Phase

---

## 1. Overview

The Pricing Engine is a new module within PlanX that enables the sales team to configure channel/volume-based quotes, calculates commercials dynamically, enforces margin protection, and generates client-shareable PDF proposals.

### Stack Additions
PlanX currently uses: Next.js 14 · NextAuth (Google) · Plane API · xAI
The Pricing Engine adds: **Supabase** (database + RLS) · **@react-pdf/renderer** (PDF generation)

---

## 2. Role System

PlanX has no roles today. This must be built first — everything else depends on it.

### 2.1 Role Definitions

| Role | Description |
|---|---|
| `sales` | Create/edit quotes, enter pricing, generate PDFs |
| `manager` | Approve/reject quotes, view margin data |
| `finance` | Full pricing visibility including vendor costs |
| `admin` | Full access + pricing config + vendor management |
| `super_admin` | Full access + user role management |

### 2.2 Implementation

**Supabase table:**
```sql
create table user_roles (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,  -- matches Google auth email
  role        text not null check (role in ('sales','manager','finance','admin','super_admin')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
```

**NextAuth session extension** (`lib/auth.ts`):
- On session callback, fetch role from `user_roles` by email
- Attach `role` to session token
- Gates on role enforced via middleware + API route checks

**Vendor visibility rule:**
```
canSeeVendorData = role in ['finance', 'admin', 'super_admin']
```

---

## 3. Database Schema (Supabase)

### 3.1 Core Tables

```sql
-- Vendor master (visible only to finance/admin/super_admin via RLS)
create table vendors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text not null unique,
  is_preferred  boolean default false,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- Vendor pricing per channel/product configuration
create table vendor_pricing (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid references vendors(id),
  channel_type    text not null,        -- 'inbound','outbound','blended'
  plan_type       text not null,        -- 'pulse','unlimited'
  avg_call_duration_sec int,            -- for pulse plans
  cost_per_unit   numeric(10,4) not null,
  unit_type       text not null,        -- 'per_minute','per_call','per_channel'
  valid_from      date not null,
  valid_to        date,
  created_at      timestamptz default now()
);

-- Quote header
create table quotes (
  id                uuid primary key default gen_random_uuid(),
  quote_number      text not null unique,  -- e.g. NRM-2026-0001
  customer_name     text not null,
  customer_email    text,
  created_by        text not null,         -- email
  status            text not null default 'draft'
                    check (status in ('draft','pending_approval','approved','rejected','revision_requested','finalized')),
  approval_status   text,
  commitment_period_months int not null default 12,
  validity_days     int not null default 30,
  notes             text,
  terms_and_conditions text,
  exclusions        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Channel & Volume configuration per quote
create table quote_channels (
  id                      uuid primary key default gen_random_uuid(),
  quote_id                uuid references quotes(id) on delete cascade,
  channel_type            text not null,         -- 'inbound','outbound','blended'
  plan_type               text not null,         -- 'pulse','unlimited'
  concurrent_channels     int not null,
  avg_call_duration_sec   int,
  monthly_minutes         int,
  traffic_distribution    jsonb,                 -- {peak: 40, off_peak: 60}
  commitment_volume       int,
  discount_at_channel     numeric(5,2) default 0, -- channel-level discount %
  sort_order              int default 0
);

-- Add-ons per quote
create table quote_addons (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid references quotes(id) on delete cascade,
  addon_type  text not null,  -- 'agentic_voice','ai_services','recording','analytics','other'
  name        text not null,
  unit_price  numeric(10,4) not null,
  quantity    int not null default 1,
  discount    numeric(5,2) default 0
);

-- Pricing calculation result (server-computed, stored for audit)
create table quote_pricing (
  id                    uuid primary key default gen_random_uuid(),
  quote_id              uuid references quotes(id) on delete cascade,
  lowest_vendor_cost    numeric(12,4),   -- internal benchmark
  avg_vendor_cost       numeric(12,4),
  preferred_vendor_cost numeric(12,4),
  base_price            numeric(12,4),
  floor_price           numeric(12,4),
  min_margin_price      numeric(12,4),
  suggested_price       numeric(12,4),
  sales_input_price     numeric(12,4),
  manual_discount_pct   numeric(5,2) default 0,
  recommended_discount_pct numeric(5,2),
  final_price           numeric(12,4),
  gross_margin_pct      numeric(5,2),
  gross_profit          numeric(12,4),
  profit_status         text,           -- 'healthy','near_minimum','loss'
  approval_required     boolean default false,
  calculated_at         timestamptz default now(),
  calculated_by         text
);

-- Approval workflow
create table approval_requests (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid references quotes(id),
  requested_by      text not null,
  requested_at      timestamptz default now(),
  status            text not null default 'pending'
                    check (status in ('pending','approved','rejected','revision_requested')),
  reviewed_by       text,
  reviewed_at       timestamptz,
  remarks           text,
  trigger_reason    text,   -- 'below_floor','below_margin_threshold','excess_discount','loss_making'
  expected_margin   numeric(5,2),
  revenue_impact    numeric(12,4),
  discount_justification text
);

-- Audit log (append-only)
create table audit_logs (
  id              uuid primary key default gen_random_uuid(),
  entity_type     text not null,  -- 'quote','pricing','approval','vendor'
  entity_id       uuid not null,
  action          text not null,  -- 'created','updated','approved','rejected','pdf_generated'
  changed_by      text not null,
  changed_at      timestamptz default now(),
  previous_value  jsonb,
  updated_value   jsonb,
  remarks         text
);

-- Pricing configuration (admin-managed)
create table pricing_config (
  id                      uuid primary key default gen_random_uuid(),
  key                     text not null unique,
  value                   numeric not null,
  description             text,
  updated_by              text,
  updated_at              timestamptz default now()
);

-- Seed default config
insert into pricing_config (key, value, description) values
  ('target_margin_pct',     30,  'Default target margin %'),
  ('minimum_margin_pct',    15,  'Minimum margin % before floor price'),
  ('healthy_margin_pct',    25,  'Threshold for green status'),
  ('amber_margin_pct',      15,  'Threshold for amber status'),
  ('max_discount_pct',      20,  'Maximum permissible discount without approval'),
  ('quote_validity_days',   30,  'Default quote validity in days');
```

### 3.2 Row Level Security (RLS)

```sql
-- Vendors: only finance/admin/super_admin can read
alter table vendors enable row level security;
create policy "vendor_read_restricted" on vendors
  for select using (
    exists (
      select 1 from user_roles
      where email = auth.jwt() ->> 'email'
      and role in ('finance', 'admin', 'super_admin')
    )
  );

-- vendor_pricing: same restriction
alter table vendor_pricing enable row level security;
create policy "vendor_pricing_read_restricted" on vendor_pricing
  for select using (
    exists (
      select 1 from user_roles
      where email = auth.jwt() ->> 'email'
      and role in ('finance', 'admin', 'super_admin')
    )
  );

-- quote_pricing: lowest_vendor_cost, avg_vendor_cost hidden from sales
-- Sales can read quote_pricing but vendor cost columns returned as null at API layer (not RLS)
-- RLS allows all authenticated credresolve.com users to read quotes they created or are approving
alter table quotes enable row level security;
create policy "quotes_access" on quotes
  for all using (
    created_by = auth.jwt() ->> 'email'
    or exists (
      select 1 from user_roles
      where email = auth.jwt() ->> 'email'
      and role in ('manager','finance','admin','super_admin')
    )
  );
```

---

## 4. Pricing Calculation Engine

### 4.1 Core Logic (`lib/pricing-engine.ts`)

```
INPUTS:
  channels[]         — channel configs (type, plan, minutes, concurrent)
  addons[]           — add-ons with quantity
  commitment_months  — 1, 3, 6, 12, 24, 36
  sales_input_price  — entered by sales
  manual_discount    — % entered by sales

CALCULATION FLOW:

Step 1 — Fetch vendor costs for selected config
  vendorCosts = query vendor_pricing matching channel config
  lowestCost  = MIN(vendorCosts.cost_per_unit)
  avgCost     = AVG(vendorCosts.cost_per_unit)
  preferredCost = cost of vendor where is_preferred = true

Step 2 — Fetch pricing config thresholds
  targetMargin   = pricing_config['target_margin_pct']
  minimumMargin  = pricing_config['minimum_margin_pct']
  maxDiscount    = pricing_config['max_discount_pct']

Step 3 — Calculate price benchmarks
  basePrice     = lowestCost / (1 - targetMargin/100)
  floorPrice    = lowestCost / (1 - minimumMargin/100)
  suggestedPrice = basePrice  (recommended starting point)

Step 4 — Apply channel-level discounts
  channelDiscount = weighted avg of per-channel discounts
  adjustedInput   = salesInputPrice * (1 - channelDiscount/100)

Step 5 — Apply manual discount
  discountedPrice = adjustedInput * (1 - manualDiscount/100)

Step 6 — Calculate margin & profitability
  grossProfit   = discountedPrice - lowestCost
  grossMarginPct = (grossProfit / discountedPrice) * 100
  
  profitStatus:
    grossMarginPct >= healthyMargin  → 'healthy'   (GREEN)
    grossMarginPct >= minimumMargin  → 'near_minimum' (AMBER)
    grossMarginPct < minimumMargin   → 'loss'      (RED)

Step 7 — Approval check
  approvalRequired = (
    discountedPrice < floorPrice
    OR grossMarginPct < minimumMargin
    OR manualDiscount > maxDiscount
    OR grossProfit < 0
  )

Step 8 — Discount recommendation
  availableBuffer = salesInputPrice - basePrice
  if availableBuffer > 0:
    recommendedAdditionalDiscount = calculateIncrementalDiscount(
      buffer, commitment_months, volume, product_mix
    )
  else:
    recommendedAdditionalDiscount = 0
    
  Incremental discount factors:
    commitment >= 24 months → +2%
    commitment >= 12 months → +1%
    volume > 100 channels   → +1.5%
    has premium addons      → +0.5%
    strategic account       → +1% (manual flag)
```

### 4.2 Discount Recommendation Rules

```
NEVER suggest full available buffer as discount upfront.
Recommend in steps:

  buffer = salesInputPrice - floorPrice
  step1  = buffer * 0.30   (safe first offer)
  step2  = buffer * 0.20   (if needed, second offer)
  
  Additional multipliers (additive, capped at maxDiscount):
    +1%   per 6 months commitment beyond 12
    +0.5% per 50 channels volume beyond 50
    +0.5% if recording + analytics both selected
  
  Output: "Recommended Additional Discount: X.X%"
  (Never auto-apply. Sales must manually enter.)
```

---

## 5. API Routes

### 5.1 Route Map

```
/api/pricing/quotes
  GET     — list quotes (filtered by role)
  POST    — create new quote

/api/pricing/quotes/[id]
  GET     — get quote detail
  PATCH   — update quote
  DELETE  — delete draft quote

/api/pricing/quotes/[id]/channels
  GET     — get channel configs
  POST    — add channel
  PUT     — replace all channels

/api/pricing/quotes/[id]/addons
  GET/POST/PUT — manage add-ons

/api/pricing/quotes/[id]/calculate
  POST    — run pricing engine, store result in quote_pricing
  Response (sales role — vendor costs redacted):
    { basePrice, floorPrice, suggestedPrice, salesInputPrice,
      grossMarginPct, grossProfit, profitStatus, approvalRequired,
      recommendedAdditionalDiscount, colorIndicator }
  Response (finance/admin — full):
    + lowestVendorCost, avgVendorCost, preferredVendorCost

/api/pricing/quotes/[id]/submit
  POST    — submit for approval (creates approval_request if required)

/api/pricing/quotes/[id]/approve
  POST    — approve/reject/revise (manager/finance/admin only)

/api/pricing/quotes/[id]/pdf
  GET     — generate & return client-facing PDF (no vendor data)

/api/pricing/vendors
  GET/POST/PATCH — admin/finance only

/api/pricing/config
  GET     — admin only: pricing thresholds
  PATCH   — admin only: update thresholds

/api/pricing/audit
  GET     — paginated audit log (admin/finance only)
```

### 5.2 Vendor Cost Redaction Middleware

All `/api/pricing/quotes/*/calculate` responses must strip vendor cost fields for `sales` and `manager` roles:

```ts
const REDACTED_FIELDS = ['lowestVendorCost', 'avgVendorCost', 'preferredVendorCost'];

function redactForRole(data: PricingResult, role: string) {
  if (['finance', 'admin', 'super_admin'].includes(role)) return data;
  return Object.fromEntries(
    Object.entries(data).filter(([k]) => !REDACTED_FIELDS.includes(k))
  );
}
```

---

## 6. UI — New Screens

### 6.1 Route Structure (Next.js App Router)

```
app/
  pricing/
    page.tsx                    — Quote list
    new/
      page.tsx                  — Create quote wizard
    [id]/
      page.tsx                  — Quote detail shell
      channel-volume/
        page.tsx                — Step 1: Channel & Volume
      pricing/
        page.tsx                — Step 2: Pricing & Finalise
      review/
        page.tsx                — Step 3: Review & Submit
      approval/
        page.tsx                — Approval screen (manager view)
```

### 6.2 Channel & Volume Screen

Fields per channel row:
- Channel Type (Inbound / Outbound / Blended) — dropdown
- Plan Type (Pulse / Unlimited) — toggle
- Concurrent Channels — number input
- Avg Call Duration (sec) — shown only for Pulse
- Monthly Minutes Commitment — number input
- Traffic Distribution (Peak % / Off-Peak %) — two sliders summing to 100
- Channel-level Discount % — number input
- Commercial Commitment Period — dropdown (1/3/6/12/24/36 months)

Add-ons section (checkboxes + quantity):
- Agentic Voice
- AI Services
- Call Recording
- Analytics Dashboard
- Custom (free text + price)

### 6.3 Pricing & Finalise Screen

**Visible to all roles:**

| Field | Value |
|---|---|
| Base Price | ₹X.XX / min |
| Suggested Price | ₹X.XX / min |
| Sales Input Price | [editable input] |
| Manual Discount % | [editable input] |
| Final Price | ₹X.XX / min |
| Gross Margin % | XX.X% |
| Gross Profit | ₹X,XX,XXX |
| Profit Status | 🟢 / 🟡 / 🔴 |
| Approval Required | Yes / No |
| Recommended Add'l Discount | X.X% (if available) |

**Visible only to finance/admin/super_admin:**

| Field | Value |
|---|---|
| Vendor Cost (Lowest) | ₹X.XX / min |
| Vendor Cost (Average) | ₹X.XX / min |
| Floor Price | ₹X.XX / min |

**Vendor Name: never displayed on any screen.**

### 6.4 Approval Screen

Displays to approver:
- Quote summary
- Expected Margin %
- Revenue Impact (MRC + ACV)
- Discount Justification (entered by sales at submission)
- Profitability Status (color)
- Vendor Benchmark Cost (finance/admin only)
- Action buttons: Approve / Reject / Request Revision

---

## 7. PDF Generation

### 7.1 Library

Use `@react-pdf/renderer` — renders React components to PDF server-side, no headless browser needed.

### 7.2 PDF Structure

```
Page 1 — Cover
  Logo | Quote ID | Date | Validity

Page 2 — Customer & Configuration
  Customer Name, Address
  Product Configuration
  Channel & Volume Summary
  Add-ons

Page 3 — Pricing Summary
  Base Price (per unit)
  Discount Applied
  Final Commercial
  MRC (Monthly Recurring Cost)
  ARC (Annual Recurring Cost)
  Taxes (GST 18% if applicable)

Page 4 — Terms
  Commercial Validity
  Payment Terms
  SLA Commitments
  Exclusions
  Terms & Conditions

Footer (all pages): Confidential — Not for distribution
```

### 7.3 What is Explicitly Excluded from PDF

- Vendor names
- Vendor costs (lowest/average/preferred)
- Internal margin %
- Floor price
- Approval notes / workflow status
- Internal pricing logic or calculation steps

---

## 8. Approval Workflow State Machine

```
                  [Sales submits]
                       │
              ┌────────▼────────┐
              │  pending_approval │  ← approval_required = true
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
    ┌─────▼─────┐  ┌───▼───┐  ┌────▼──────────────┐
    │ approved  │  │rejected│  │revision_requested  │
    └─────┬─────┘  └───────┘  └────────┬───────────┘
          │                            │
    ┌─────▼──────┐              [Sales edits & resubmits]
    │ finalized  │                     │
    └────────────┘              [back to pending_approval]

If approval_required = false:
  submit → finalized directly (no approval_request created)
```

**Approval Triggers:**

| Condition | Trigger |
|---|---|
| `discountedPrice < floorPrice` | `below_floor` |
| `grossMarginPct < minimumMargin` | `below_margin_threshold` |
| `manualDiscount > maxDiscount` | `excess_discount` |
| `grossProfit < 0` | `loss_making` |

---

## 9. Audit & Governance

Every state change, price edit, and PDF generation writes to `audit_logs`:

```ts
await supabase.from('audit_logs').insert({
  entity_type: 'quote',
  entity_id: quoteId,
  action: 'price_updated',
  changed_by: session.user.email,
  previous_value: { salesInputPrice: prev },
  updated_value:  { salesInputPrice: next },
  remarks: null
});
```

**Events logged:**
- Quote created / updated / deleted
- Channel config saved
- Pricing calculated
- Discount entered / modified
- Approval submitted / approved / rejected / revised
- PDF generated
- Config changes (admin)
- Vendor added / updated (admin)

---

## 10. Implementation Sequence

### Phase 1 — Foundation (Week 1)
1. Add Supabase to PlanX (`@supabase/supabase-js`)
2. Run DB migrations (all tables above)
3. Extend NextAuth session with role from `user_roles`
4. Role-based middleware

### Phase 2 — Pricing Engine Core (Week 2)
5. `lib/pricing-engine.ts` — pure calculation function (unit-testable)
6. API routes: quotes CRUD, channels, calculate
7. Vendor & pricing config APIs (admin-gated)

### Phase 3 — UI (Week 3)
8. Quote list page
9. Channel & Volume form
10. Pricing & Finalise screen with color indicators
11. Role-based field visibility (vendor cost redaction)

### Phase 4 — Approval & PDF (Week 4)
12. Approval workflow APIs + approval screen UI
13. PDF generation (`@react-pdf/renderer`)
14. Email notifications on approval trigger

### Phase 5 — Audit & Hardening (Week 5)
15. Audit log writes on all mutations
16. Audit log viewer (admin)
17. Pricing config admin screen
18. End-to-end testing

---

## 11. New Dependencies

```json
{
  "@supabase/supabase-js": "^2.x",
  "@react-pdf/renderer": "^3.x",
  "zod": "^3.x"
}
```

---

## 12. Environment Variables (add to `.env.local` + Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server-only, never exposed to client
```
