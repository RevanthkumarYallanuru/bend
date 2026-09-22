# Backend Final QA Report — Lakshmi Ganapathi Enterprises

Covers Phases 1–5 of `plan.md`: Payments + Ledger, Cancellation + Audit,
Delivery + Tracking, Reports + Dashboard + XLSX, and this Backend
Final QA / freeze milestone.

## 1. Environment

| Item | Value |
|---|---|
| Node.js / TypeScript | `typescript@^7.0.2`, executed via `tsx` |
| Prisma | `prisma@7.10.0` / `@prisma/client@7.10.0` |
| Database | PostgreSQL (Neon), via `@prisma/adapter-pg` |
| API URL | `http://localhost:5000/api` |
| New dependency this phase | `exceljs@4.4.0` (XLSX generation) |

## 2. Full Regression Results

| Module | Total | Passed | Failed |
|---|---:|---:|---:|
| Authentication | 5 | 5 | 0 |
| Customers | 7 | 7 | 0 |
| Categories | 8 | 8 | 0 |
| Items + Units | 13 | 13 | 0 |
| Billing | 43 | 43 | 0 |
| Payments | 33 | 33 | 0 |
| Ledger | 19 | 19 | 0 |
| Delivery + Tracking | 21 | 21 | 0 |
| Reports + Dashboard + XLSX | 16 | 16 | 0 |
| **TOTAL** | **165** | **165** | **0** |

Run via `npm run test:all`, one continuous process, no isolated
per-suite runs — the same regression a fresh clone would see.

TypeScript (`npx tsc --noEmit`): **PASS — 0 errors**
Prisma (`npx prisma validate`): **PASS — schema valid, 0 changes**

## 3. What Was Built This Session (Phases 3–5)

### Phase 3 — Delivery + Tracking
- `src/modules/deliveries/` — `delivery.validation.ts`, `delivery.service.ts`, `delivery.controller.ts`, `agent.routes.ts`, `delivery.routes.ts`
- Delivery agents: create / list / get / update / activate / deactivate (`/api/delivery-agents`)
- Deliveries (`/api/deliveries`): assign a completed bill to delivery, list/filter, get by id, get by bill, reassign agent, update status
- Status pipeline modeled as a directed graph, not a strict line:
  `GENERATED → SENT → REACHED → {BALANCE, CLEARED}`, `BALANCE → CLEARED`, `CLEARED` terminal. REACHED can go straight to CLEARED (paid on the spot) or via BALANCE (collected later) — both are real dispatch outcomes.
- Every transition uses optimistic concurrency (`updateMany` with a `status` precondition) so two concurrent status updates can't silently clobber each other; a losing request gets a 409, not a corrupted state.
- Business isolation enforced by joining through `bills.business_id` (bill_deliveries has no business_id column of its own) and directly via `delivery_agents.business_id`.

### Phase 4 — Reports + Dashboard + XLSX
- `src/modules/reports/` — sales, payments, customer-outstanding, and item-sales reports, plus a dashboard summary
- Date ranges (`today` / `week` / `month` / `custom`) resolved in UTC to avoid server-timezone ambiguity; `week` is a rolling 7 days, `month` is calendar-month-to-date — both documented, neither invented silently
- Daily/monthly breakdowns read from the existing `daily_sales_summary` / `daily_payment_summary` views (built for exactly this purpose per `plan.md` §8); item-sales and customer-outstanding use `customer_balances` directly or a scoped join, since the underlying views for those either lack `business_id` (`item_sales_summary`) or date filtering — computing them via a business/date-scoped query instead of the raw view was the correct fix, not a schema change
- XLSX export added for all 5 required exports: sales, payments, customer ledger (via the Ledger module), outstanding, item sales — via a new shared `src/utils/xlsx.ts` helper (`exceljs`), one code path for every export
- Dashboard: today's sales/payments, total outstanding, active customers/items counts, 5 most recent bills and payments

### Phase 5 — Backend Final QA
- Full 165-test regression (table above), TypeScript, Prisma validation
- Business-isolation and cross-business-rejection tests added to both new suites (Delivery, Reports), following the same pattern already proven in Payments/Ledger
- Dependency audit (§6 below)
- Verified zero test-data pollution in the real business (business 1) after every suite run

## 4. API Surface Added This Session

| Method | Endpoint | Auth |
|---|---|---|
| POST | `/api/delivery-agents` | ADMIN/STAFF |
| GET | `/api/delivery-agents` | ADMIN/STAFF |
| GET | `/api/delivery-agents/:id` | ADMIN/STAFF |
| PATCH | `/api/delivery-agents/:id` | ADMIN/STAFF |
| PATCH | `/api/delivery-agents/:id/activate` \| `/deactivate` | ADMIN/STAFF |
| POST | `/api/deliveries` | ADMIN/STAFF |
| GET | `/api/deliveries` | ADMIN/STAFF |
| GET | `/api/deliveries/:id` | ADMIN/STAFF |
| GET | `/api/deliveries/bill/:billId` | ADMIN/STAFF |
| PATCH | `/api/deliveries/:id/agent` | ADMIN/STAFF |
| PATCH | `/api/deliveries/:id/status` | ADMIN/STAFF |
| GET | `/api/reports/dashboard` | ADMIN/STAFF |
| GET | `/api/reports/sales` \| `/sales/export` | ADMIN/STAFF |
| GET | `/api/reports/payments` \| `/payments/export` | ADMIN/STAFF |
| GET | `/api/reports/customers/outstanding` \| `/export` | ADMIN/STAFF |
| GET | `/api/reports/items` \| `/items/export` | ADMIN/STAFF |
| GET | `/api/ledger/customer/:customerId/export` | ADMIN/STAFF |

Plus the Phase 1/2 surface (payments, ledger, bill/payment cancellation with reason) already in place.

## 5. Security & Isolation

Every new endpoint requires `authMiddleware`; every query is scoped by `req.user.businessId` (directly, or via a join through `bills`/`delivery_agents` where the child table has no `business_id` column of its own). Cross-business access returns 404, matching the convention already established across Billing/Payments/Ledger. Verified by dedicated tests in both new suites (Delivery: agent + delivery 404s, list-leak check; Reports: dashboard/outstanding/ledger-export leak checks).

No new role restrictions beyond what Phase 1/2 already established (payment/bill reversal remain the only ADMIN-only mutations); delivery and report operations are available to both roles, matching customers/items/billing precedent.

## 6. Dependency Audit

`npm audit` reports 6 known vulnerabilities (2 moderate, 4 high), **all pre-existing in `prisma`'s own dependency tree** (`deepmerge-ts`, `mysql2` — unrelated to this project's database, which is PostgreSQL) **except one**: `uuid <11.1.1` (moderate, missing buffer bounds check), pulled in transitively by the newly-added `exceljs`. `npm audit fix --force` would downgrade `prisma` 7→6 and `exceljs` 4→3, both breaking changes — **not applied**, since it would regress a database toolchain explicitly required to stay on v7. The `uuid` issue is a buffer-bounds check exceljs doesn't expose to attacker-controlled input in this codebase's usage (workbook generation from server-side data only). Flagged here per the production-readiness dependency-audit requirement; recommend re-checking after `exceljs`/`prisma` publish non-breaking patches.

## 7. Known Limitations / Deferred (not this phase's scope)

1. **Items and Categories modules remain single-tenant** (`BUSINESS_ID = BigInt(1)` hardcoded in their controllers) — a pre-existing condition flagged in the Phase 1 report, unchanged here since it's explicitly out of scope ("do not rewrite Items/Categories"). Every new module in Phases 1–5 queries these tables directly via Prisma with the correct `business_id`, so this bug does not leak across business boundaries anywhere in Payments, Ledger, Delivery, or Reports — it only affects requests made directly to the Items/Categories HTTP endpoints themselves.
2. **`helmet`/`cors` are installed but not wired into `app.ts`.** Per `plan.md` §25 (Phase 5) vs. §32 ("Security QA", a later, separate milestone before production), CORS restrictions, secure headers, and rate limiting belong to that later Security QA phase, not this one — left untouched to avoid scope creep into a phase not yet requested.
3. **No advance/credit-balance payments** (documented in Phase 1's report) — a database check constraint (`ledger_balance_non_negative`) prevents a customer's ledger balance from going negative, so a payment cannot exceed current outstanding.
4. **Delivery status transitions are optimistically concurrent**, not row-locked like the financial transactions in Payments/Billing — appropriate given deliveries are operational, not financial, and the business's expected concurrency (~200 bills/day) is low. A losing concurrent request gets a clean 409, never a corrupted state.
5. **Server-side graceful shutdown does not call `prisma.$disconnect()`** on SIGINT/SIGTERM (only closes the HTTP server) — a minor pre-existing gap, not touched here as it wasn't part of the Payments/Ledger/Delivery/Reports work and isn't a Phase 5 regression-blocking issue.

## 8. Database Changes

**NO DATABASE CHANGES** across Phases 3–5. `generate_bill_number()`/`generate_payment_number()`, all 7 reporting views, and every existing table/constraint were sufficient. The one schema-improvement idea from Phase 1 (an optional `payments.status` column) remains documented-but-unapplied for the same reason as before: the existing schema fully supports every requirement without it.

## 9. Final Status

```
Authentication        5/5
Customers              7/7
Categories             8/8
Items + Units         13/13
Billing               43/43
Payments              33/33
Ledger                19/19
Delivery + Tracking   21/21
Reports + Dashboard   16/16
──────────────────────────
TOTAL                165/165

TypeScript   PASS (0 errors)
Prisma       VALID (0 changes)
```

**BACKEND FREEZE — READY FOR FRONTEND INTEGRATION**
