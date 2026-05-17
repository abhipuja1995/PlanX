# Pricing Engine — Technical Design
**Project:** Nirmaan CE (PlanX)  
**Version:** 1.1  
**Date:** 2026-05-17  
**Status:** Design Phase — Updated from live deployment audit

---

## Changelog (v1.0 → v1.1)

| # | Change | Source |
|---|---|---|
| 1 | Supabase already connected — env vars `CE_SUPABASE_URL` + `CE_SUPABASE_SERVICE_ROLE_KEY` exist in production | Vercel env audit |
| 2 | Use `CE_` prefix for all Supabase env vars (not `NEXT_PUBLIC_SUPABASE_*`) | Vercel env audit |
| 3 | Anthropic Claude available (`ANTHROPIC_API_KEY`) — replace xAI for pricing insights | Vercel env audit |
| 4 | WhatsApp notifications available via Green API (`GREEN_API_TOKEN`, `GREEN_API_INSTANCE`, `WA_BUG_GROUP_ID`) | Vercel env audit |
| 5 | SMTP mailer already built (`/api/mailer`) — reuse for approval email notifications | Existing code |
| 6 | Phase 1 updated — Supabase client setup only (credentials exist, no fresh project needed) | Vercel env audit |

---

## 1. Overview

The Pricing Engine is a new module within PlanX that enables the sales team to configure channel/volume-based quotes, calculates commercials dynamically, enforces margin protection, and generates client-shareable PDF proposals.

### Current Stack (Live)
```
Next.js 14 · NextAuth (Google, @credresolve.com only) · Plane API · xAI Grok · 
Supabase (connected, CE_ prefix) · Anthropic Claude · Green API (WhatsApp) · SMTP Mailer
```

### Stack Additions for Pricing Engine
```
@react-pdf/renderer (PDF generation) · zod (schema validation)
```
Supabase and Claude are **already wired in production** — no new service setup required.

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
- On session callback, fetch role from `user_roles` by email using service role client
- Attach `role` to session token
- Gates on role enforced via middleware + API route checks

**Supabase client setup** (`lib/supabase.ts`):
```ts
import { createClient } from '@supabase/supabase-js';

// Server-side only (API routes) — uses service role key, bypasses RLS
export const supabaseAdmin = createClient(
  process.env.CE_SUPABASE_URL!,
  process.env.CE_SUPABASE_SERVICE_ROLE_KEY!
);
```

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
  discount_at_channel     numeric(5,2) default 0,
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

-- Quotes: creator or elevated role can access
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

Note: All API routes use `supabaseAdmin` (service role) and enforce access control at the application layer. RLS is a safety net, not the primary access control mechanism.

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
  vendorCosts   = query vendor_pricing matching channel config
  lowestCost    = MIN(vendorCosts.cost_per_unit)
  avgCost       = AVG(vendorCosts.cost_per_unit)
  preferredCost = cost of vendor where is_preferred = true

Step 2 — Fetch pricing config thresholds
  targetMargin  = pricing_config['target_margin_pct']
  minimumMargin = pricing_config['minimum_margin_pct']
  maxDiscount   = pricing_config['max_discount_pct']

Step 3 — Calculate price benchmarks
  basePrice      = lowestCost / (1 - targetMargin/100)
  floorPrice     = lowestCost / (1 - minimumMargin/100)
  suggestedPrice = basePrice

Step 4 — Apply channel-level discounts
  channelDiscount = weighted avg of per-channel discounts
  adjustedInput   = salesInputPrice * (1 - channelDiscount/100)

Step 5 — Apply manual discount
  discountedPrice = adjustedInput * (1 - manualDiscount/100)

Step 6 — Calculate margin & profitability
  grossProfit    = discountedPrice - lowestCost
  grossMarginPct = (grossProfit / discountedPrice) * 100

  profitStatus:
    grossMarginPct >= healthyMargin  → 'healthy'      (GREEN)
    grossMarginPct >= minimumMargin  → 'near_minimum' (AMBER)
    grossMarginPct <  minimumMargin  → 'loss'         (RED)

Step 7 — Approval check
  approvalRequired = (
    discountedPrice < floorPrice
    OR grossMarginPct < minimumMargin
    OR manualDiscount > maxDiscount
    OR grossProfit < 0
  )

Step 8 — Discount recommendation
  availableBuffer = salesInputPrice - floorPrice
  if availableBuffer > 0:
    recommendedAdditionalDiscount = calculateIncrementalDiscount(
      buffer, commitment_months, volume, product_mix
    )
  else:
    recommendedAdditionalDiscount = 0

  Incremental discount factors (additive):
    commitment >= 24 months → +2%
    commitment >= 12 months → +1%
    volume > 100 channels   → +1.5%
    has premium addons      → +0.5%
    strategic account flag  → +1%
```

### 4.2 Claude-Powered Pricing Insight (NEW in v1.1)

The existing `ANTHROPIC_API_KEY` enables Claude to provide a natural-language pricing recommendation alongside the numeric output.

```ts
// lib/pricing-insight.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function getPricingInsight(pricingResult: PricingResult): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are a pricing advisor. Given this quote data, provide a 2-3 sentence recommendation
      focused on: win probability, margin sustainability, and one negotiation tip.
      Data: ${JSON.stringify(pricingResult)}
      Respond in plain text, no markdown.`
    }]
  });
  return (msg.content[0] as { text: string }).text;
}
```

This replaces the planned xAI call for insights. Shown on the Pricing & Finalise screen below the margin indicators.

### 4.3 Discount Recommendation Rules

```
NEVER suggest full available buffer as discount upfront.
Recommend in steps:

  buffer = salesInputPrice - floorPrice
  step1  = buffer * 0.30   (safe first offer)
  step2  = buffer * 0.20   (if needed, second offer)

  Multipliers (additive, capped at maxDiscount):
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
  POST    — run pricing engine, store result in quote_pricing, return insight from Claude
  Response (sales/manager — vendor costs redacted):
    { basePrice, suggestedPrice, salesInputPrice, grossMarginPct,
      grossProfit, profitStatus, colorIndicator, approvalRequired,
      recommendedAdditionalDiscount, pricingInsight }
  Response (finance/admin/super_admin — full):
    + lowestVendorCost, avgVendorCost, preferredVendorCost, floorPrice

/api/pricing/quotes/[id]/submit
  POST    — submit for approval (creates approval_request if required)
           triggers WhatsApp + email notifications to approvers

/api/pricing/quotes/[id]/approve
  POST    — approve/reject/revise (manager/finance/admin only)
           triggers WhatsApp + email notification to quote creator

/api/pricing/quotes/[id]/pdf
  GET     — generate & return client-facing PDF (vendor data excluded)

/api/pricing/vendors
  GET/POST/PATCH — finance/admin only

/api/pricing/config
  GET/PATCH — admin/super_admin only

/api/pricing/audit
  GET     — paginated audit log (admin/finance only)
```

### 5.2 Vendor Cost Redaction

```ts
const VENDOR_FIELDS = ['lowestVendorCost', 'avgVendorCost', 'preferredVendorCost', 'floorPrice'];

function redactForRole(data: PricingResult, role: string) {
  if (['finance', 'admin', 'super_admin'].includes(role)) return data;
  return Object.fromEntries(
    Object.entries(data).filter(([k]) => !VENDOR_FIELDS.includes(k))
  );
}
```

---

## 6. Notification System (UPDATED in v1.1)

Both notification channels are **already live in production** — no new setup required.

### 6.1 WhatsApp (Green API) — Primary

Reuse the existing Green API integration (`GREEN_API_TOKEN`, `GREEN_API_INSTANCE`).

**Approval request notification to approver:**
```
🔔 *Approval Required*
Quote: NRM-2026-0042
Customer: Acme Corp
Sales: john@credresolve.com
Margin: 18.2% 🟡
Reason: Discount exceeds permissible limit
→ Review: https://planx-psi.vercel.app/pricing/NRM-2026-0042/approval
```

**Approval outcome notification to sales:**
```
✅ *Quote Approved*   /   ❌ *Quote Rejected*   /   🔄 *Revision Requested*
Quote: NRM-2026-0042
Reviewed by: manager@credresolve.com
Remarks: [remarks text]
```

### 6.2 Email (SMTP) — Secondary

Reuse existing `/api/mailer` route for email fallback and formal record.

**Trigger points:**
- Quote submitted for approval → email to approver group
- Approval action taken → email to quote creator
- PDF generated → email with PDF attachment (optional)

---

## 7. UI — New Screens

### 7.1 Route Structure (Next.js App Router)

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

### 7.2 Channel & Volume Screen

Fields per channel row:
- Channel Type (Inbound / Outbound / Blended) — dropdown
- Plan Type (Pulse / Unlimited) — toggle
- Concurrent Channels — number input
- Avg Call Duration (sec) — shown only for Pulse
- Monthly Minutes Commitment — number input
- Traffic Distribution (Peak % / Off-Peak %) — sliders summing to 100
- Channel-level Discount % — number input
- Commercial Commitment Period — dropdown (1/3/6/12/24/36 months)

Add-ons (checkboxes + quantity):
- Agentic Voice
- AI Services
- Call Recording
- Analytics Dashboard
- Custom (free text + price)

### 7.3 Pricing & Finalise Screen

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
| Claude Pricing Insight | [2-3 sentence recommendation] ← NEW |

**Visible only to finance/admin/super_admin:**

| Field | Value |
|---|---|
| Vendor Cost (Lowest) | ₹X.XX / min |
| Vendor Cost (Average) | ₹X.XX / min |
| Floor Price | ₹X.XX / min |

**Vendor Name: never displayed on any screen.**

### 7.4 Approval Screen

Displays to approver:
- Quote summary
- Expected Margin %
- Revenue Impact (MRC + ACV)
- Discount Justification (entered by sales at submission)
- Profitability Status (color indicator)
- Vendor Benchmark Cost (finance/admin only)
- Action buttons: Approve / Reject / Request Revision

---

## 8. PDF Generation

### 8.1 Library

`@react-pdf/renderer` — renders React components to PDF server-side.

### 8.2 PDF Structure

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
  Commercial Validity | Payment Terms | SLA Commitments
  Exclusions | Terms & Conditions

Footer (all pages): Confidential — Not for distribution
```

### 8.3 Explicitly Excluded from PDF

- Vendor names and vendor costs
- Internal margin % and floor price
- Approval workflow status and notes
- Claude pricing insights (internal)
- Internal pricing logic

---

## 9. Approval Workflow State Machine

```
                  [Sales submits]
                       │
              ┌────────▼────────┐
              │ pending_approval │  ← approval_required = true
              └────────┬────────┘
           WhatsApp + Email sent to approvers
                       │
          ┌────────────┼────────────┐
          │            │            │
    ┌─────▼─────┐  ┌───▼───┐  ┌────▼──────────────┐
    │ approved  │  │rejected│  │revision_requested  │
    └─────┬─────┘  └───────┘  └────────┬───────────┘
  WA+Email to sales               WA+Email to sales
          │                            │
    ┌─────▼──────┐              [Sales edits & resubmits]
    │ finalized  │                     │
    └────────────┘              [back to pending_approval]

If approval_required = false:
  submit → finalized directly (no approval_request, no notifications)
```

**Approval Triggers:**

| Condition | Trigger Key |
|---|---|
| `discountedPrice < floorPrice` | `below_floor` |
| `grossMarginPct < minimumMargin` | `below_margin_threshold` |
| `manualDiscount > maxDiscount` | `excess_discount` |
| `grossProfit < 0` | `loss_making` |

---

## 10. Audit & Governance

```ts
await supabaseAdmin.from('audit_logs').insert({
  entity_type: 'quote',
  entity_id: quoteId,
  action: 'price_updated',
  changed_by: session.user.email,
  previous_value: { salesInputPrice: prev },
  updated_value:  { salesInputPrice: next },
  remarks: null
});
```

**Events logged:** quote CRUD · channel config saved · pricing calculated · discount modified · approval submitted/actioned · PDF generated · config changes · vendor changes

---

## 11. Implementation Sequence (UPDATED in v1.1)

### Phase 1 — Foundation (Week 1)
1. `lib/supabase.ts` — Supabase admin client using `CE_SUPABASE_URL` + `CE_SUPABASE_SERVICE_ROLE_KEY`
2. Run DB migrations (all tables in §3)
3. Extend NextAuth session with role lookup from `user_roles`
4. Role-based middleware for `/pricing/*` routes

### Phase 2 — Pricing Engine Core (Week 2)
5. `lib/pricing-engine.ts` — pure calculation function
6. `lib/pricing-insight.ts` — Claude insight using existing `ANTHROPIC_API_KEY`
7. API routes: quotes CRUD, channels, addons, calculate
8. Vendor & pricing config APIs (admin-gated)

### Phase 3 — UI (Week 3)
9. Quote list page
10. Channel & Volume form
11. Pricing & Finalise screen with color indicators + Claude insight
12. Role-based field visibility (vendor cost redaction)

### Phase 4 — Approval, Notifications & PDF (Week 4)
13. Approval workflow APIs + approval screen UI
14. WhatsApp notifications via existing Green API
15. Email notifications via existing `/api/mailer`
16. PDF generation (`@react-pdf/renderer`)

### Phase 5 — Audit & Hardening (Week 5)
17. Audit log writes on all mutations
18. Audit log viewer (admin)
19. Pricing config admin screen
20. End-to-end testing + Vercel deploy

---

## 12. Dependencies

### New (to install)
```json
{
  "@react-pdf/renderer": "^3.x",
  "zod": "^3.x"
}
```

### Already in Production (no install needed)
```json
{
  "@supabase/supabase-js": "already configured",
  "@anthropic-ai/sdk": "already configured"
}
```

---

## 13. Environment Variables

### Already in Vercel Production
```
CE_SUPABASE_URL                  ✅ exists
CE_SUPABASE_SERVICE_ROLE_KEY     ✅ exists
ANTHROPIC_API_KEY                ✅ exists
GREEN_API_TOKEN                  ✅ exists
GREEN_API_INSTANCE               ✅ exists
WA_BUG_GROUP_ID                  ✅ exists (use as fallback approver group)
SMTP_HOST / SMTP_PORT / etc.     ✅ exists
```

### To Add
```
PRICING_APPROVER_WA_GROUP_ID=    # WhatsApp group for approval notifications
                                 # Can reuse WA_BUG_GROUP_ID initially
```
