# Payments + Ledger Work Report

## Architecture

The Payments and Ledger modules were added as two new, independent modules under `src/modules/`, following the exact structure already established by the Billing module (`billing.controller.ts` / `billing.service.ts` / `billing.routes.ts` / `billing.validation.ts`). No existing module (`auth`, `customers`, `categories`, `items`, `billing`) was rewritten or restructured.

```
src/modules/
├── payments/
│   ├── payment.validation.ts
│   ├── payment.service.ts
│   ├── payment.controller.ts
│   └── payment.routes.ts
└── ledger/
    ├── ledger.validation.ts
    ├── ledger.service.ts
    ├── ledger.controller.ts
    └── ledger.routes.ts
```

Both modules reuse:
- The existing Prisma client (`src/config/database.ts`), unmodified.
- The existing `authMiddleware` / `requireRole` (`src/middleware/auth.middleware.ts`), unmodified.
- The existing `errorMiddleware` (`src/middleware/error.middleware.ts`), unmodified — Zod validation errors already flow through it as HTTP 400.
- The existing response envelope: `{ success, message?, data, count? }`.
- The existing per-module error-class pattern (`BillingError` in Billing → `PaymentError` in Payments, `LedgerError` in Ledger), each with a `statusCode`, caught in the controller and translated to the matching HTTP status.
- The existing BigInt/Decimal serialization pattern (`serializeBigInt` in each controller; Prisma `Decimal.toJSON()` already stringifies money fields).
- The existing database-generator pattern (`SELECT generate_payment_number()` via `$queryRaw`, exactly like `generate_bill_number()` in Billing).
- The existing pessimistic-locking pattern (`SELECT id FROM customers WHERE id = ... FOR UPDATE` inside the transaction, exactly matching `lockCustomer` in `billing.service.ts`), extended with an equivalent `lockBill` for bill-level allocation safety.

## Files Created

- `src/modules/payments/payment.validation.ts` — Zod schemas for payment creation (incl. nested allocations), payment ID/number params, and list-query filters.
- `src/modules/payments/payment.service.ts` — Transactional payment creation, allocation, reversal, and read queries.
- `src/modules/payments/payment.controller.ts` — Express controllers, including the customer-payment-history controller mounted from the customers router.
- `src/modules/payments/payment.routes.ts` — `/api/payments` router.
- `src/modules/ledger/ledger.validation.ts` — Zod schemas for the customer-ledger path param and list-query filters (date range, entry type, pagination).
- `src/modules/ledger/ledger.service.ts` — Ledger retrieval and balance calculation.
- `src/modules/ledger/ledger.controller.ts` — Express controllers.
- `src/modules/ledger/ledger.routes.ts` — `/api/ledger` router.
- `src/tests/payments.test.ts` — 32 automated end-to-end tests.
- `src/tests/ledger.test.ts` — 19 automated end-to-end tests.
- `docs/reports/PAYMENTS_LEDGER_WORK_REPORT.md` — this report.
- `docs/reports/PAYMENTS_LEDGER_TEST_REPORT.md` — test report.

## Files Modified

- `src/routes/index.ts` — registered `/api/payments` and `/api/ledger` routers. No existing route registrations changed.
- `src/modules/customers/customer.routes.ts` — added `GET /:id/payments`, wired to a controller function exported from the payments module. `customer.controller.ts` and `customer.service.ts` were **not** touched.
- `package.json` — added `test:payments`, `test:ledger`, and a combined `test:all` script. No existing script changed.

## APIs Added

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/payments` | Create a payment, optionally with bill allocations | ADMIN or STAFF |
| GET | `/api/payments` | List payments (filters: `customer_id`, `payment_method`, `start_date`, `end_date`, `search`) | ADMIN or STAFF |
| GET | `/api/payments/number/:paymentNumber` | Get payment by payment number | ADMIN or STAFF |
| GET | `/api/payments/:id` | Get payment by ID | ADMIN or STAFF |
| PATCH | `/api/payments/:id/cancel` | Reverse a payment (compensating ledger entry) | **ADMIN only** |
| GET | `/api/customers/:id/payments` | Customer payment history | ADMIN or STAFF |
| GET | `/api/ledger/customer/:customerId` | Chronological ledger entries (filters: `start_date`, `end_date`, `entry_type`, `page`, `limit`) | ADMIN or STAFF |
| GET | `/api/ledger/customer/:customerId/balance` | Current outstanding balance | ADMIN or STAFF |

## Payment Flow

1. Resolve `business_id` from `req.user.businessId` (JWT) — never from the request body.
2. Inside a single `prisma.$transaction`:
   - Verify the customer exists in this business (404 otherwise).
   - Lock the customer row (`SELECT ... FOR UPDATE`) to serialize concurrent payments for the same customer.
   - Compute the customer's current outstanding balance from the latest `ledger_entries.balance_after` (same method `billing.service.ts` already uses — no new formula invented).
   - Reject if `amount > current balance` (see **Financial Integrity** below for why).
   - Generate the payment number via `SELECT generate_payment_number()`.
   - Create the `payments` row.
   - Process each allocation (see **Allocation Flow**).
   - Create **one** `ledger_entries` row of type `PAYMENT`, `credit = amount` (the full payment amount, regardless of how much was allocated), `balance_after` computed under lock.
   - Write an `audit_logs` row (`action = CREATE`, `entity_type = "payment"`).
3. Return the payment with its allocations and ledger entry included.

If any step throws, the entire transaction rolls back — no partial payment, no orphan allocation, no orphan ledger entry, no incorrect balance. Verified by an explicit automated rollback test (see **Testing**).

## Allocation Flow

For each `{ bill_id, amount }` in the request (processed in ascending `bill_id` order to avoid lock-ordering deadlocks):

1. Lock the bill row (`SELECT ... FOR UPDATE`), scoped to the caller's `business_id`.
2. Compute the bill's outstanding amount as `grand_total − Σ(allocated_amount of allocations whose payment has not been reversed)` (see **Financial Correction** for why reversed payments are excluded here).
3. Reject (400) if the bill does not belong to the payment's customer.
4. Reject (409) if the bill's status is not `COMPLETED` (covers cancelled and draft bills).
5. Reject (409) if the allocation amount exceeds the bill's outstanding amount.
6. Create the `payment_allocations` row.

Bills in another business are simply not found by the locked lookup (404), which is the same cross-tenant convention already used by `getBillById` in Billing.

Sum-of-allocations-vs-payment-amount and duplicate-bill-in-one-request are both rejected at the Zod layer (400) before the service runs, and re-verified in the service for defense in depth.

## Ledger Flow

- Every ledger-affecting event (a sale, a payment, a reversal) is one `ledger_entries` row. Rows are never edited or deleted.
- `SALE` (existing, Billing-owned): debit = bill grand total.
- `PAYMENT` (new, Payments-owned): credit = full payment amount, independent of how many bills it was allocated to. `bill_id` is left `null` on Payments-module PAYMENT entries because a single payment can span multiple bills; the link to affected bills is the `payment_allocations` table via `payment_id`.
- `ADJUSTMENT` (new usage, Payments-owned): used for payment reversal — see **Financial Correction**.
- `balance_after` is always computed by reading the customer's latest `balance_after` **inside the same locked transaction** that appends the new row — never a separate read-then-write outside the lock — so concurrent payments cannot race on a stale balance.

## Balance Calculation

`GET /api/ledger/customer/:id/balance` mirrors the existing `customer_balances` database view's formula exactly: `SUM(debit) − SUM(credit)`. It is computed via `prisma.ledger_entries.aggregate(...)` rather than querying the view directly, for two reasons:
1. The view's `WHERE c.is_active = true` clause would silently return no row for a deactivated customer who may still have outstanding history; the aggregate works for both.
2. It avoids a second raw-SQL BigInt/Decimal deserialization path in addition to the Prisma-typed one already used everywhere else.

No new balance formula was invented; this is the same SUM(debit)−SUM(credit) the view already encodes, and mathematically equal to the running `balance_after` used transactionally (each entry's `balance_after` is, by construction, the previous `balance_after` plus that entry's own debit/credit).

## Security

- Every Payments and Ledger route requires `authMiddleware`.
- Every service query filters by `business_id = req.user.businessId`; a matching row in another business is simply not found (404), never a raw Prisma error.
- `business_id` and `created_by` are never accepted from the request body; `created_by` always comes from `req.user.userId`.
- `PATCH /api/payments/:id/cancel` (financial reversal) additionally requires `requireRole("ADMIN")`. This is a deliberate policy choice for this stage: reversal moves money on the ledger, which is a stronger action than the existing (STAFF-accessible) bill cancellation. It is implemented consistently via the existing `requireRole` middleware already used elsewhere in the codebase.
- Verified with automated cross-business tests: a second, isolated business (bootstrapped for the test only) cannot read, list, or allocate against the first business's payments, bills, or ledger.

## Transaction Safety

Payment creation and payment reversal both run inside `prisma.$transaction(async (tx) => { ... }, { maxWait: 10000, timeout: 20000 })`, the same options Billing already uses for Neon's cloud latency. All reads that matter for correctness (current balance, bill outstanding) are performed through the transaction client (`tx`) under an explicit row lock, not through the outer `prisma` client, so nothing can be read stale mid-transaction.

## Financial Integrity

- **Payment amount is capped at the customer's current outstanding balance.** The `ledger_entries` table has a database check constraint, `ledger_balance_non_negative CHECK (balance_after >= 0)`. A payment larger than the customer's current balance would push `balance_after` negative and be rejected by the database regardless of what the application does. Rather than let that surface as an opaque database error, the service checks it up front and returns a clear `409` ("Payment amount cannot exceed customer outstanding balance"). See **Known Limitations** for what this means in practice.
- **Unallocated remainder is never lost.** The ledger `PAYMENT` entry always credits the *full* payment amount, not just the allocated portion; the unallocated remainder simply reduces the customer's overall balance without being tied to a specific bill (per the specification's example in "Payment Creation With Allocations"). This is covered by an explicit automated test comparing the ledger credit and the resulting balance against the full payment amount, not the allocated subset.
- **Bill outstanding never double-counts a reversed payment.** See **Financial Correction** below.
- **All amounts are Prisma `Decimal`**, rounded with `toDecimalPlaces(2, ROUND_HALF_UP)` at each computation step — the same `roundMoney` convention already used in `billing.service.ts`. No `number` arithmetic is used for money.

## Financial Correction (Payment Reversal)

Payments and payment allocations are never deleted or mutated. A reversal is a **compensating `ADJUSTMENT` ledger entry**:

- `debit = payment.amount`, `balance_after = current balance + payment.amount`, `payment_id = <reversed payment>`, `description = "Reversal of payment <number>"`.
- The presence of an `ADJUSTMENT` entry with a given `payment_id` **is** the durable marker that that payment has been reversed — there is no `status` column on `payments` to add (see **Database Changes**), so this avoids needing one.
- Reversing an already-reversed payment is rejected (409), detected via the same marker.
- **Bill-level outstanding correctly excludes reversed payments**: the allocation-outstanding calculation (`getBillOutstanding` in `payment.service.ts`) looks up which of a bill's allocations belong to a reversed payment and excludes their `allocated_amount` from the "already paid" total. This means a bill whose paying payment was reversed becomes payable again automatically, with no separate "un-allocate" step and no schema change.
- The `audit_action` enum (`CREATE`, `UPDATE`, `CANCEL`, `RESTORE`) has no `REVERSE` value. Reversal reuses `CANCEL`, consistent with how Billing already uses `CANCEL` for its own compensating-entry cancellation pattern (`cancelBill` in `billing.service.ts`) rather than a distinct "reverse" action.

## Performance

- All list/read queries are scoped by indexed columns already present in the schema: `idx_payments_customer`, `idx_payments_payment_at`, `idx_ledger_customer_date`, `idx_payment_allocations_bill`. No new indexes were required.
- `GET /api/ledger/customer/:id` is paginated (`page`, `limit`, default 100, max 500) to avoid unbounded retrieval as ledger history grows; other list endpoints return the full result set, matching the existing Billing/Customers/Items convention and the stated scale (~500 transactions/day).
- No N+1 queries: payment/bill lookups use `include` for related rows in a single round trip, matching the `billInclude` pattern already used in Billing.

## Database Changes

**NO DATABASE CHANGES.** No `prisma migrate dev`, no `prisma db push`, no schema edits were made. The existing `payments`, `payment_allocations`, `ledger_entries`, and `audit_logs` tables, along with `generate_payment_number()` and the `customer_balances` view, were sufficient for every requirement in this stage — including full, non-destructive payment reversal — once the reversal was modeled as a compensating `ADJUSTMENT` ledger entry rather than a payment-status field.

One schema gap was identified but did **not** require a change to unblock this stage (documented here per the instruction to record such findings rather than apply them silently):
- **Problem**: `payments` has no `status` (e.g. `ACTIVE` / `CANCELLED`) column, so "has this payment been reversed?" cannot be answered by a single indexed column lookup; it currently requires checking for a matching `ADJUSTMENT` ledger entry.
- **Affected table**: `payments`.
- **Proposed change** (not applied): add `status payment_status @default(ACTIVE)` (new enum `ACTIVE | CANCELLED`) to `payments`, and an index on `(business_id, status)`.
- **Why it wasn't necessary here**: the ledger-entry marker fully solves both correctness requirements this stage needs (idempotent reversal detection, and excluding reversed payments from bill-outstanding math) without a migration. The column would only be a performance/readability convenience (a single indexed boolean-style filter instead of a payment_id lookup against `ledger_entries`) — worth doing if payment reversal becomes a high-frequency, high-volume operation, but not required now.

## Known Limitations

1. **No advance/credit-balance payments.** Because of the `ledger_balance_non_negative` database constraint, a payment cannot exceed the customer's current outstanding balance — there is no way, at the schema level, to represent a customer's "credit balance" (money paid in advance of any due amount) as a negative ledger balance. A customer with ₹0 outstanding cannot currently make a prepayment. Supporting this would require either a schema change (e.g. allowing negative balances, or a separate `customer_credits` construct) or a product decision that advance payments are out of scope. This is a pre-existing constraint of the database, not introduced by this stage.
2. **Per-bill "outstanding" and customer "balance" are two different lenses** when a payment is left unallocated (by design, per the specification): an unallocated payment reduces the customer's overall balance immediately but does not reduce any specific bill's outstanding amount until it (or a later payment) is explicitly allocated to that bill. `Σ(per-bill outstanding)` can therefore be temporarily larger than the customer's ledger balance while unallocated payment credit exists. This is intentional (it is exactly what "payment-only transactions" and "remaining unallocated payment" in the specification describe), not a bug, but worth knowing when building reports on top of this API.
3. **Items and Categories modules are single-tenant** (`BUSINESS_ID = BigInt(1)` hardcoded in `item.controller.ts` / `category.controller.ts`), unlike Customers, Billing, Payments, and Ledger, which all correctly use `req.user.businessId`. This is a pre-existing condition of the codebase, out of scope for this stage ("DO NOT rewrite Item module"), and is called out here because it was discovered while building the cross-business security tests (a naive test would have silently created cross-tenant fixtures under business 1). The automated tests bootstrap the second business's item/category fixtures directly via Prisma to work around it; this does not affect production payment/ledger behavior, which never touches the Items/Categories controllers' business scoping.
4. **Payment method and reference number are not independently editable.** There is no `PATCH /api/payments/:id` in this stage — only creation and reversal. Correcting a mis-entered payment method or reference number requires reversing the payment and creating a new one, consistent with the "never fake a financial correction" rule.

## Final Status

**PAYMENTS + LEDGER MODULE READY**
