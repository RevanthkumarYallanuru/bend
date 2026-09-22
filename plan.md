# Lakshmi Ganapathi Enterprises — Complete Development Plan

> **Project:** Lakshmi Ganapathi Enterprises Management System **Architecture:** React + TypeScript + Vite + Tailwind → Node.js + Express + TypeScript → Prisma → Neon PostgreSQL **Development strategy:** Vertical slices + targeted testing + milestone regression **Current status:** Backend core development in progress

---

## 1. Project Objective

Build a reliable, simple-to-use wholesale business management system for **Lakshmi Ganapathi Enterprises**.

The application should manage:

- Customers
- Products/items
- Categories
- Billing
- Payments
- Customer ledger
- Outstanding balances
- Delivery/collection tracking
- Reports
- Excel exports
- Bill printing
- User authentication
- Audit history

The UI should remain simple enough for day-to-day business use, while the backend/database should maintain strong financial and data integrity.

---

# 2. Technology Architecture

```text
┌───────────────────────────────────────┐
│              FRONTEND                 │
│ React + TypeScript + Vite + Tailwind │
└───────────────────┬───────────────────┘
                    │
                    │ HTTP / JSON
                    ▼
┌───────────────────────────────────────┐
│               BACKEND                 │
│ Node.js + Express + TypeScript       │
│                                       │
│ Auth / Validation / Business Logic   │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│                ORM                    │
│               Prisma                  │
└───────────────────┬───────────────────┘
                    │
                    ▼
┌───────────────────────────────────────┐
│              DATABASE                 │
│        Neon PostgreSQL                │
└───────────────────────────────────────┘
```

### Core principle

```text
Frontend
   ↓
collect/display data

Backend
   ↓
validate + calculate + enforce business rules

Database
   ↓
final source of truth + integrity constraints
```

The frontend must **never be responsible for final financial calculations or balances**.

---

# 3. Business Scope

## Expected Scale

| Area | Expected maximum |
| --- | --- |
| Regular customers | \~200 |
| Items | \~50 |
| Bills/day | \~200 |
| Transactions/day | \~500 |
| Minimum expected transactions/day | \~150–200 |

Neon PostgreSQL is sufficient for the current expected workload.

---

# 4. Core Business Requirements

## Customers

- Customer code
- English name
- Telugu name
- Phone
- Alternate phone
- Organization
- Address
- Notes
- Active/inactive status
- Customer transaction history
- Customer outstanding balance

## Items

- Item code
- English name
- Telugu name
- Category
- Unit
- Standard price
- Active/inactive status

## Billing

Support:

- Customer bills
- Walk-in bills
- Multiple items
- Quantity
- Standard rate
- Custom rate
- Discount
- Previous balance
- Current bill
- Amount paid
- Current bill balance
- Overall balance
- Transaction date/time
- Historical customer snapshots

## Payments

Support:

- Full payment
- Partial payment
- Payment-only transaction
- Payment against specific bills
- Multiple bill allocations
- Unallocated customer payment
- Cash
- UPI
- Bank transfer
- Cheque
- Other

## Ledger

Track:

```text
SALE       → Debit
PAYMENT    → Credit
RETURN     → Credit/adjustment
ADJUSTMENT → Controlled correction
```

Every customer should have a traceable financial history.

## Delivery

Internal tracking only:

```text
GENERATED
   ↓
SENT
   ↓
REACHED
   ↓
BALANCE
   ↓
CLEARED
```

Delivery information should not unnecessarily appear on the customer bill.

## Reports

Support:

- Today
- Week
- Month
- Custom date range
- Sales
- Payments
- Outstanding
- Customer history
- Item sales
- Monthly sales
- Daily sales
- Excel export

---

# 5. DATABASE — COMPLETED

## Database status

**DONE**

### Tables created

```text
1. businesses
2. users
3. customers
4. categories
5. items
6. item_units
7. bills
8. bill_items
9. payments
10. payment_allocations
11. ledger_entries
12. delivery_agents
13. bill_deliveries
14. audit_logs
```

---

## Database enums

```text
user_role
├── ADMIN
└── STAFF

bill_type
├── CUSTOMER
└── WALK_IN

bill_status
├── DRAFT
├── COMPLETED
└── CANCELLED

payment_method
├── CASH
├── UPI
├── BANK_TRANSFER
├── CHEQUE
└── OTHER

ledger_entry_type
├── SALE
├── PAYMENT
├── RETURN
└── ADJUSTMENT

delivery_status
├── GENERATED
├── SENT
├── REACHED
├── BALANCE
└── CLEARED

audit_action
├── CREATE
├── UPDATE
├── CANCEL
└── RESTORE
```

---

# 6. Database Integrity — COMPLETED

Implemented:

- Foreign keys
- Unique constraints
- Non-negative financial values
- Bill total validation
- Bill discount validation
- Bill item calculation validation
- Customer/business isolation
- Updated-at triggers
- Financial history protection

Important constraint:

```text
line_total =
ROUND((quantity × actual_rate) - discount, 2)
```

---

# 7. Database Sequences — COMPLETED

Bill number:

```text
BILL-000001
BILL-000002
BILL-000003
...
```

Payment number:

```text
PAY-000001
PAY-000002
PAY-000003
...
```

Implemented using PostgreSQL sequences/functions.

---

# 8. Database Reporting Views — COMPLETED

Created:

```text
customer_balances
customer_sales_summary
customer_transaction_history
daily_payment_summary
daily_sales_summary
item_sales_summary
monthly_sales_summary
```

These will later support the Reports API and dashboard.

---

# 9. Database Acceptance Testing

The automated database acceptance test was created and executed.

It covered:

- Tables
- Views
- Sequences
- Generator functions
- Constraints
- Foreign keys
- Bills
- Payments
- Partial payments
- Payment-only transactions
- Custom pricing
- Walk-in bills
- Delivery
- Cancellation
- Reporting
- Negative cases

The test was intentionally wrapped in a transaction and rolled back.

### Important

The temporary:

```text
db_test_results
```

table disappeared after rollback.

That is expected because it was a temporary testing artifact, **not an application table**.

---

# 10. BACKEND FOUNDATION — COMPLETED

Backend stack:

```text
Node.js
Express
TypeScript
Prisma 7
PostgreSQL
Neon
```

Prisma 7 driver-adapter configuration is in place.

---

## Backend structure

```text
backend/
├── prisma/
│   └── schema.prisma
│
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   └── database.ts
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   └── validation.middleware.ts
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── customers/
│   │   ├── categories/
│   │   ├── items/
│   │   ├── bills/
│   │   ├── payments/
│   │   ├── ledger/
│   │   ├── deliveries/
│   │   └── reports/
│   │
│   ├── routes/
│   │   └── index.ts
│   │
│   ├── app.ts
│   └── server.ts
│
├── prisma7.config.ts
├── .env
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

# 11. Prisma — COMPLETED

Successfully:

```bash
npx prisma db pull
```

Result:

```text
14 models introspected
```

Then:

```bash
npx prisma generate
```

Result:

```text
Prisma Client generated successfully
```

Database connectivity test also passed.

---

# 12. Authentication — COMPLETED

Status:

```text
✅ 5/5
```

Implemented:

- Login
- JWT
- User/business identification
- Role handling
- `/auth/me`
- Invalid credentials handling
- Missing token handling
- Invalid token handling

Current test:

```text
5/5 PASS
```

---

# 13. Customers Module — COMPLETED

Status:

```text
✅ 7/7
```

Implemented:

```text
Create customer
List customers
Search customers
Get customer
Update customer
Activate/deactivate customer
Business isolation
```

Authentication is enforced on customer routes.

---

# 14. Categories Module — COMPLETED

Status:

```text
✅ 8/8
```

Implemented:

- Create
- List
- Get
- Update
- Activate/deactivate
- Search/validation
- Business isolation

---

# 15. Items + Units — COMPLETED

Status:

```text
✅ 13/13
```

Implemented:

- Items
- Categories relationship
- Units
- Standard prices
- Default units
- Item status
- Validation
- Business isolation

---

# 16. Billing — COMPLETED

Status:

```text
✅ 42/42
```

Implemented:

- Customer bills
- Walk-in bills
- Bill number generation
- Bill items
- Quantity
- Standard price
- Actual/custom price
- Discount
- Totals
- Customer snapshots
- Previous balance
- Amount paid
- Current bill balance
- Overall balance
- Transaction timestamp
- Business isolation
- Validation
- Cancellation safety
- Audit-related handling
- Reporting support

---

# 17. Current Backend Test Status

```text
Authentication         5/5
Customers              7/7
Categories             8/8
Items + Units         13/13
Billing               43/43
Payments              33/33
Ledger                19/19
Delivery + Tracking   21/21
Reports + Dashboard   16/16
────────────────────────────
TOTAL                165/165
```

```text
TypeScript     ✅ PASS
Prisma         ✅ VALID
Database       ✅ CONNECTED
```

Current backend core status:

# **165/165 PASS — BACKEND FROZEN**

Full report: `docs/reports/BACKEND_FINAL_QA_REPORT.md`.

---

# 18. TOKEN-OPTIMIZED DEVELOPMENT STRATEGY

This is the updated strategy going forward.

## Do NOT run full regression after every phase.

Instead:

```text
NEW PHASE
   ↓
Phase-specific tests
   ↓
Fix failures
   ↓
TypeScript
   ↓
Prisma validation if required
   ↓
2–5 critical smoke tests
   ↓
NEXT PHASE
```

---

## Full regression only at milestones

### Milestone 1

Backend modules complete.

```text
Auth
Customers
Categories
Items
Billing
Payments
Ledger
Cancellation
Delivery
Reports
Exports
```

Then:

```text
FULL BACKEND REGRESSION
```

### Milestone 2

Frontend/backend integration complete.

Then:

```text
FULL INTEGRATION REGRESSION
```

### Milestone 3

Before production:

```text
SECURITY
PERFORMANCE
FINANCIAL
PRINTING
RESPONSIVE
PRODUCTION
```

---

# 19. Testing Policy Per Phase

## Every phase

Run:

```text
Phase tests
TypeScript
Relevant Prisma validation
Security tests for new endpoints
2–5 smoke tests
```

## Do not repeatedly run

```text
83 existing tests
```

unless there is a reason.

## Financial modules

Use stronger testing for:

```text
Billing
Payments
Ledger
Cancellation
```

These modules affect money and balances.

---

# 20. AI Agent Optimization Rules

Every master prompt should instruct the AI:

```text
1. Inspect only relevant files.
2. Do not scan the entire repository unnecessarily.
3. Do not redesign existing architecture.
4. Do not redesign the database.
5. Reuse existing conventions.
6. Do not rewrite working modules.
7. Implement only the requested phase.
8. Run only phase-specific tests.
9. Fix only affected failures.
10. Run TypeScript after implementation.
11. Run Prisma validation when applicable.
12. Run lightweight regression smoke tests.
13. Do not paste complete source code in the final response.
14. Do not provide line-by-line explanations.
15. Produce a compact work/test report.
```

---

# 21. PAYMENTS + ALLOCATIONS + LEDGER

## Status

```text
✅ COMPLETE — 32/32 payments, 19/19 ledger (51/51 new tests)
Full regression: 126/126 PASS
TypeScript: PASS · Prisma: VALID · No schema changes
```

Implemented beyond the minimum listed below: payment reversal (`PATCH /api/payments/:id/cancel`, ADMIN-only) via a compensating `ADJUSTMENT` ledger entry — never deletes payments/allocations/ledger rows. Bill-outstanding calculation excludes allocations belonging to reversed payments. See `docs/reports/PAYMENTS_LEDGER_WORK_REPORT.md`and `docs/reports/PAYMENTS_LEDGER_TEST_REPORT.md` for full detail.

Known gap carried into Phase 2: no "cancellation reason" text is currently captured on bill cancellation or payment reversal (see Section 22).

### Implement

```text
Payments
Payment allocations
Customer payment history
Ledger
Customer balance
Payment-only transactions
Partial payments
Full payments
Unallocated payments
```

### APIs

```text
POST   /api/payments
GET    /api/payments
GET    /api/payments/:id
GET    /api/payments/number/:paymentNumber

GET    /api/customers/:id/payments

GET    /api/ledger/customer/:customerId
GET    /api/ledger/customer/:customerId/balance
```

### Critical rules

```text
Payment amount > 0

Allocation > 0

Total allocation ≤ payment amount

Allocation ≤ bill outstanding

Customer must belong to same business

Bill must belong to same business

Payment + allocation + ledger updates
must happen atomically
```

### Tests

Only:

```text
Payment creation
Partial payment
Full payment
Multiple allocations
Unallocated payment
Payment-only transaction
Over-allocation rejection
Cross-business rejection
Rollback
Ledger balance
Security
TypeScript
Smoke tests
```

---

# 22. PHASE 2 — CANCELLATION + AUDIT

```text
✅ COMPLETE
Billing:  43/43 (was 42/42 + 1 new reason-capture test)
Payments: 33/33 (was 32/32 + 1 new reason-capture test)
TypeScript: PASS · Prisma: VALID · No schema changes
Smoke tests: health 200, bills/payments/ledger unauth 401 — all PASS
```

Bill cancellation, payment reversal, ledger reversal (compensating `ADJUSTMENT` entries), audit logs with old/new snapshots, and user tracking already existed from Phase 1. The only gap — cancellation reason — was closed by adding an optional `reason` field to `PATCH /api/bills/:id/cancel` and `PATCH /api/payments/:id/cancel`: recorded in the ledger reversal entry's `description` and in `audit_logs.new_data.cancellation_reason`. No schema change (reused existing text/JSON fields). Financial history preservation unchanged (nothing is ever deleted).

Per Section 18/19 token-optimized policy, only the touched suites (Billing, Payments) + TypeScript + Prisma + smoke tests were run for this phase — the full 126-test regression was not repeated since no other module was touched.

Implemented:

- Bill cancellation
- Payment cancellation/reversal where required
- Ledger reversal
- Audit logs
- Old/new data snapshots
- User tracking
- Cancellation reason
- Financial history preservation

### Important rule

Never:

```text
DELETE financial history
```

Use:

```text
CANCEL
REVERSAL
ADJUSTMENT
AUDIT
```

---

# 23. PHASE 3 — DELIVERY + TRACKING

```text
✅ COMPLETE — 21/21
```

Delivery agents (`/api/delivery-agents`: create/list/get/update/ activate/deactivate) and deliveries (`/api/deliveries`: assign a completed bill, list/filter, get by id or bill, reassign agent, update status). Status pipeline modeled as a directed graph — `GENERATED → SENT → REACHED → {BALANCE, CLEARED}`, `BALANCE → CLEARED`, `CLEARED` terminal — since REACHED can be settled on the spot (CLEARED) or left with a balance to collect later (BALANCE). Status transitions use optimistic concurrency (conditional `updateMany`) rather than row locks, appropriate for a non-financial, low-concurrency workflow.

Implemented:

```text
Delivery agents
Bill delivery assignment
Delivery status
Sent timestamp
Reached timestamp
Cleared timestamp
Delivery notes
```

APIs for:

```text
Create agent
List agents
Update agent
Assign bill
Update delivery status
Get delivery history
```

---

# 24. PHASE 4 — REPORTS + DASHBOARD APIs + XLSX

```text
✅ COMPLETE — 16/16
```

`exceljs` added as a new dependency (only new dependency across Phases 1–5) for XLSX generation, via a shared `src/utils/xlsx.ts`helper reused by every export endpoint. Date ranges (today/week/ month/custom) resolved in UTC; daily/monthly breakdowns read from the existing `daily_sales_summary`/`daily_payment_summary` views; item-sales and customer-outstanding computed via scoped queries instead of `item_sales_summary`/`customer_balances` directly, since those views either lack `business_id` or exclude inactive customers.

Implemented:

### Sales

```text
Daily
Weekly
Monthly
Custom range
```

### Payments

```text
Daily
Weekly
Monthly
Custom range
```

### Customers

```text
Outstanding
Sales
Payments
Transaction history
```

### Items

```text
Quantity sold
Revenue
Sales frequency
```

### Dashboard

```text
Today's sales
Today's payments
Outstanding amount
Bills today
Customers
Items
Recent transactions
```

### Export

Generate XLSX for:

```text
Sales
Payments
Customer ledger
Outstanding
Item sales
```

---

# 25. PHASE 5 — BACKEND FINAL QA

```text
✅ COMPLETE — 165/165 (full test:all, one continuous run)
TypeScript: PASS · Prisma: VALID · No schema changes
Dependency audit: 1 new transitive advisory (uuid, via exceljs) — documented, not force-fixed (would downgrade Prisma 7→6)
Zero test-data pollution confirmed in business 1 after every suite
```

Full report: `docs/reports/BACKEND_FINAL_QA_REPORT.md`.

At this stage backend functionality is frozen.

Performed:

```text
Full backend regression       ✅ 165/165
API integration tests         ✅ (every module's own suite)
Security tests                ✅ (auth + business isolation per module)
Business isolation tests      ✅ (cross-business rejection in every suite)
Financial consistency tests   ✅ (Billing/Payments/Ledger suites)
Error handling                ✅ (400/404/409 conventions verified throughout)
Input validation              ✅ (Zod schemas + rejection tests throughout)
Concurrency-sensitive checks  ✅ (atomic rollback test; optimistic locking on deliveries)
Database integrity checks     ✅ (schema unchanged, constraints intact)
```

Then:

```text
BACKEND FREEZE
```

No unnecessary architectural changes afterward. Deferred to the later Section 32 "Security QA" milestone (not this phase): wiring up `helmet`/`cors` (installed but unused in `app.ts`), rate limiting.

---

# 26. FRONTEND PHASE 1 — FOUNDATION

```text
✅ COMPLETE
TypeScript: PASS (0 errors) · Verified end-to-end in the browser
against the real backend + Neon data (not mocked)
```

Delivered: Vite scaffold (React 19 + TS + Tailwind v4 + Framer Motion + Lucide, plus react-router-dom, @tanstack/react-query, react-hook-form + zod, @radix-ui primitives — approved additions, see `client/frontend_and_user_requirements.md` decisions); backend CORS enabled (`CORS_ORIGIN` env var, was previously unwired); central axios API client with typed endpoint functions for every existing backend module (auth/customers/categories/items/billing/payments/ledger/ deliveries/reports); AuthContext with persisted session, protected routes, 401→session-expired handling (fixed a bug where a wrong- password *login attempt* was incorrectly treated as session expiry — now only an authenticated request's 401 triggers that path); LanguageContext (English/Telugu) with localStorage persistence and English fallback; full base UI kit (Button/Input/Select/Dialog/ ConfirmDialog/Toast/Card/Badge/Alert/Table/Pagination/SearchInput); desktop sidebar + mobile drawer nav with all 10 sections; Login, Dashboard (wired to `/api/reports/dashboard`, real data verified), and Settings pages; placeholder pages for modules built in later phases. Minimalistic visual direction (neutral palette + single accent color, no gradients/glassmorphism) per requirements §33.

Technology:

```text
React
TypeScript
Vite
Tailwind
```

Implement:

```text
Routing
Layout
Sidebar/navigation
Header
Authentication state
API client
Error handling
Loading states
Toast/notification system
Reusable buttons
Inputs
Tables
Modals
Forms
Cards
Dialogs
```

---

# 27. FRONTEND PHASE 2 — CORE BUSINESS UI

```text
✅ COMPLETE
TypeScript: PASS (0 errors) · Verified end-to-end in the browser
against the real backend + Neon data
```

Delivered: Customers (list, debounced search by name/code/phone,
client-side pagination, create/edit dialog, activate/deactivate with
confirmation, profile page with outstanding balance from `/ledger/
.../balance`, display-only total-sales/total-payments summed from the
customer's own ledger entries, full transaction history table, XLSX
ledger export); Categories (full CRUD); Items (CRUD + a dedicated
Units dialog — add/deactivate/set-default, new items prompt straight
into unit setup since an item needs at least one unit to be billable).
Telugu-suggestion (local phonetic transliteration) wired into every
English/Telugu name pair across all three forms, always editable,
never auto-applied. Found and fixed one real bug during verification:
the shared `Dialog` component had no max-height/scroll, so on shorter
viewports a tall form's submit button became unreachable — fixed once
in the shared component, benefiting every dialog in the app.

Implement:

```text
Dashboard
Customers
Categories
Items
```

### Customer UI

```text
Customer list
Search
Create
Edit
View
Active/inactive
Transaction history
Outstanding
```

### Item UI

```text
Item list
Categories
Units
Prices
Create/edit
Active/inactive
```

---

# 28. FRONTEND PHASE 3 — FINANCIAL UI

```text
✅ COMPLETE
TypeScript: PASS (0 errors) · Verified end-to-end in the browser
against the real backend + Neon data — the full billing → payment →
ledger reconciliation chain confirmed correct on real data
```

Delivered: Billing (customer/walk-in toggle, live item search-to-add,
per-line unit/quantity/rate/discount with a visible "custom rate"
notice, live subtotal/discount/grand-total/previous-balance/current-
bill-balance/overall-balance preview, payment capture at creation,
duplicate-submit protection, bill detail + cancel-with-reason +
browser print); Payments (create with customer picker, live
outstanding-bill allocation UI, reversal with reason, ADMIN-gated);
Ledger (standalone customer-picker page reusing the same panel as the
Customer Profile, entry-type filter, XLSX export).

Found and fixed two real bugs during live verification: (1) a 401 on
a failed *login attempt* was wrongly treated as an expired
*authenticated* session, firing a spurious toast — fixed by only
triggering that path when the failing request actually carried a
token; (2) the "Total Sales"/"Total Payments" ledger summary stats
didn't net out reversal ADJUSTMENT entries, so after reversing a
payment the two stats silently stopped reconciling with the
authoritative Outstanding figure — fixed, and the entry-type filter
was also wrongly re-scoping those stats to the filtered subset
instead of the full history; both now use a separate always-
unfiltered query. A live trace confirmed the fix: Bill ₹380 → partial
pay ₹200 → allocate ₹180 → Outstanding ₹0 → reverse the ₹180 payment
→ Outstanding ₹180, Total Sales ₹380, Total Payments ₹200, all
reconciling correctly.

Implement:

```text
Billing
Payments
Ledger
```

### Billing screen

```text
Select customer
OR
Walk-in

Add items
Quantity
Rate
Custom rate
Discount

Previous balance
Current bill
Paid
Current bill balance
Overall balance
```

### Payment screen

```text
Customer
Payment amount
Payment method
Reference
Allocation
Remaining amount
```

### Ledger screen

```text
Date
Description
Debit
Credit
Balance
```

---

# 29. FRONTEND PHASE 4 — DELIVERY + REPORTS

Implement:

```text
Delivery tracking
Reports
Filters
Date ranges
Dashboard charts
Export buttons
```

Filters:

```text
Today
Week
Month
Custom
```

---

# 30. PRINTING

Implement:

```text
Bill preview
Print bill
Browser print
A4 support if needed
Thermal printer support if required
```

The bill must use stored transaction information.

For example:

```text
Original transaction:
10 September 2026, 3:15 PM

Printed:
12 September 2026
```

The bill must still show:

```text
10 September 2026, 3:15 PM
```

because transaction time is stored separately.

---

# 31. FRONTEND UX REQUIREMENTS

Keep the interface:

- Simple
- Large enough to read
- Mobile-friendly
- Desktop-friendly
- Low-jargon
- Fast
- Clear
- Business-oriented

Avoid unnecessary:

```text
complex dashboards
excessive animations
technical terminology
deep navigation
```

---

# 32. SECURITY QA

Before production:

```text
Authentication
Authorization
JWT validation
Business isolation
Role permissions
Input validation
SQL injection protection
Mass assignment protection
Sensitive error handling
Environment secrets
CORS
Rate limiting where appropriate
```

Critical rule:

```text
Never trust business_id/customer_id
coming from the frontend alone.
```

Use authenticated context:

```text
req.user.businessId
```

and validate ownership server-side.

---

# 33. FINANCIAL SAFETY QA

Before deployment, verify:

```text
Bill total
Discount
Custom rate
Previous balance
Payment
Allocation
Ledger
Outstanding
Cancellation
Reversal
```

The fundamental flow:

```text
SALE
  ↓
LEDGER DEBIT
  ↓
PAYMENT
  ↓
LEDGER CREDIT
  ↓
OUTSTANDING
```

Everything must reconcile.

---

# 34. PERFORMANCE QA

Expected workload is relatively small, but verify:

```text
Customer search
Item search
Bill creation
Payment creation
Ledger queries
Dashboard
Reports
Exports
```

Use pagination where lists can grow.

Avoid unnecessary:

```text
SELECT *
```

and unnecessary repeated database queries.

---

# 35. Production Configuration

Prepare:

```text
Production DATABASE_URL
Production DIRECT_URL
JWT_SECRET
CORS configuration
Environment variables
Logging
Error handling
Build scripts
```

Never commit:

```text
.env
DATABASE_URL
JWT_SECRET
API secrets
```

---

# 36. Deployment

## Backend

Deploy Node.js/Express backend to the selected hosting platform.

## Database

```text
Neon PostgreSQL
```

## Frontend

Deploy React/Vite application to selected frontend hosting.

Architecture:

```text
User
 │
 ▼
React Frontend
 │
 ▼
Backend API
 │
 ▼
Prisma
 │
 ▼
Neon PostgreSQL
```

---

# 37. Final Acceptance Workflow

The final business workflow should be tested end-to-end:

```text
LOGIN
  ↓
CREATE CUSTOMER
  ↓
CREATE/SELECT ITEM
  ↓
CREATE CUSTOMER BILL
  ↓
CUSTOMER HAS OUTSTANDING
  ↓
PARTIAL PAYMENT
  ↓
LEDGER UPDATED
  ↓
DELIVERY
  ↓
REMAINING PAYMENT
  ↓
OUTSTANDING = 0
  ↓
REPORT
  ↓
XLSX EXPORT
  ↓
PRINT BILL
```

Also:

```text
WALK-IN BILL
```

must work independently of customer ledger.

---

# 38. Final Project Status

```text
╔════════════════════════════════════════════╗
║       LAKSHMI GANAPATHI ENTERPRISES       ║
║            DEVELOPMENT STATUS             ║
╚════════════════════════════════════════════╝

DATABASE
  ✅ Schema
  ✅ Constraints
  ✅ Views
  ✅ Sequences
  ✅ Triggers
  ✅ Database acceptance testing

BACKEND FOUNDATION
  ✅ Node.js
  ✅ Express
  ✅ TypeScript
  ✅ Prisma
  ✅ Neon connection

AUTHENTICATION
  ✅ 5/5

CUSTOMERS
  ✅ 7/7

CATEGORIES
  ✅ 8/8

ITEMS + UNITS
  ✅ 13/13

BILLING
  ✅ 43/43

────────────────────────────────────────────

PAYMENTS + LEDGER
  ✅ 32/32 + 19/19

CANCELLATION + AUDIT
  ✅ 43/43 (billing) + 33/33 (payments)

DELIVERY
  ✅ 21/21

REPORTS + EXPORT
  ✅ 16/16

BACKEND FINAL QA
  ✅ 165/165 — BACKEND FROZEN

────────────────────────────────────────────

FRONTEND FOUNDATION
  ✅ COMPLETE (routing, layout, auth, API client, i18n, base UI kit)

DASHBOARD
  ✅ COMPLETE

CUSTOMERS UI
  ✅ COMPLETE (list/search/create/edit/profile/history/outstanding)

CATEGORIES UI
  ✅ COMPLETE

ITEMS UI
  ✅ COMPLETE (CRUD + units)

BILLING UI
  ✅ COMPLETE (create, list, detail, cancel, basic print)

PAYMENTS + LEDGER UI
  ✅ COMPLETE (create/allocate/reverse, standalone ledger page)

DELIVERY UI
  🔵 NEXT

REPORTS UI
  ⏳

PRINTING
  ⏳ (basic working print exists on bill detail; dedicated
  A4/thermal layout still pending)

────────────────────────────────────────────

INTEGRATION QA
  ⏳

SECURITY QA
  ⏳

PERFORMANCE QA
  ⏳

PRODUCTION BUILD
  ⏳

DEPLOYMENT
  ⏳

FINAL ACCEPTANCE
  ⏳
```

---

# 39. Optimized Master Roadmap

The entire project is now effectively **9 development phases**:

```text
┌─────────────────────────────────────────┐
│ 1. PAYMENTS + ALLOCATIONS + LEDGER     │
│ ✅ COMPLETE                             │
└───────────────────┬─────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 2. CANCELLATION + AUDIT                │
│ ✅ COMPLETE                             │
└───────────────────┬─────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 3. DELIVERY + TRACKING                 │
│ ✅ COMPLETE                             │
└───────────────────┬─────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 4. REPORTS + DASHBOARD API + XLSX      │
│ ✅ COMPLETE                             │
└───────────────────┬─────────────────────┘
                    ↓
             FULL BACKEND QA
             ✅ COMPLETE — 165/165, BACKEND FROZEN
                    ↓
┌─────────────────────────────────────────┐
│ 5. FRONTEND FOUNDATION + CORE UI       │
│ ✅ COMPLETE                             │
└───────────────────┬─────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 6. FINANCIAL + DELIVERY + REPORT UI    │
│ 🔵 IN PROGRESS — Billing/Payments/      │
│ Ledger done, Delivery + Reports next    │
└───────────────────┬─────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 7. PRINTING + RESPONSIVE + UX          │
└───────────────────┬─────────────────────┘
                    ↓
             FULL INTEGRATION QA
                    ↓
┌─────────────────────────────────────────┐
│ 8. SECURITY + PERFORMANCE + QA         │
└───────────────────┬─────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 9. PRODUCTION + DEPLOYMENT             │
└─────────────────────────────────────────┘
```

## Frontend Stabilization / UX Correction Phase — COMPLETE

Ran before Phase 7b per explicit instruction: fix and verify known
issues in the completed frontend before continuing to new modules.

**Fixed:**
- **Security — business isolation (critical):** `item.routes.ts` and
  `category.routes.ts` registered `router.use(authMiddleware)` *after*
  their route handlers, so Express never actually ran auth on those
  two modules — every Items/Categories endpoint was reachable with no
  token at all. Combined with the already-known `BUSINESS_ID =
  BigInt(1)` hardcoding in both controllers, this meant no real
  per-business isolation existed for Items/Categories. Fixed both:
  middleware moved before the routes, controllers switched to
  `req.user!.businessId` via `AuthenticatedRequest`, matching every
  other module's pattern.
- **Performance — perceived "full page reload" on navigation:** the
  app's only `<Suspense>` boundary wrapped the entire `<Routes>` tree
  (including `AppLayout`), so navigating to any lazy-loaded page
  unmounted the sidebar/header along with it. Moved `<Suspense>` to
  wrap only `<Outlet/>` inside `AppLayout`; the shell now stays
  mounted across navigation.
- **Performance — mutations felt slow:** several `onSuccess` handlers
  `await`ed `invalidateQueries` (some sequentially, one three calls
  deep) before closing the dialog/toasting — the UI waited on a full
  background refetch before responding. Invalidations are now
  fire-and-forget; the UI responds the instant the mutation itself
  resolves. Added `placeholderData: keepPreviousData` to the
  search/filtered list queries (Customers, Items, Categories, Bills,
  Payments) so typing in a search box no longer flashes an empty/
  loading table between keystrokes.
- **Dialog Cancel/X bug:** replaced `window.confirm()` (which fights a
  Radix Dialog's own focus trap) with a proper in-app "Discard
  changes?" `ConfirmDialog` across all four form dialogs (Customer,
  Category, Item, Payment) via a shared `useDiscardConfirm` hook.
  While fixing this, found and fixed a second, more serious bug it
  exposed: the `ConfirmDialog` was nested as a *child* of the outer
  form `Dialog`; discarding closed both at once, which raced their
  independent `AnimatePresence` exit animations and left a stuck,
  invisible, full-screen `pointer-events: auto` overlay blocking all
  further clicks on the page until a hard reload. Fixed by rendering
  `ConfirmDialog` as a sibling of `Dialog`, not a child, in all four
  forms. Verified live: edit → type → Cancel → Discard → page fully
  interactive, reopening the form shows the real unedited values.
- **Business-data display mode:** added a new, admin-only, business-
  wide setting (English / Telugu / Both) — explicitly separate from
  the existing app-language toggle. Backend: `businesses
  .name_display_mode` enum column (additive `db push`, no data loss)
  + `GET/PATCH /api/business/settings` (PATCH is `requireRole
  ("ADMIN")`), also threaded into the login and `/auth/me` responses.
  Frontend: `AuthContext.setNameDisplayMode`, a Settings-page control,
  and `useLocalizedName` rewritten to read this setting instead of the
  UI language — now used everywhere names are shown, including the
  printed bill (customer name falls back to the bill's live customer
  relation for the Telugu half, since only the English name is
  snapshotted on the bill).
- **Bill printing redesigned:** new `PrintableBill` component — a
  compact, small-receipt layout (`@page { size: 80mm auto }`), business
  name, bill number, the bill's *stored* `transaction_at` (never
  `new Date()`), customer name/phone (display-mode aware), itemized
  qty/unit/rate/amount, subtotal/discount/grand total, previous/paid/
  current/overall balance. Old `.print-area` (scaled the full on-screen
  card) replaced by a `.print-only` element that is the *only* thing
  visible under `@media print` — no dashboard chrome ever reaches
  paper. Added a "Save as PDF" button alongside "Print" (both use the
  browser's own print dialog — no server-side PDF, nothing stored).
- **Customer list columns:** Name (English — Telugu, display-mode
  aware) · Phone · Outstanding Balance · Last Transaction · Status ·
  Edit · Deactivate. Balance/last-transaction come from one bulk call
  to the existing outstanding-report endpoint (extended with a
  `last_transaction_at` correlated subquery, no schema change) merged
  into the list client-side — avoids an N+1 fetch per row.
- **Items list columns:** Name (English — Telugu) · Category · Units
  (badges) · Units/Edit/Deactivate actions, inactive items marked with
  a small badge instead of a separate Status column.
- **Categories list:** already matched the required shape (Name ·
  Status · Edit/Deactivate) once `useLocalizedName` picked up the new
  display-mode setting — no structural change needed.
- **Customer transaction history → real bill:** new `CustomerBillsPanel`
  (Date/Time · Bill ID · Description · Total Bill · Paid · Previous
  Balance · Total Balance, one row per bill) added above the existing
  ledger panel on the Customer Profile page; each row navigates to
  that bill's own `BillDetailPage`, which was already rendering purely
  from the bill's stored snapshots (`item_name_snapshot`,
  `standard_rate`/`actual_rate`, etc.), never today's item prices —
  verified live end-to-end.

**Not changed / explicitly out of scope this phase:** delete/deactivate
semantics (already non-destructive from earlier phases), the ledger
panel itself (kept as-is, still used by the standalone `/ledger` page).

**Tests:** TypeScript (backend) PASS · TypeScript (client) PASS ·
Prisma valid · Focused (auth 5/5, items 13/13, categories 8/8) PASS ·
Full regression 165/165 PASS (see below).

## Billing + UX Corrections Round 2 — COMPLETE

A second stabilization pass, run against the reference bill image and
a further punch list, before continuing to Delivery + Reports UI.

**Fixed:**
- **Billing item-add was slow and the picker locked up:** `handleAddItem`
  awaited a redundant `listItemUnits` API call before adding a line —
  `listItems()` (what the picker already fetches from) embeds
  `item_units` on every item, so that second round trip was pure
  waste and the real cause of the ~2s delay. Now reads units straight
  off the already-fetched item; adding a line is a synchronous local
  state update. Also found and fixed why the picker "locked up" after
  one selection: its results dropdown was gated on a `focus` event
  only, so typing again without leaving the (already-focused) input
  never reopened it. Verified live: 3 items added back-to-back with no
  extra clicks and no visible delay.
- **Item creation is not blocked by units:** already true on the
  backend (item creation and unit creation are separate endpoints);
  added an explicit "Done" button and an "optional" hint to the units
  dialog so it doesn't feel mandatory.
- **Bill print redesigned to match the supplied reference image:**
  two copies side by side (Original/Customer), green-bordered compact
  layout. Column headings (S.No/Item/Quantity/Rate/Amount) are always
  English regardless of display mode, per instruction; item/customer
  values follow the configured display mode. Uses the bill's stored
  `transaction_at`, never the current time. Initially built the page
  as `210mm x 148mm` (A5 landscape) — corrected to `148mm x 210mm`
  (A5 portrait: still ~half an A4 sheet, but upright as requested,
  with the two copies now narrower columns side by side, separated by
  a dashed cut line). Header now also carries the business's mobile
  number and address (both newly exposed via `/auth/login` and
  `/auth/me`, additive fields on the existing `businesses` row) plus a
  Scan & Pay section using the business's UPI phone.
- **Delivery agent assignment:** optional agent picker added to Bill
  creation (customer bills only) using the existing delivery-agent API
  that was already built but unused by any screen; on save, creates a
  `bill_deliveries` row (agent or "Not Assigned"). Bill Detail page
  shows the current agent with an Assign/Change action. Verified live
  end-to-end (assign at creation, change after, one delivery record
  per bill — no duplicates).
- **Customer opening balance:** new `POST /ledger/customer/:id/
  opening-balance` (ADMIN only), records one ADJUSTMENT ledger entry —
  refuses if the customer already has any ledger history, so it can't
  be used to silently adjust an established balance. Wired to a
  "Set Opening Balance" action on the customer profile. Verified via a
  disposable test customer (create → set → balance correct → second
  call correctly rejected → cleaned up).
- **Payment-only / partial / full-balance payments:** already fully
  supported by the existing payment architecture (`allocations` is
  optional, defaults to `[]`) — added a "Make Payment" action directly
  on the customer profile (pre-fills the customer, reuses
  `PaymentFormDialog`) so it doesn't require going through the
  Payments list first.
- **Payment receipt print/PDF:** new compact printable receipt
  (business name, payment number, date/time, customer, method,
  previous balance, amount, balance after) using the payment's own
  ledger entry for the balance figures — never recomputed. Print/Save
  as PDF buttons added to the payment detail dialog.
- **Sale + payment-at-sale representation:** the Bills panel (Round 1)
  already showed this correctly as one row. The raw ledger's
  Transaction History table still showed a separate SALE and PAYMENT
  row for the same sale, so it now merges them into one row (single
  debit/credit/balance) when both entries share the exact same
  `transaction_at` — the reliable signal billing.service writes both
  rows from the same Date value in the same DB transaction when
  payment happens at sale time. A later, separate payment has a
  different timestamp and correctly stays its own row. Only applied to
  the unfiltered "All types" view — filtering to one entry type shows
  the raw rows. Verified live against the exact case reported: Debit
  ₹1,350 / Credit ₹1,000 / Balance ₹350 in a single row.
- **Transliteration — multiple suggestions:** added a small curated
  dictionary of common Indian names (definitive spellings beat a
  guess) plus a second phonetic reading using the genuinely ambiguous
  consonants (శ vs ష, చ vs ఛ, dental vs retroflex t/d) as an
  alternate. Up to 3 suggestion chips now shown, each independently
  clickable, all still freely editable — never auto-applied. Verified
  live: "Ramesh" → రమేష్ (dictionary) + రమేశ్ (alternate).
- **Terminology:** "Deactivate" → "Remove", "Outstanding" → "Balance",
  "Total Payments" → "Total Paid", across both languages — UI text
  only, no field renamed in the database.
- **Dashboard date range:** Today/Week/Month/Year/Custom selector
  added; backend `getDashboard` now takes the same `range` query the
  other reports already used (extended with "year"), source of truth
  stays server-side. The Reports section itself is still
  `ComingSoonPage` (unbuilt) — its own filters are Phase 7b's work,
  not duplicated here.
- **Semantic colors:** Edit (amber + pencil), Remove (red + trash,
  swaps to green "Activate" when inactive), balance-owed amounts
  (red), dashboard/ledger stat cards (Sales green + up-arrow, Paid
  blue + check, Balance red), Back buttons (visible background +
  arrow) — applied to Customers/Items/Categories lists, Dashboard,
  and the ledger panel; not applied to every button in the app.
- **Business isolation re-verified:** grepped the whole backend for
  `BUSINESS_ID`/hardcoded `BigInt(1)` outside of the admin-seed script
  and test fixtures — none remain in request-handling code.

**Not done / deferred:** a full Reports UI with its own date filters
(page doesn't exist yet — still the next planned phase); it was not
started now to avoid quietly absorbing that phase into this
"stabilization" pass.

**Tests:** TypeScript (backend) PASS · TypeScript (client) PASS ·
Prisma valid · Focused (auth 5/5, ledger 19/19, reports 16/16) PASS ·
Full regression 165/165 PASS (see below).

## Billing + UX Corrections Round 3 — COMPLETE

Two client-reported issues against the Round 2 print redesign.

**Fixed:**
- **"Download PDF" was just opening the print dialog:** both buttons
  called `window.print()`, so "Save as PDF" never actually behaved
  differently from "Print" — the client wanted a real, direct PDF
  file. Added `html2pdf.js` (client-side only, wraps html2canvas +
  jsPDF, no server/external API call) and a small `lib/pdf.ts` helper
  that rasterizes the `.print-only` element and triggers an actual
  `.pdf` download. "Print" still uses `window.print()` for physical
  printing. Wired into both the Bill Detail page and the Payment
  Detail dialog.
- **While fixing that, found a real, pre-existing bug:** `PrintableBill`'s
  outer element set `style={{ display: "flex", ... }}` inline, which
  — since inline styles always beat a CSS class — silently overrode
  `.print-only { display: none }` and left the compact two-copy bill
  preview rendering visibly inside the normal on-screen Bill Detail
  page the whole time, not actually hidden outside of print/PDF as
  intended. Removed the inline `display`; visibility is now controlled
  only by the CSS class (plus `lib/pdf.ts` briefly forcing it visible
  off-screen during PDF capture, then restoring it). Verified via a
  before/after screenshot — the duplicate box is gone from the normal
  page.
- **Print layout mostly blank space:** the bordered bill boxes were
  sized to their own content (roughly the top 35–40% of the A5 sheet),
  leaving a large blank lower portion. `BillCopy` now has `minHeight:
  116mm` (~55% of the 210mm page height, within the requested 50–60%
  range) so the box itself fills more of the sheet; page margin
  tightened from 4mm to 2.5mm for closer to full-width use. Customer
  copy's border is now 3px (double the Original copy's 1.5px) to make
  it visually distinct, per instruction.
- **Header now carries mobile + address:** `businesses.address` was
  not previously exposed to the frontend — added to `/auth/login` and
  `/auth/me` (additive, same pattern as the phone/UPI fields from
  Round 2) and to each bill copy's header alongside the business name
  and phone.
- QR block kept as a placeholder (visual "QR" square) per the
  instruction to keep the currently-used PhonePe QR/number as-is —
  no change to that specific element beyond the layout fixes above.

**Tests:** TypeScript (backend + client) PASS. Verified live: PDF
download completes without opening a print dialog and without leaving
the preview visible afterward (both Bill and Payment); screenshot
confirms 50–60% page-height fill, thicker customer-copy border, and
that the normal Bill Detail page no longer shows a stray duplicate box.

## Billing + UX Corrections Round 4 — COMPLETE

Client-reported: "Save as PDF" made the whole site stop responding
(needed a full page reload), and the print layout still wasn't right.

**Fixed:**
- **Site became unresponsive on "Save as PDF" — root cause and fix:**
  the Round 3 fix used `html2pdf.js` (html2canvas + jsPDF), which
  rasterizes the DOM by cloning a large part of the live document into
  a hidden iframe. That collided with React's own DOM management
  often enough to leave the app in a broken state requiring a reload.
  Replaced entirely with pure vector PDF generation (`jspdf` directly,
  no html2canvas, no DOM cloning, no screen rasterization at all) —
  `lib/billPdf.ts` and `lib/paymentPdf.ts` draw the bill/receipt from
  the same data already on the page using jsPDF's own text/line/image
  APIs. Verified by clicking "Save as PDF" and then immediately
  continuing to navigate the app (list → detail → back) with no
  errors and no stale state, in a fresh tab to rule out any leftover
  session artifacts.
  - Known, deliberate limitation: jsPDF's built-in fonts can't render
    Telugu script without embedding a large font file, which wasn't
    feasible to do reliably in this pass. Item names are already
    always English in the bill's own stored snapshot, so this only
    affects the customer name field, which the direct PDF always
    prints in English; "Print" → the browser's own Save-as-PDF still
    renders Telugu correctly for anyone who needs it, since that path
    uses real browser text rendering, not jsPDF.
- **Layout rebuilt to the exact requested measurements:** full A4
  portrait (210mm × 297mm, not the A5 half-page from Round 2/3), 10mm
  left/right margin, 5mm top margin, 20mm gap between the Original and
  Customer copies, content width using the full page width, content
  height capped at 65% (within the requested 60–70%) instead of
  stretching further. Customer copy's border is 3px vs. the Original's
  1.5px, per the "double thick" instruction.
- **Printed name is single-language, admin-controlled:** added
  `usePrintName` (in `hooks/useLocalizedName.ts`) alongside the
  existing `useLocalizedName` — the on-screen BOTH mode still shows
  "English — Telugu" everywhere else in the app, but a printed bill or
  receipt now always resolves to one language (Telugu only when the
  business's display-mode setting is TELUGU, English otherwise),
  never the combined form. Applied to both PrintableBill and
  PrintablePaymentReceipt.
- **Real PhonePe QR, not a placeholder:** saved the actual QR code
  image the client provided to `client/public/phonepe-qr.png` (Vite
  serves it at `/phonepe-qr.png`) and render it directly in the bill's
  print/CSS layout and embed it (as a data URL via `doc.addImage`) in
  the direct-PDF path — no more gray "QR" placeholder box.

**Tests:** TypeScript (backend + client) PASS. Verified live in a
fresh browser tab (to rule out stale state from the dependency swap):
PDF downloads without opening a print dialog, app stays fully
interactive afterward (navigated list → detail → list with no errors),
screenshot confirms 210mm-wide / ~193mm-tall (65%) layout with the
real QR code, single-language customer name, and the thicker
customer-copy border.

## Billing + UX Corrections Round 5 — COMPLETE

Client-reported, against the exact BILL-000135 (10 items) that showed
a large blank gap in the Round 4 PDF.

**Fixed:**
- **Print/PDF box height is now content-driven, clamped 50–60% (not a
  fixed 65%):** `lib/billPdf.ts` computes the totals-section end
  position arithmetically before drawing (`measureContentEnd`), then
  clamps the box to `[50%, 60%]` of the page height and anchors the
  QR/signature footer right after the content (small fixed gap) —
  only pushing the footer down to fill a larger gap when the box is
  floored up to the 50% minimum. `PrintableBill.tsx` (the CSS/Print
  path) gets the equivalent behavior for free by switching from a
  fixed `height` to `minHeight`/`maxHeight`, letting the browser size
  each copy to its own content within that same 50–60% band. Verified
  on BILL-000135 itself: floors to exactly 50% (the natural content is
  shorter than that), with a small residual gap instead of the large
  one in the reported screenshot.
- **Dotted divider between the two copies:** a dashed vertical line
  now sits centered in the 20mm gap — drawn directly in the PDF via
  `doc.line()` with a dash pattern, and as a `border-left: dashed`
  divider element between the two copies in the CSS layout.
- **Billing-page name-language toggle:** `CustomerPicker`'s selected-
  customer chip now has a small toggle button (only shown when the
  customer has a Telugu name to toggle to) that flips the displayed
  name between English and Telugu for *that* pick, independent of the
  business-wide display-mode setting — a per-transaction convenience
  for whichever language is easier for the person billing, not a
  data change. Resets to the business default whenever a different
  customer is selected. Verified live: Kumar ↔ కుమార్ toggles on
  click, in both directions.

**Tests:** TypeScript (backend + client) PASS. Verified live: box
height measured at exactly 50.0% of page height on the reported bill;
dotted divider confirmed in the DOM (dashed border, full box height);
PDF export on the same 10-item bill completes with no console errors
and the app remains fully interactive afterward; name toggle verified
both directions on a real customer.

## Billing + UX Corrections Round 6 — COMPLETE

**Fixed:**
- **Item name toggle on the bill draft:** `BillItemRow` gets the same
  English/Telugu toggle pattern as the Round 5 customer-name toggle —
  a small button next to each line item's name (shown only when that
  item has a Telugu name), flipping the displayed name for that line
  independent of the business-wide display-mode setting. Verified
  live: Ragi ↔ రాగులు toggles on click.
- **Proprietor name in the bill header:** new `businesses
  .proprietor_name` column (additive `db push`, same pattern as the
  phone/address/UPI fields added earlier), exposed via `/auth/login`
  and `/auth/me`, editable from an ADMIN-only field on the Settings
  page (`PATCH /api/business/settings`, extended to accept
  `proprietor_name` alongside the existing `name_display_mode`).
  Rendered next to the business phone number in both the CSS print
  header and the direct-PDF header (`billPdf.ts`) — plain text, no
  English/Telugu pairing needed since the field itself is a single
  free-text value ("English preferred" per instruction, not enforced,
  just the recommended convention). Verified live: "Sambayya (Kumar) ·
  +91 9032081427" appears in both copies' headers after saving it once
  from Settings.

**Tests:** TypeScript (backend + client) PASS, Prisma valid, focused
auth tests 5/5 PASS. Verified live end-to-end via the app's own
Settings page (not just a direct API call) so the session's stored
business object picks up the change correctly.

## Billing + UX Corrections Round 7 — COMPLETE

**Fixed:**
- **Remaining PDF/print white space, QR dragged up:** the Round 5 fix
  (box height clamped 50–60% of page height) still left a visible gap
  between the totals and the QR/signature block on short bills,
  because the footer was bottom-anchored to that floored box height
  (`Math.max(cy + 6, y0 + boxHeight - FOOTER_ZONE)` in `billPdf.ts`;
  the CSS twin was a `minHeight` + `<div style={{flex:1}}>` spacer in
  `PrintableBill.tsx` that expanded to fill the same forced floor).
  Removed the height floor entirely in both places — the footer now
  always sits a small fixed gap (`cy + 4`) after wherever the content
  actually ends, and the box (border + banner) is purely content-
  driven, capped only at 60% of the page as a ceiling for bills with
  many items. Verified live via the print layout (forced visible in
  DOM) against BILL-000149 (1 item): QR/signature sit immediately
  after the totals with no gap.
- **Overpayment reduces previous balance ("Partial Balance Paid"):** a
  customer bill can now accept `amount_paid > grand_total` — the
  excess is no longer rejected, it reduces the customer's *previous*
  balance. Backend (`billing.service.ts`): removed the unconditional
  overpayment rejection (kept only for walk-ins, which have no ledger
  to apply an excess to); `current_bill_balance` stays floored at 0;
  `overall_balance` is computed from the raw, unclamped
  `previous_balance + grand_total - amount_paid` so the excess still
  lands on the correct final figure; `payment_allocations
  .allocated_amount` is capped at `min(amount_paid, grand_total)` so a
  bill never looks over-allocated to anything that computes its own
  outstanding as `grand_total - allocations`. Frontend: `BillNewPage`
  drops its old `min(amountPaid, grandTotal)` clamp for customer bills
  and shows a new "Partial Balance Paid" row (green) only when
  `amount_paid > grand_total`; the same row was added to
  `BillDetailPage`, `PrintableBill`, and `billPdf.ts` so it also shows
  on the saved/printed/PDF'd bill, not just the live draft. Verified
  live end-to-end against a real customer (hithesh, ₹1,000 balance):
  billed ₹40, paid ₹100 → "Partial Balance Paid ₹60.00" shown
  everywhere, balance correctly dropped to ₹940; payment reversed and
  balance corrected back to ₹1,000 afterward (test cleanup).
- **Bill-creation speed:** two concrete fixes, not a vague "optimize
  everything" pass.
  - Frontend: `BillNewPage`'s `onSuccess` handler `await`ed the
    delivery-agent assignment call before navigating to the new bill —
    a second sequential network round trip blocking on every customer
    bill. Made it fire-and-forget (`assignDelivery(...).catch(() => {})`,
    not awaited), matching the non-blocking-invalidation pattern
    already used elsewhere in the app.
  - Backend: `createBill` resolved each line's item+unit with its own
    `findFirst` inside the transaction — a bill with N items meant N
    sequential DB round trips. Replaced with a single batched
    `findMany` (`resolveItemUnits`), keeping the exact same per-line
    validation/error behavior (first invalid item still throws first).

**Tests:** TypeScript (backend + client) PASS. `npm run test:billing`
43/43 PASS both before and after the batched item-resolution change
(including "Reject invalid item", confirming the batched error path
still surfaces correctly). Verified live in the browser: overpayment
calculation/display on draft, save, and detail page; print layout gap
closed; app stays fully responsive after PDF download (no crash);
bill-creation navigation no longer waits on delivery assignment.

## Frontend Phase 4 — Delivery + Reports UI — COMPLETE

The last two "Coming Soon" placeholders in the router are now real
screens, closing out the frontend module list. Both consumed API
endpoints, types, and query-key factories that already existed from
Foundation (6a) — only the page UI itself was missing.

**Delivery (`client/src/features/delivery/`):**
- `DeliveryPage.tsx` — a Deliveries/Agents tab switcher (same toggle
  pattern as Billing's Customer/Walk-in switch). The Deliveries tab
  filters by search/status/agent, lists every delivery with the bill,
  customer, agent, status badge, and date, and renders the correct
  next-action button(s) per row from the backend's own transition
  graph (`GENERATED→SENT→REACHED→{BALANCE,CLEARED}→CLEARED`) — never
  a hardcoded linear chain, so REACHED can go straight to CLEARED or
  via BALANCE, matching `ALLOWED_TRANSITIONS` in
  `delivery.service.ts`. Each transition goes through the shared
  `ConfirmDialog`. A `ReassignDialog` handles agent reassignment
  (hidden once a delivery is CLEARED, per the backend rule).
- `DeliveryAgentsPanel.tsx` + `DeliveryAgentFormDialog.tsx` — this was
  a genuine gap, not just a missing view: **nothing in the app could
  create a delivery agent before this.** `BillDeliveryPanel` and
  `BillNewPage`'s agent picker already existed and worked, but their
  dropdown had no way to ever be populated outside a direct API call.
  Standard create/edit/activate/deactivate list, mirroring
  `CategoriesPage`'s established CRUD-with-dialog pattern exactly.

**Reports (`client/src/features/reports/`):** a `ReportsPage.tsx` tab
switcher over four panels (`SalesReportPanel`, `PaymentsReportPanel`,
`OutstandingReportPanel`, `ItemsReportPanel`), each with its own
range picker (Today/Week/Month/Year/Custom, reusing Dashboard's
pattern via a shared `ReportRangePicker`), summary stat tiles, a
results table, and an "Export Excel" button hitting the existing
`/reports/*/export` endpoints through the already-built
`downloadFile()` helper — no new backend or download logic needed.

**Verified live** (real Neon data, no mock data): created a delivery
agent from a previously-empty agents list; advanced a real delivery
GENERATED→SENT and watched the badge and available action update;
all four report tabs rendered correct real figures (outstanding
report matched the exact `hithesh` balance from the billing session
above); XLSX export confirmed via a real `200 OK` network response.
Also checked at mobile width (375px): the existing hamburger/drawer
nav (already built, not touched) handles both new pages correctly.

## Deployment readiness pass

Prompted by the request to get the app ready to deploy. Scope was
kept to things that are true regardless of hosting choice — no
platform-specific config (Dockerfile, render.yaml, etc.) was added,
since no hosting platform has been chosen yet and more billing/UI
changes are still expected before an actual deploy.

**Fixed (backend, `package.json` + `env.ts`):**
- `tsx`, `typescript`, and `prisma` were in `devDependencies`, but
  `npm start` runs `tsx src/server.ts` directly (this project has no
  compile-to-JS build step — `tsconfig.json` has `noEmit: true` by
  design). Most hosts run `npm install --omit=dev` in production,
  which would have deleted `tsx` itself before the start command ever
  ran. Moved all three to `dependencies`.
- Added `"postinstall": "prisma generate"`. The generated Prisma
  client lives at a custom `../generated/prisma` output path, which
  is (correctly) gitignored — so a fresh deploy had nothing to
  generate it after `npm install` and would fail on the first import.
- Added `JWT_SECRET` to `env.ts`'s `requiredEnv` list, alongside
  `DATABASE_URL`/`DIRECT_URL`. It was already required in practice
  (`auth.service.ts`/`auth.middleware.ts` throw without it), just not
  until the first login request — now a misconfigured deploy fails
  loudly at boot instead of quietly on first use.

**Already correct, verified not changed:** `CORS_ORIGIN` already
parses as a comma-separated list (supports multiple origins);
frontend already reads `VITE_API_URL` with no hardcoded localhost
fallback used in production; both `.env` files are gitignored with
accurate `.env.example` counterparts committed.

**Flagged, not fixed (needs the user's input, not a default I should
guess):** the entire `client/` directory is untracked in git (`git
status` shows `?? client/`) — none of the frontend has ever been
committed. Nothing can be deployed from source control until this is
addressed. Also unresolved: no hosting platform chosen yet, so no
Dockerfile/Procfile/platform config was written; a pre-existing
duplicate-React-key console warning (reproduces on `/dashboard`,
predates this session) was spawned off as a separate background
task rather than investigated here, since it didn't block anything
in testing and isn't related to the deployment-readiness changes.
Also flagged: `npm audit` on the backend shows 6 pre-existing
transitive-dependency vulnerabilities (in `mysql2` and `uuid`, pulled
in by Prisma's multi-driver support and `exceljs` respectively, not
by anything this project imports directly). Not auto-fixed — the
suggested fixes are breaking downgrades (`prisma@6.19.3`,
`exceljs@3.4.0`) that would conflict with this project's Prisma 7
driver-adapter setup and need a deliberate look, not a blind
`--force`.

**Tests:** TypeScript (backend + client) PASS. Full backend
regression (`npm run test:all`) re-run after the `env.ts` change
since it's shared config touching every request — **165/165 PASS**,
including the new Delivery (21/21) and Reports (16/16) suites.
`package-lock.json` regenerated (`npm install --package-lock-only`)
so its dependency metadata matches the `dependencies`/
`devDependencies` reclassification above.

## Billing + UX Corrections Round 8 — COMPLETE

Four asks: a payment-terms notice on the bill, an admin-selectable
Telugu/English language for item names (not just customer names) in
both print and the downloaded PDF, a QR/border collision in the PDF,
and continued speed work.

**Fixed:**
- **Payment-terms note:** "This bill should be paid within 1 month.
  After that, interest will be charged at 2%." added near the bottom
  of both `PrintableBill.tsx` (CSS print) and `billPdf.ts` (PDF),
  right after the balance rows. `billPdf.ts`'s `measureContentEnd`
  mirror was updated with the same increment so the content-driven
  box height stays accurate with the extra line.
- **Item name language now follows the admin's print-language
  setting, in both Print and PDF:** previously only the customer name
  did this (via `usePrintName`, driven by the existing business
  `name_display_mode` setting from an earlier round); item names in
  print/PDF were always English regardless of the setting. Backend:
  `billInclude` in `billing.service.ts` now joins each `bill_items`
  row to its live `items.telugu_name` (the English
  `item_name_snapshot` stays the historical-accuracy snapshot,
  unchanged — this mirrors exactly how `bill.customers` is already
  joined in for the customer's live Telugu name). Frontend:
  `PrintableBill.tsx`'s `ItemRow` now resolves its name through
  `usePrintName` the same way the customer name does.
- **Telugu in the downloaded PDF (not just Print):** jsPDF's built-in
  fonts are Latin-only, so a Telugu font was embedded to make this
  possible. Converted Google's Noto Sans Telugu (OFL-licensed,
  `@fontsource/noto-sans-telugu` npm package ships woff2 only) to TTF
  via `wawoff2` — a one-time conversion, the resulting
  `NotoSansTelugu-{Regular,Bold}.ttf` files live in `client/public/
  fonts/` and are fetched + registered into jsPDF's VFS
  (`addFileToVFS`/`addFont`) only when `name_display_mode === "TELUGU"`
  and a name actually has Telugu text — not on every PDF. Only the
  resolved name VALUES switch to the Telugu font; all labels, money,
  and the bill number stay on Helvetica. **Caveat surfaced to the user
  up front before building this** (they chose to proceed anyway):
  jsPDF lays out glyphs by simple left-to-right advance widths with no
  OpenType shaping, so complex Telugu conjuncts won't look quite as
  clean here as they do via Print (real browser text engine). Verified
  live: downloaded and read back the actual generated PDF
  (`హిథేష్` / `సజ్జలు` render correctly for this bill's simple
  syllables) both with the setting on TELUGU and reverted to the
  business's actual "both" setting (prints English, unchanged
  behavior, confirming the new code path doesn't fire when not
  selected).
  - **Bug caught by that live PDF read, fixed before calling this
    done:** the customer name was rendering completely blank in the
    PDF. Cause: the code drew `": " + name` as one `doc.text()` call
    while the active font was the Telugu font — but the extracted
    Telugu font subset has no Latin glyphs at all (not even a colon),
    and jsPDF drew nothing for the whole string rather than just the
    missing glyph. Fixed by drawing the ":" separately in Helvetica
    and the name value in its own call with whichever font it needs.
- **QR colliding with the PDF's bottom border:** the green banner (and
  the border, which hugs it) started only 16mm below the footer, but
  the QR image + its two caption lines need ~23mm — so the banner and
  border edge were cutting into the bottom of the QR/caption block.
  Increased `FOOTER_ZONE` from 22 to 31mm, giving the QR block full
  clearance before the banner starts. The user confirmed Print was
  already correct, so `PrintableBill.tsx`'s footer layout (CSS
  flexbox, a different mechanism) was deliberately left untouched.
- **Speed:** no new bottleneck was reported this round beyond "keep
  optimizing" — checked the QueryClient config (already tuned:
  `staleTime: 30_000`, `refetchOnWindowFocus: false`) and found
  nothing further to change without a concrete complaint to chase.

**Also found and fixed while verifying in the browser (unrelated to
the four asks, but blocking clean verification):**
- A recurring "duplicate key" and "useLanguage must be used within a
  LanguageProvider" console error on every page turned out to be a
  Vite **dev-mode-only** artifact — confirmed by running an actual
  production build (`npm run build` + `vite preview`) on a fresh
  browser tab: zero console errors on the same pages. No source change
  needed; a background task that had been spawned earlier to
  investigate this was withdrawn as resolved.

**Tests:** TypeScript (backend + client) PASS. `npm run test:billing`
43/43 PASS with the new `bill_items → items` include (the one backend
change this round). Verified live end-to-end in both dev and an
actual production build: item Telugu toggle in Print, payment-terms
note in Print and PDF, QR no longer overlapping the PDF border, and
the customer-name PDF fix — all read back from the real downloaded
PDF file, not just a screenshot.

## Billing + UX Corrections Round 9 — COMPLETE

Two asks: rename "Organization" to "Place" everywhere including the
database, and put Telugu names for items/customers on the **on-screen**
bill view too (Round 8 only reached Print and PDF).

**Fixed:**
- **"Organization" → "Place", database included:** the two live
  columns (`customers.organization`, `bills.organization_snapshot`)
  were renamed with a plain SQL `ALTER TABLE ... RENAME COLUMN` — a
  metadata-only operation in Postgres, so every existing value
  (confirmed before and after on real rows, e.g. hithesh's "college")
  was preserved exactly, unlike dropping and recreating the column via
  a schema-only edit. `schema.prisma` field names updated to match
  and the client regenerated. Every consumer renamed to match on both
  sides: backend (`customer.validation.ts`, `customer.service.ts`,
  `billing.service.ts`, the billing test fixture) and frontend
  (`types/index.ts`, `api/endpoints/customers.ts`,
  `CustomerFormDialog.tsx`, `CustomerProfilePage.tsx`,
  `CustomersPage.tsx`, `PrintableBill.tsx`, `billPdf.ts`, both i18n
  files — `customers.organization` → `customers.place`, "Organization"
  → "Place" / "సంస్థ" → "స్థలం"). A full-codebase grep for
  "organization" (case-insensitive) came back empty on both sides
  after the change.
- **Telugu on the on-screen bill (not just Print/PDF):**
  `BillDetailPage.tsx` was still hardcoded to
  `bill.customer_name_snapshot` / `line.item_name_snapshot` — always
  English, ignoring the business's display-mode setting entirely
  (Print/PDF already respected it as of Round 8). Wired in
  `useLocalizedName` (the on-screen variant that allows the combined
  "English — Telugu" BOTH-mode display, vs. `usePrintName`'s
  single-language-only resolution for print) for the header customer
  name and, via a small `ItemNameCell` component (hooks can't be
  called inside `.map()`), for each item row.

**Also cleaned up while verifying:** found a stray unpaid ₹40 test
bill (BILL-000189) on hithesh's real account, left over from a
misfired click during Round 8's PDF-blob-capture debugging. Cancelled
it (no payment was allocated, so no reversal needed first) and
confirmed the balance was back to the correct ₹1,000.00.

**Tests:** TypeScript (backend + client) PASS. `npm run test:customers`
7/7 and `npm run test:billing` 43/43 PASS with the renamed field.
Verified live: the customer form's field is now labelled "Place" and
still shows "college" for hithesh; the bill detail page shows
"hithesh — హిథేష్" / "Bajra — సజ్జలు" in BOTH mode; the print layout
shows a "Place : college" row in the right spot.

## Billing + UX Corrections Round 10 — COMPLETE

Follow-up to Round 9: the user reported still seeing English on the
physical printed bill/PDF. Root cause — Print/PDF were driven by the
same `name_display_mode` setting as the on-screen display, which was
set to "Both" (the account's actual setting), and `usePrintName`
deliberately collapses anything other than "Telugu only" to English
for print. Rather than just telling the user to flip the existing
setting (which would also change what staff see on screen), asked
and confirmed they wanted a **separate, independent** admin setting
for print language — so staff can keep seeing English/Both on screen
while the printed copy always goes out in Telugu for customers.

**Added:**
- New `print_language` enum (`ENGLISH | TELUGU` — no `BOTH`, since a
  physical page can only show one language, same rationale as
  `usePrintName`'s existing single-language resolution) and
  `businesses.print_language` column, pushed additively via
  `prisma db push` (a genuinely new field, unlike Round 9's rename —
  no data preservation concern here).
- Backend: `business.validation.ts` / `business.service.ts` accept
  and persist it (same admin-only PATCH `/business/settings` route
  `name_display_mode` already used); exposed on login/me via
  `auth.service.ts` / `auth.controller.ts`.
- Frontend: `PrintLanguage` type, `AuthContext.setPrintLanguage`,
  and a new "Printed Bill Language" card on the Settings page (admin
  -only, English/Telugu select, no Both option) — sits right below
  the existing on-screen "Customer / Item Name Display" card, framed
  explicitly as independent of it.
- `usePrintName` (the hook both `PrintableBill.tsx` and `billPdf.ts`
  already used) now reads `business.print_language` instead of
  `business.name_display_mode` — no call-site changes needed beyond
  renaming `billPdf.ts`'s `nameDisplayMode` option to `printLanguage`
  and its one caller in `BillDetailPage.tsx`.

**Verified live:** set "Customer / Item Name Display" to "English —
Telugu (both)" and "Printed Bill Language" to "Telugu only"
simultaneously — confirmed the bill detail screen still shows
"hithesh — హిథేష్" (both), while the print layout and the actual
downloaded PDF (read back from disk) both show pure Telugu
("Name : హిథేష్", item "సజ్జలు"), proving the two settings now operate
completely independently as requested.

**Tests:** TypeScript (backend + client) PASS. `npm run test:auth`
5/5 PASS (covers the login/me response shape `print_language` was
added to). Full `npm run test:all` regression re-run given the schema
change.

## Billing + UX Corrections Round 11 — COMPLETE

Four bill-layout design changes, frontend-only (`PrintableBill.tsx`
for CSS print, `billPdf.ts` for the PDF, kept in sync as always).

**Fixed:**
- **QR code removed** from both copies in both print and PDF. Deleted
  the `upiPhone` option end-to-end (`BillPdfOptions`, `PrintableBill`
  props, the `BillDetailPage.tsx` call site) and the now-unused
  `loadImageDataUrl`/QR-drawing code. The PDF's footer geometry
  (`FOOTER_ZONE`) shrank from 31mm to 16mm now that only the signature
  line remains — bills are visibly more compact as a result.
- **Date/time bold + highlighted**: the transaction date/time next to
  the bill number is now bold, larger (9px CSS / 9pt PDF vs the
  surrounding 8px/7pt), and in the business's green accent color, in
  both print and PDF.
- **Item table gridlines**: previously just a top/bottom rule (print)
  or two horizontal lines (PDF) with no column or row separators.
  Print: added a real bordered `<table>` (border on every `<th>`/
  `<td>`, light green header background). PDF: rebuilt the table with
  explicit column-boundary coordinates (not just text-anchor
  positions) so actual vertical column lines and horizontal row lines
  could be drawn — outer border in the business green, internal grid
  in a lighter gray.
  - **Bug caught and fixed during multi-item testing**: a long item
    name (a test fixture with an ID-number suffix) wrapped to a
    second line inside jsPDF's `maxWidth` text box, and because PDF
    grid rows now have a *fixed* height for the lines to stay aligned,
    the wrapped second line spilled past its row's border into the
    row below. Fixed with a new `truncateToWidth()` helper — measures
    against the active font via `doc.getTextWidth()` and truncates
    with an ellipsis instead of wrapping, so every row stays exactly
    one line tall. Re-verified against the same 10-item bill that
    exposed it.
- **Signature labels swapped**: Original Copy (kept by the shop) now
  reads "Receiver's Signature" — it's the copy the customer signs to
  confirm receipt. Customer Copy (taken home) now reads a plain
  "Signature" space instead of also saying "Receiver's Signature".
  Removed the now-fully-unused `billing.authorisedSignature` and
  `billing.scanAndPay` i18n keys; added `billing.signatureSpace`.

**Tests:** TypeScript (backend, unaffected — no backend files touched
this round) and client both PASS. Production build succeeds. Verified
live against both a single-item bill and the 10-item bill that
exposed the truncation bug, reading back the actual downloaded PDF
(not just a screenshot) each time.

## Billing + UX Corrections Round 12 — COMPLETE

Two asks: better transliteration accuracy, and make the bottom-of-bill
note admin-editable like proprietor name.

**Fixed:**
- **Transliteration quality** (`client/src/lib/transliterate.ts`):
  found concrete, live evidence of bad output first — real inventory
  data showing "carrot" → "కర్రోత్" (not how it's actually spelled;
  real word is క్యారెట్) and "korralu" → "కోర్రలు" (wrong vowel
  length; should be కొర్రలు). Two structural fixes plus a much larger
  dictionary:
  - **Anusvara rule**: word-medial bare "n"/"m" immediately followed
    by a *different* consonant now renders as ం instead of an
    explicit nasal+virama+consonant conjunct — matches real Telugu
    spelling convention (Sanjay → సంజయ్, not సన్జయ్; Ranjith → రంజిత్).
    Verified this doesn't break gemination (amma → అమ్మ still correct,
    since "different consonant" excludes doubled letters).
  - **Per-word dictionary lookup**: previously the curated dictionary
    only matched if the *entire* trimmed input (spaces stripped) was
    a known entry — so "Ramesh Kumar" missed the dictionary entirely
    even though both "Ramesh" and "Kumar" individually were in it.
    Now each word is checked against the dictionary independently
    before falling back to the phonetic engine, so multi-word names
    get every dictionary-known part right.
  - **~330 dictionary entries** (up from ~90): many more male/female
    Telugu names, common surnames, and — matching what this specific
    business actually sells — grains/millets/pulses, vegetables, and
    common item words, verified against the real inventory (Bajra,
    Ragi, Jowar, Urad, Korra already existed; added carrot, onion,
    garlic, tomato, and ~40 more).
  - Refactored `transliterateWord`/`transliterateWordAlt` (previously
    two near-identical functions) into one function parameterized by
    which consonant table to use, since the anusvara logic needed to
    apply identically to both.
  - Verified live: typed "Carrot" into the item form, suggestion is
    now క్యారెట్ (previously కర్రోత్); a standalone script confirmed
    "Ramesh Kumar" → రమేష్ కుమార్, "Sanjay"/"Anjali"/"Pankaj" (not in
    the dictionary) all get the anusvara correctly, and "amma" still
    correctly gemination-conjuncts.
- **Bill note now admin-editable** (`businesses.bill_note`, additive
  column via `prisma db push`): the "pay within 1 month..." line
  added in Round 8 was hardcoded. New Settings card ("Bill Note",
  same pattern as Proprietor Name — textarea, 300-char limit, blank
  = fall back to the app's own default text) threaded through the
  same backend path as `print_language`
  (`business.validation/service.ts`, exposed on login via
  `auth.service/controller.ts`) and a new `AuthContext.setBillNote`.
  - **Made the PDF path robust to variable-length notes** rather than
    assuming the one hardcoded sentence's line count: `billPdf.ts` now
    measures the actual wrapped line count via `doc.splitTextToSize()`
    (new `getNoteLines()` helper, reused by both the pre-draw
    box-height measurement and the real draw) instead of budgeting a
    fixed one-line height — the same class of fixed-height-vs-
    wrapped-text bug just fixed for item names in Round 11, headed off
    proactively this time instead of found by accident.
  - Verified live: set a deliberately long 3-sentence custom note,
    confirmed it wraps to 3 lines cleanly with no overlap into the
    signature/banner area in both Print and the actual downloaded PDF;
    reverted to blank afterward (fabricated for testing, not real
    business content) and confirmed the default text comes back.

**Tests:** TypeScript (backend + client) PASS. `npm run test:auth`
5/5 PASS (login/me response shape). Production build succeeds. Full
`npm run test:all` regression re-run given the schema change.

## Billing + UX Corrections Round 13 — COMPLETE

Two asks: show proprietor name + two phone numbers in the bill header
(managed from Settings), and make the proprietor name bolder/bigger.

**Fixed:**
- **Second phone number**: discovered `businesses.alternate_phone`
  already existed in the schema but was never wired up anywhere. Wired
  it through the same Settings-field path as `bill_note`/
  `print_language` (`business.validation/service.ts`, exposed on
  login via `auth.service/controller.ts`, new `AuthContext
  .setContactNumbers`), plus a new "Contact Numbers" Settings card
  (Primary Phone + Alternate Phone, both optional).
- **Bill header restructured** (`PrintableBill.tsx` + `billPdf.ts`):
  proprietor name now sits on its own bold/bigger line, with both
  phone numbers (`+91 <primary> · +91 <alternate>`) on the line below
  it, in both the CSS print layout and the jsPDF-generated PDF.
- Verified live: set alternate phone to the user-supplied
  `9392424775` via the running Settings UI, confirmed both numbers
  render correctly in the print layout.

**Tests:** TypeScript (backend + client) PASS.

## Billing + UX Corrections Round 14 — COMPLETE

Four asks: bolder/bigger customer name on the bill; a garbled
proprietor name in the downloaded PDF when typed in Telugu (with a
screenshot showing mojibake); a correctness/alignment/no-data-loss
verification pass; and hiding inactive customers from the billing
customer picker.

**Fixed:**
- **Customer name bolder/bigger**: applied in both `PrintableBill.tsx`
  (the `td` holding the name is now `fontWeight: 800, fontSize:
  9.5px`) and `billPdf.ts` (bold, 8.5pt, with `truncateToWidth` as a
  safety net against overflowing its table cell). The PDF's
  `measureContentEnd` — an arithmetic mirror of the real draw, used to
  pre-compute box height before anything is drawn — had its matching
  `cy` increment updated from 3.4 to 3.6 so the two stay in sync (this
  codebase's established failure mode when they drift).
- **Garbled Telugu proprietor name in the PDF** — root cause: jsPDF's
  built-in Helvetica has no Telugu glyphs, so `businessName`/
  `businessAddress`/`proprietorName` (free-text fields an admin can
  type in either script) were always drawn with hardcoded Helvetica
  regardless of content. Added `containsTelugu()` + a per-field
  `resolveFreeTextFont()` that auto-detects the actual script and
  switches to the embedded NotoSansTelugu font — independent of the
  `print_language` setting, since this is raw admin-typed content, not
  a translation choice.
  - **Found a second bug while verifying the first fix**: the user's
    real proprietor-name value is mixed-script (`సాంబయ్య (Kumar)` —
    Telugu name + English parenthetical). Picking *one* font for the
    whole string silently dropped the "(Kumar)" part entirely, since
    NotoSansTelugu has zero Latin glyphs (confirmed via `fontTools`:
    114 glyphs, none of them ASCII). Fixed with `splitScriptRuns()` +
    `drawMixedScriptText()` — splits the string into Telugu/non-Telugu
    runs, measures each run's width in its own font, and draws them
    left-to-right from a pre-computed centered start position so
    mixed-script text renders in full instead of losing whichever
    script the single chosen font doesn't cover. Applied to
    `businessName` and `proprietorName` (the two single-line
    center-aligned free-text fields); `businessAddress` (which wraps
    via `maxWidth`) keeps the simpler whole-string font choice, a
    smaller residual gap not reported as broken. Confirmed the CSS
    print path (`PrintableBill.tsx`) never had this bug — real browser
    text rendering does per-glyph font substitution automatically,
    unlike jsPDF's embedded-font model.
- **Found a third, unrelated layout bug while re-verifying the PDF**:
  the item table's Rate and Amount columns (13mm each) were too narrow
  for real values — `Rs. 1,200.00` in the Amount column visibly
  overlapped `Rs. 120.00` in the Rate column next to it. Widened the
  columns (Item 29→22mm, Rate 13→15mm, Amount 13→18mm; item names
  already truncate safely via `truncateToWidth` so narrowing that
  column is a safe tradeoff) and added `fitMoneyFontSize()` as a
  backstop — shrinks a cell's font size (never truncates a number,
  unlike item names) if an unusually large value still wouldn't fit.
- **Inactive customers excluded from billing**: added an `activeOnly`
  filter (`customer.controller/service.ts`, new query param) used only
  by `CustomerPicker.tsx` (the picker embedded in the New Bill flow);
  the Customers admin page intentionally still lists everyone,
  including inactive accounts, so they can be found and reactivated.
  Query key factory (`queryKeys.ts`) updated to key on `activeOnly` so
  the two screens' caches don't collide.
- **Verification pass** (per the user's explicit "no auto delete and
  data loss" concern): re-checked a real live bill (BILL-000224,
  8 KG × ₹45 + 10 SET × ₹120 = ₹1,560; previous balance ₹1,100 →
  overall balance ₹2,660) — all correct, confirmed against the running
  app, not just the PDF. No destructive operation was touched this
  round; only reads and PDF/print rendering changed.

**Verified live:** backend dev server had stopped (background restart
had failed earlier with exit code 4) — restarted it before testing.
Downloaded the real PDF for BILL-000224 three times across the fix
iterations (rendered with PyMuPDF to inspect pixel-level output, since
the sandboxed browser's file-picker can't be driven directly):
confirmed "సాంబయ్య (Kumar)" now renders in full, the Rate/Amount
overlap is gone, customer name is visibly bolder, and calculations are
correct. Confirmed in the running app that searching "Mahesh" (an
inactive customer) in the New Bill customer picker returns "No
matches" while "hithesh" (active) still resolves correctly, and that
Mahesh still appears on the Customers admin page. No live business
data (bills/payments/customers) was created, modified, or deleted
during this round's testing — only reads and PDF downloads — so no
test-data cleanup was required; local scratch PDFs/PNGs used for
visual inspection were deleted afterward.

**Tests:** TypeScript (backend + client) PASS. `npm run test:customers`
7/7 PASS.