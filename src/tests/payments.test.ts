import axios from "axios";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let testCustomerId: string | null = null;
let testCustomerBId: string | null = null;
let testCategoryId: string | null = null;
let testItemId: string | null = null;
let testItemUnitId: string | null = null;

let billAId: string | null = null;
let billBId: string | null = null;

let business2Id: bigint | null = null;
let user2Id: bigint | null = null;
let customer2Id: bigint | null = null;
let bill2Id: bigint | null = null;

const createdBillIds: bigint[] = [];
const createdCustomerIds: bigint[] = [];
const createdItemIds: bigint[] = [];
const createdCategoryIds: bigint[] = [];

const results: {
  test: string;
  status: "PASS" | "FAIL";
  details?: string;
}[] = [];

function pass(name: string, details?: string) {
  results.push({ test: name, status: "PASS", details });
}

function fail(name: string, error: unknown) {
  const details =
    error instanceof Error ? error.message : String(error);
  results.push({ test: name, status: "FAIL", details });
}

async function runTest(
  name: string,
  testFunction: () => Promise<void>
) {
  try {
    await testFunction();
    pass(name);
  } catch (error) {
    fail(name, error);
  }
}

function authHeaders(bearer = token) {
  return {
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
  };
}

function moneyEquals(actual: unknown, expected: number): boolean {
  return Number(actual) === expected;
}

async function runPaymentsTests() {
  console.log("\n========================================");
  console.log(" PAYMENTS API AUTOMATED TESTS");
  console.log("========================================\n");

  try {
    /*
     * 1. LOGIN
     */
    await runTest("Login", async () => {
      const response = await axios.post(`${API_URL}/auth/login`, {
        username: "admin",
        password: "ChangeMe@123",
      });

      if (response.status !== 200 || !response.data.success) {
        throw new Error("Login failed");
      }

      token = response.data.data?.token;

      if (!token) {
        throw new Error("JWT token was not returned");
      }
    });

    /*
     * 2. CREATE CUSTOMER TEST FIXTURE
     */
    await runTest("Create customer test fixture", async () => {
      const custCode = `PAY-CUST-${Date.now()}`;
      const response = await axios.post(
        `${API_URL}/customers`,
        {
          customer_code: custCode,
          english_name: "Payments Test Customer",
          phone: "9000000001",
          address: "Test Address",
        },
        { headers: authHeaders() }
      );

      if (response.status !== 201 || !response.data.success) {
        throw new Error("Failed to create customer test fixture");
      }

      testCustomerId = response.data.data.id;
      if (testCustomerId) {
        createdCustomerIds.push(BigInt(testCustomerId));
      }

      // A second customer in the SAME business, used to prove that
      // allocations cannot cross customer boundaries.
      const custCodeB = `PAY-CUSTB-${Date.now()}`;
      const responseB = await axios.post(
        `${API_URL}/customers`,
        {
          customer_code: custCodeB,
          english_name: "Payments Test Customer B",
          phone: "9000000002",
        },
        { headers: authHeaders() }
      );

      testCustomerBId = responseB.data.data.id;
      if (testCustomerBId) {
        createdCustomerIds.push(BigInt(testCustomerBId));
      }
    });

    /*
     * 3. CREATE ITEM TEST FIXTURE
     */
    await runTest("Create item test fixture", async () => {
      const catRes = await axios.post(
        `${API_URL}/categories`,
        { name: `Payments Test Category ${Date.now()}` },
        { headers: authHeaders() }
      );

      if (catRes.status !== 201 || !catRes.data?.data?.id) {
        throw new Error("Failed to create a category fixture for item fixture");
      }
      testCategoryId = catRes.data.data.id;

      const code = `PAY-ITEM-${Date.now()}`;
      const res = await axios.post(
        `${API_URL}/items`,
        {
          item_code: code,
          english_name: `Payment Item ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );

      testItemId = res.data.data.id;
      if (testItemId) {
        createdItemIds.push(BigInt(testItemId));
      }

      const unitRes = await axios.post(
        `${API_URL}/items/${testItemId}/units`,
        {
          unit: "PCS",
          standard_price: 100,
          is_default: true,
        },
        { headers: authHeaders() }
      );

      testItemUnitId = unitRes.data.data.id;
    });

    /*
     * 4. CREATE BILL A (grand_total = 6000, unpaid)
     */
    await runTest("Create bill A (unpaid, 6000)", async () => {
      const response = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "CUSTOMER",
          customer_id: testCustomerId,
          amount_paid: 0,
          items: [
            {
              item_id: testItemId,
              item_unit_id: testItemUnitId,
              quantity: 60,
              actual_rate: 100,
            },
          ],
        },
        { headers: authHeaders() }
      );

      if (response.status !== 201) {
        throw new Error(`Expected 201, got ${response.status}`);
      }

      billAId = response.data.data.id;
      createdBillIds.push(BigInt(billAId!));

      if (!moneyEquals(response.data.data.grand_total, 6000)) {
        throw new Error(
          `Expected grand_total 6000, got ${response.data.data.grand_total}`
        );
      }
    });

    /*
     * 5. CREATE BILL B (grand_total = 4000, unpaid)
     */
    await runTest("Create bill B (unpaid, 4000)", async () => {
      const response = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "CUSTOMER",
          customer_id: testCustomerId,
          amount_paid: 0,
          items: [
            {
              item_id: testItemId,
              item_unit_id: testItemUnitId,
              quantity: 40,
              actual_rate: 100,
            },
          ],
        },
        { headers: authHeaders() }
      );

      if (response.status !== 201) {
        throw new Error(`Expected 201, got ${response.status}`);
      }

      billBId = response.data.data.id;
      createdBillIds.push(BigInt(billBId!));

      if (!moneyEquals(response.data.data.grand_total, 4000)) {
        throw new Error(
          `Expected grand_total 4000, got ${response.data.data.grand_total}`
        );
      }

      // Customer balance is now 10000 (6000 + 4000).
    });

    /*
     * 6. PAYMENT-ONLY TRANSACTION
     */
    let paymentOnlyData: any = null;

    await runTest("Payment-only transaction (no bill)", async () => {
      const response = await axios.post(
        `${API_URL}/payments`,
        {
          customer_id: testCustomerId,
          amount: 1000,
          payment_method: "CASH",
          notes: "Payment-only transaction",
        },
        { headers: authHeaders() }
      );

      if (response.status !== 201 || !response.data.success) {
        throw new Error(`Expected 201, got ${response.status}`);
      }

      paymentOnlyData = response.data.data;

      if (paymentOnlyData.payment_allocations.length !== 0) {
        throw new Error(
          "Payment-only transaction should have zero allocations"
        );
      }

      const ledgerEntry = paymentOnlyData.ledger_entries[0];
      if (
        !ledgerEntry ||
        ledgerEntry.entry_type !== "PAYMENT" ||
        !moneyEquals(ledgerEntry.credit, 1000) ||
        !moneyEquals(ledgerEntry.balance_after, 9000)
      ) {
        throw new Error(
          `Unexpected ledger entry for payment-only transaction: ${JSON.stringify(
            ledgerEntry
          )}`
        );
      }
      // Customer balance is now 9000.
    });

    /*
     * 7. PAYMENT NUMBER GENERATED
     */
    await runTest("Payment number generated", async () => {
      if (
        !paymentOnlyData?.payment_number ||
        !/^PAY-\d+$/.test(paymentOnlyData.payment_number)
      ) {
        throw new Error(
          `Invalid payment number format: ${paymentOnlyData?.payment_number}`
        );
      }
    });

    /*
     * 8. CORRECT PAYMENT AMOUNT
     */
    await runTest("Correct payment amount", async () => {
      if (!moneyEquals(paymentOnlyData.amount, 1000)) {
        throw new Error(
          `Expected amount 1000, got ${paymentOnlyData.amount}`
        );
      }
    });

    /*
     * 9. CORRECT PAYMENT METHOD
     */
    await runTest("Correct payment method", async () => {
      if (paymentOnlyData.payment_method !== "CASH") {
        throw new Error(
          `Expected payment_method CASH, got ${paymentOnlyData.payment_method}`
        );
      }
    });

    /*
     * 10. PAYMENT RETRIEVAL BY ID
     */
    await runTest("Payment retrieval by ID", async () => {
      const response = await axios.get(
        `${API_URL}/payments/${paymentOnlyData.id}`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || !response.data.success) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (response.data.data.id !== paymentOnlyData.id) {
        throw new Error("Returned payment ID does not match");
      }
    });

    /*
     * 11. PAYMENT RETRIEVAL BY NUMBER
     */
    await runTest("Payment retrieval by number", async () => {
      const response = await axios.get(
        `${API_URL}/payments/number/${paymentOnlyData.payment_number}`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || !response.data.success) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (
        response.data.data.payment_number !==
        paymentOnlyData.payment_number
      ) {
        throw new Error("Returned payment number does not match");
      }
    });

    /*
     * 12. LIST PAYMENTS
     */
    await runTest("List payments", async () => {
      const response = await axios.get(`${API_URL}/payments`, {
        headers: authHeaders(),
      });

      if (response.status !== 200 || response.data.count < 1) {
        throw new Error("List payments returned no results");
      }
    });

    /*
     * 13. FILTER BY CUSTOMER
     */
    await runTest("Filter payments by customer", async () => {
      const response = await axios.get(
        `${API_URL}/payments?customer_id=${testCustomerId}`,
        { headers: authHeaders() }
      );

      if (response.data.count < 1) {
        throw new Error("Expected at least 1 payment for customer");
      }

      if (
        response.data.data.some(
          (p: any) => p.customer_id !== testCustomerId
        )
      ) {
        throw new Error("Filter returned unrelated payments");
      }
    });

    /*
     * 14. FILTER BY DATE
     */
    await runTest("Filter payments by date", async () => {
      const today = new Date().toISOString().slice(0, 10);

      const inRange = await axios.get(
        `${API_URL}/payments?customer_id=${testCustomerId}&start_date=${today}&end_date=${today}`,
        { headers: authHeaders() }
      );

      if (inRange.data.count < 1) {
        throw new Error("Expected at least 1 payment today");
      }

      const outOfRange = await axios.get(
        `${API_URL}/payments?customer_id=${testCustomerId}&start_date=2000-01-01&end_date=2000-01-31`,
        { headers: authHeaders() }
      );

      if (outOfRange.data.count !== 0) {
        throw new Error("Expected 0 payments for year 2000");
      }
    });

    /*
     * 15. PAYMENT WITH ONE ALLOCATION (PARTIAL)
     */
    let partialAllocationPayment: any = null;

    await runTest(
      "Payment with one allocation (partial bill allocation)",
      async () => {
        const response = await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: 2000,
            payment_method: "UPI",
            allocations: [{ bill_id: billAId, amount: 1500 }],
          },
          { headers: authHeaders() }
        );

        if (response.status !== 201) {
          throw new Error(`Expected 201, got ${response.status}`);
        }

        partialAllocationPayment = response.data.data;

        if (
          partialAllocationPayment.payment_allocations.length !== 1 ||
          !moneyEquals(
            partialAllocationPayment.payment_allocations[0]
              .allocated_amount,
            1500
          )
        ) {
          throw new Error("Expected single allocation of 1500");
        }

        // Ledger credit must equal the FULL payment amount (2000),
        // not just the allocated portion (1500) — the unallocated
        // remainder (500) must not be silently lost.
        const ledgerEntry = partialAllocationPayment.ledger_entries[0];
        if (
          !moneyEquals(ledgerEntry.credit, 2000) ||
          !moneyEquals(ledgerEntry.balance_after, 7000)
        ) {
          throw new Error(
            `Expected ledger credit 2000 / balance 7000, got ${JSON.stringify(
              ledgerEntry
            )}`
          );
        }

        // Bill A outstanding should now be 6000 - 1500 = 4500.
        const allocations = await prisma.payment_allocations.findMany({
          where: { bill_id: BigInt(billAId!) },
        });
        const allocatedTotal = allocations.reduce(
          (sum, a) => sum + Number(a.allocated_amount),
          0
        );
        if (allocatedTotal !== 1500) {
          throw new Error(
            `Expected 1500 allocated to bill A so far, got ${allocatedTotal}`
          );
        }
        // Customer balance is now 7000.
      }
    );

    /*
     * 16. REMAINING UNALLOCATED PAYMENT PRESERVED
     */
    await runTest(
      "Remaining unallocated payment amount is preserved",
      async () => {
        // Payment amount 2000, only 1500 allocated => 500 remained
        // unallocated at customer level and must not be lost: verify
        // via the customer balance endpoint, computed independently
        // from allocations (pure ledger SUM(debit)-SUM(credit)).
        const response = await axios.get(
          `${API_URL}/ledger/customer/${testCustomerId}/balance`,
          { headers: authHeaders() }
        );

        if (!moneyEquals(response.data.data.balance, 7000)) {
          throw new Error(
            `Expected customer balance 7000, got ${response.data.data.balance}`
          );
        }
      }
    );

    /*
     * 17. PAYMENT WITH MULTIPLE ALLOCATIONS (ONE FULL + ONE PARTIAL)
     */
    await runTest(
      "Payment with multiple allocations (full + partial)",
      async () => {
        const response = await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: 6000,
            payment_method: "BANK_TRANSFER",
            allocations: [
              { bill_id: billAId, amount: 4500 },
              { bill_id: billBId, amount: 1500 },
            ],
          },
          { headers: authHeaders() }
        );

        if (response.status !== 201) {
          throw new Error(
            `Expected 201, got ${response.status}: ${JSON.stringify(
              response.data
            )}`
          );
        }

        const payment = response.data.data;

        if (payment.payment_allocations.length !== 2) {
          throw new Error(
            `Expected 2 allocations, got ${payment.payment_allocations.length}`
          );
        }

        const ledgerEntry = payment.ledger_entries[0];
        if (
          !moneyEquals(ledgerEntry.credit, 6000) ||
          !moneyEquals(ledgerEntry.balance_after, 1000)
        ) {
          throw new Error(
            `Expected ledger credit 6000 / balance 1000, got ${JSON.stringify(
              ledgerEntry
            )}`
          );
        }
        // Customer balance is now 1000.
      }
    );

    /*
     * 18. FULL BILL ALLOCATION (BILL A FULLY PAID OFF)
     */
    await runTest("Full bill allocation reaches zero outstanding", async () => {
      const allocations = await prisma.payment_allocations.findMany({
        where: { bill_id: BigInt(billAId!) },
      });
      const allocatedTotal = allocations.reduce(
        (sum, a) => sum + Number(a.allocated_amount),
        0
      );

      if (allocatedTotal !== 6000) {
        throw new Error(
          `Expected bill A fully allocated (6000), got ${allocatedTotal}`
        );
      }

      const bill = await prisma.bills.findUnique({
        where: { id: BigInt(billAId!) },
      });

      const outstanding = Number(bill!.grand_total) - allocatedTotal;
      if (outstanding !== 0) {
        throw new Error(
          `Expected bill A outstanding 0, got ${outstanding}`
        );
      }
    });

    /*
     * 19. REJECT NEGATIVE AMOUNT
     */
    await runTest("Reject negative payment amount", async () => {
      try {
        await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: -500,
            payment_method: "CASH",
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted negative payment amount");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected HTTP 400, got ${error.response?.status}`
          );
        }
      }
    });

    /*
     * 20. REJECT ZERO AMOUNT
     */
    await runTest("Reject zero payment amount", async () => {
      try {
        await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: 0,
            payment_method: "CASH",
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted zero payment amount");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected HTTP 400, got ${error.response?.status}`
          );
        }
      }
    });

    /*
     * 21. REJECT INVALID CUSTOMER
     */
    await runTest("Reject invalid customer", async () => {
      try {
        await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: "999999999",
            amount: 100,
            payment_method: "CASH",
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted non-existent customer_id");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(
            `Expected HTTP 404, got ${error.response?.status}`
          );
        }
      }
    });

    /*
     * 22. REJECT INVALID PAYMENT METHOD
     */
    await runTest("Reject invalid payment method", async () => {
      try {
        await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: 100,
            payment_method: "BITCOIN",
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted invalid payment_method");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected HTTP 400, got ${error.response?.status}`
          );
        }
      }
    });

    /*
     * 23. REJECT ALLOCATION GREATER THAN PAYMENT
     */
    await runTest("Reject allocation greater than payment amount", async () => {
      try {
        await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: 100,
            payment_method: "CASH",
            allocations: [{ bill_id: billBId, amount: 200 }],
          },
          { headers: authHeaders() }
        );
        throw new Error(
          "API accepted allocation greater than payment amount"
        );
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected HTTP 400, got ${error.response?.status}`
          );
        }
      }
    });

    /*
     * 24. REJECT ALLOCATION GREATER THAN BILL OUTSTANDING
     */
    await runTest(
      "Reject allocation greater than bill outstanding",
      async () => {
        // Bill A is fully paid off (outstanding 0); any further
        // allocation to it must be rejected as a financial conflict.
        try {
          await axios.post(
            `${API_URL}/payments`,
            {
              customer_id: testCustomerId,
              amount: 100,
              payment_method: "CASH",
              allocations: [{ bill_id: billAId, amount: 100 }],
            },
            { headers: authHeaders() }
          );
          throw new Error(
            "API accepted allocation exceeding bill outstanding"
          );
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(
              `Expected HTTP 409, got ${error.response?.status}`
            );
          }
        }
      }
    );

    /*
     * 25. REJECT ALLOCATION TO ANOTHER CUSTOMER'S BILL
     */
    await runTest("Reject allocation to another customer's bill", async () => {
      // Bill for customer B in the SAME business.
      const bResponse = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "CUSTOMER",
          customer_id: testCustomerBId,
          amount_paid: 0,
          items: [
            {
              item_id: testItemId,
              item_unit_id: testItemUnitId,
              quantity: 5,
              actual_rate: 100,
            },
          ],
        },
        { headers: authHeaders() }
      );

      const customerBBillId = bResponse.data.data.id;
      createdBillIds.push(BigInt(customerBBillId));

      try {
        await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: 100,
            payment_method: "CASH",
            allocations: [{ bill_id: customerBBillId, amount: 100 }],
          },
          { headers: authHeaders() }
        );
        throw new Error(
          "API accepted allocation to another customer's bill"
        );
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected HTTP 400, got ${error.response?.status}`
          );
        }
      }
    });

    /*
     * 26. REJECT ALLOCATION TO ANOTHER BUSINESS'S BILL
     */
    await runTest("Reject allocation to another business's bill", async () => {
      // Bootstrap a second, isolated business + admin user directly
      // (no public registration endpoint exists), then drive it
      // through the real API like any other tenant.
      const business2 = await prisma.businesses.create({
        data: {
          name: `Payments Test Business 2 ${Date.now()}`,
          is_active: true,
        },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `pay_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Payments Test Admin 2",
          username: username2,
          password_hash: passwordHash,
          role: "ADMIN",
          is_active: true,
        },
      });
      user2Id = user2.id;

      const loginRes = await axios.post(`${API_URL}/auth/login`, {
        username: username2,
        password: "TestPass@123",
      });
      token2 = loginRes.data.data.token;

      const custRes = await axios.post(
        `${API_URL}/customers`,
        {
          customer_code: `B2-CUST-${Date.now()}`,
          english_name: "Business 2 Customer",
        },
        { headers: authHeaders(token2) }
      );
      customer2Id = BigInt(custRes.data.data.id);

      // NOTE: the existing Categories and Items modules are hardcoded
      // to business_id = 1 (see item.controller.ts / category.controller.ts
      // `const BUSINESS_ID = BigInt(1)`), unlike Customers/Billing/Auth
      // which correctly use req.user.businessId. That is a pre-existing
      // limitation outside this stage's scope (items/categories are not
      // to be rewritten here). Creating a category/item through those
      // endpoints with token2 would silently create them under business
      // 1 instead of business 2. To keep this business-isolation test
      // accurate (and avoid polluting business 1), bootstrap the
      // category/item/unit directly via Prisma under business2Id, then
      // drive bill creation through the real, correctly-scoped API.
      const category2 = await prisma.categories.create({
        data: {
          business_id: business2Id,
          name: `B2 Category ${Date.now()}`,
        },
      });

      const item2 = await prisma.items.create({
        data: {
          business_id: business2Id,
          category_id: category2.id,
          item_code: `B2-ITEM-${Date.now()}`,
          english_name: `Business 2 Item ${Date.now()}`,
        },
      });

      const itemUnit2 = await prisma.item_units.create({
        data: {
          item_id: item2.id,
          unit: "PCS",
          standard_price: 100,
          is_default: true,
        },
      });

      const billRes = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "CUSTOMER",
          customer_id: custRes.data.data.id,
          amount_paid: 0,
          items: [
            {
              item_id: item2.id.toString(),
              item_unit_id: itemUnit2.id.toString(),
              quantity: 2,
              actual_rate: 100,
            },
          ],
        },
        { headers: authHeaders(token2) }
      );
      bill2Id = BigInt(billRes.data.data.id);

      try {
        await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: 100,
            payment_method: "CASH",
            allocations: [
              { bill_id: bill2Id.toString(), amount: 100 },
            ],
          },
          { headers: authHeaders() }
        );
        throw new Error(
          "API accepted allocation to another business's bill"
        );
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(
            `Expected HTTP 404, got ${error.response?.status}`
          );
        }
      }
    });

    /*
     * 27. REJECT ALLOCATION TO CANCELLED BILL
     */
    await runTest("Reject allocation to cancelled bill", async () => {
      const billRes = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "CUSTOMER",
          customer_id: testCustomerId,
          amount_paid: 0,
          items: [
            {
              item_id: testItemId,
              item_unit_id: testItemUnitId,
              quantity: 3,
              actual_rate: 100,
            },
          ],
        },
        { headers: authHeaders() }
      );

      const cancellableBillId = billRes.data.data.id;
      createdBillIds.push(BigInt(cancellableBillId));

      await axios.patch(
        `${API_URL}/bills/${cancellableBillId}/cancel`,
        {},
        { headers: authHeaders() }
      );

      try {
        await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: 100,
            payment_method: "CASH",
            allocations: [
              { bill_id: cancellableBillId, amount: 100 },
            ],
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted allocation to a cancelled bill");
      } catch (error: any) {
        if (error.response?.status !== 409) {
          throw new Error(
            `Expected HTTP 409, got ${error.response?.status}`
          );
        }
      }
    });

    /*
     * 28. AUTHENTICATION REQUIRED
     */
    await runTest(
      "Reject unauthenticated access on all payment endpoints",
      async () => {
        const calls = [
          () => axios.post(`${API_URL}/payments`, {}),
          () => axios.get(`${API_URL}/payments/1`),
          () => axios.get(`${API_URL}/payments/number/PAY-000001`),
          () =>
            axios.patch(`${API_URL}/payments/1/cancel`, {}),
          () =>
            axios.get(`${API_URL}/payments`, {
              headers: { Authorization: "Bearer invalid.token" },
            }),
        ];

        for (const call of calls) {
          try {
            await call();
            throw new Error(
              "Request without valid token was accepted"
            );
          } catch (error: any) {
            if (error.response?.status !== 401) {
              throw new Error(
                `Expected 401, got ${
                  error.response?.status ?? error.message
                }`
              );
            }
          }
        }
      }
    );

    /*
     * 29. CROSS-BUSINESS ACCESS REJECTED
     */
    await runTest("Reject cross-business payment access", async () => {
      // Business 2's token must not be able to read Business 1's
      // payment-only transaction created earlier.
      try {
        await axios.get(
          `${API_URL}/payments/${paymentOnlyData.id}`,
          { headers: authHeaders(token2) }
        );
        throw new Error(
          "Business 2 token accessed Business 1 payment"
        );
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(
            `Expected HTTP 404, got ${error.response?.status}`
          );
        }
      }

      // Business 2's payment list must not include Business 1 data.
      const listRes = await axios.get(`${API_URL}/payments`, {
        headers: authHeaders(token2),
      });

      if (
        listRes.data.data.some(
          (p: any) => p.id === paymentOnlyData.id
        )
      ) {
        throw new Error(
          "Business 2 payment list leaked Business 1 payment"
        );
      }
    });

    /*
     * 30. ATOMIC ROLLBACK TEST
     */
    await runTest(
      "Atomic transaction rollback on invalid mid-request allocation",
      async () => {
        const beforePaymentCount = await prisma.payments.count({
          where: { customer_id: BigInt(testCustomerId!) },
        });
        const beforeAllocationsForB =
          await prisma.payment_allocations.findMany({
            where: { bill_id: BigInt(billBId!) },
          });
        const beforeAllocatedB = beforeAllocationsForB.reduce(
          (sum, a) => sum + Number(a.allocated_amount),
          0
        );
        const beforeLedgerCount = await prisma.ledger_entries.count({
          where: { customer_id: BigInt(testCustomerId!) },
        });
        const beforeAuditCount = await prisma.audit_logs.count({
          where: { entity_type: "payment" },
        });

        try {
          // First allocation (to bill B) is valid on its own;
          // second allocation (to bill A, already fully paid) is
          // not. The whole transaction must roll back, so bill B's
          // allocation from this request must NOT persist either.
          await axios.post(
            `${API_URL}/payments`,
            {
              customer_id: testCustomerId,
              amount: 1000,
              payment_method: "CASH",
              allocations: [
                { bill_id: billBId, amount: 500 },
                { bill_id: billAId, amount: 500 },
              ],
            },
            { headers: authHeaders() }
          );

          throw new Error(
            "API accepted a request that should have failed atomically"
          );
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(
              `Expected HTTP 409, got ${error.response?.status}`
            );
          }
        }

        const afterPaymentCount = await prisma.payments.count({
          where: { customer_id: BigInt(testCustomerId!) },
        });
        if (afterPaymentCount !== beforePaymentCount) {
          throw new Error(
            "A payment row was persisted despite transaction failure"
          );
        }

        const afterAllocationsForB =
          await prisma.payment_allocations.findMany({
            where: { bill_id: BigInt(billBId!) },
          });
        const afterAllocatedB = afterAllocationsForB.reduce(
          (sum, a) => sum + Number(a.allocated_amount),
          0
        );
        if (afterAllocatedB !== beforeAllocatedB) {
          throw new Error(
            "An orphan allocation was persisted despite transaction failure"
          );
        }

        const afterLedgerCount = await prisma.ledger_entries.count({
          where: { customer_id: BigInt(testCustomerId!) },
        });
        if (afterLedgerCount !== beforeLedgerCount) {
          throw new Error(
            "An orphan ledger entry was persisted despite transaction failure"
          );
        }

        const afterAuditCount = await prisma.audit_logs.count({
          where: { entity_type: "payment" },
        });
        if (afterAuditCount !== beforeAuditCount) {
          throw new Error(
            "An orphan audit log was persisted despite transaction failure"
          );
        }
      }
    );

    /*
     * 31. CUSTOMER PAYMENT HISTORY
     */
    await runTest("Customer payment history endpoint", async () => {
      const response = await axios.get(
        `${API_URL}/customers/${testCustomerId}/payments`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || !response.data.success) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (response.data.count < 3) {
        throw new Error(
          `Expected at least 3 payments in history, got ${response.data.count}`
        );
      }
    });

    /*
     * 32. PAYMENT REVERSAL (ADMIN)
     */
    await runTest(
      "Payment reversal restores customer balance",
      async () => {
        const balanceBefore = await axios.get(
          `${API_URL}/ledger/customer/${testCustomerId}/balance`,
          { headers: authHeaders() }
        );

        const cancelRes = await axios.patch(
          `${API_URL}/payments/${paymentOnlyData.id}/cancel`,
          {},
          { headers: authHeaders() }
        );

        if (cancelRes.status !== 200 || !cancelRes.data.success) {
          throw new Error(
            `Expected 200, got ${cancelRes.status}`
          );
        }

        const balanceAfter = await axios.get(
          `${API_URL}/ledger/customer/${testCustomerId}/balance`,
          { headers: authHeaders() }
        );

        const expected =
          Number(balanceBefore.data.data.balance) + 1000;

        if (Number(balanceAfter.data.data.balance) !== expected) {
          throw new Error(
            `Expected balance ${expected}, got ${balanceAfter.data.data.balance}`
          );
        }

        // Reversing the same payment twice must be rejected.
        try {
          await axios.patch(
            `${API_URL}/payments/${paymentOnlyData.id}/cancel`,
            {},
            { headers: authHeaders() }
          );
          throw new Error("API reversed an already-reversed payment");
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(
              `Expected HTTP 409, got ${error.response?.status}`
            );
          }
        }
      }
    );

    /*
     * 33. REVERSAL REASON RECORDED (Phase 2: Cancellation + Audit)
     */
    await runTest("Payment reversal with reason is recorded", async () => {
      const createRes = await axios.post(
        `${API_URL}/payments`,
        {
          customer_id: testCustomerId,
          amount: 50,
          payment_method: "CASH",
          notes: "Payment for reason-capture test",
        },
        { headers: authHeaders() }
      );

      if (createRes.status !== 201) {
        throw new Error(`Expected 201, got ${createRes.status}`);
      }

      const paymentId = createRes.data.data.id;

      const cancelRes = await axios.patch(
        `${API_URL}/payments/${paymentId}/cancel`,
        { reason: "Duplicate payment entered by mistake" },
        { headers: authHeaders() }
      );

      if (cancelRes.status !== 200) {
        throw new Error(`Expected 200, got ${cancelRes.status}`);
      }

      const reversalEntry = await prisma.ledger_entries.findFirst({
        where: {
          payment_id: BigInt(paymentId),
          entry_type: "ADJUSTMENT",
        },
      });

      if (
        !reversalEntry?.description?.includes(
          "Duplicate payment entered by mistake"
        )
      ) {
        throw new Error(
          `Expected ledger reversal description to include reason, got "${reversalEntry?.description}"`
        );
      }

      const auditLog = await prisma.audit_logs.findFirst({
        where: {
          entity_type: "payment",
          entity_id: BigInt(paymentId),
          action: "CANCEL",
        },
        orderBy: { id: "desc" },
      });

      const newData = auditLog?.new_data as any;
      if (
        newData?.cancellation_reason !==
        "Duplicate payment entered by mistake"
      ) {
        throw new Error(
          `Expected cancellation_reason recorded, got ${JSON.stringify(
            newData?.cancellation_reason
          )}`
        );
      }
    });
  } finally {
    /*
     * CLEANUP TEST FIXTURES
     */
    try {
      for (const billId of createdBillIds) {
        await prisma.payment_allocations.deleteMany({
          where: { bill_id: billId },
        });
        await prisma.ledger_entries.deleteMany({
          where: { bill_id: billId },
        });
        await prisma.audit_logs.deleteMany({
          where: { entity_type: "bill", entity_id: billId },
        });
        await prisma.bill_items.deleteMany({
          where: { bill_id: billId },
        });
        await prisma.bills.deleteMany({ where: { id: billId } });
      }

      for (const customerId of createdCustomerIds) {
        const payments = await prisma.payments.findMany({
          where: { customer_id: customerId },
        });
        for (const payment of payments) {
          await prisma.audit_logs.deleteMany({
            where: { entity_type: "payment", entity_id: payment.id },
          });
        }
        await prisma.payment_allocations.deleteMany({
          where: { payment_id: { in: payments.map((p) => p.id) } },
        });
        await prisma.ledger_entries.deleteMany({
          where: { customer_id: customerId },
        });
        await prisma.payments.deleteMany({
          where: { customer_id: customerId },
        });
        await prisma.customers.deleteMany({
          where: { id: customerId },
        });
      }

      for (const itemId of createdItemIds) {
        await prisma.item_units.deleteMany({
          where: { item_id: itemId },
        });
        await prisma.items.deleteMany({ where: { id: itemId } });
      }

      if (testCategoryId) {
        await prisma.categories.deleteMany({ where: { id: BigInt(testCategoryId) } });
      }

      // Second business teardown.
      if (bill2Id) {
        await prisma.payment_allocations.deleteMany({
          where: { bill_id: bill2Id },
        });
        await prisma.ledger_entries.deleteMany({
          where: { bill_id: bill2Id },
        });
        await prisma.audit_logs.deleteMany({
          where: { entity_type: "bill", entity_id: bill2Id },
        });
        await prisma.bill_items.deleteMany({
          where: { bill_id: bill2Id },
        });
        await prisma.bills.deleteMany({ where: { id: bill2Id } });
      }

      if (customer2Id) {
        await prisma.payments.deleteMany({
          where: { customer_id: customer2Id },
        });
        await prisma.ledger_entries.deleteMany({
          where: { customer_id: customer2Id },
        });
        await prisma.customers.deleteMany({
          where: { id: customer2Id },
        });
      }

      if (business2Id) {
        const business2Items = await prisma.items.findMany({
          where: { business_id: business2Id },
        });
        await prisma.item_units.deleteMany({
          where: {
            item_id: { in: business2Items.map((i) => i.id) },
          },
        });
        await prisma.items.deleteMany({
          where: { business_id: business2Id },
        });
        await prisma.categories.deleteMany({
          where: { business_id: business2Id },
        });
        await prisma.audit_logs.deleteMany({
          where: { business_id: business2Id },
        });
        if (user2Id) {
          await prisma.users.deleteMany({ where: { id: user2Id } });
        }
        await prisma.businesses.deleteMany({
          where: { id: business2Id },
        });
      }
    } catch (cleanupErr) {
      console.error("Cleanup warning:", cleanupErr);
    }
  }

  /*
   * TEST REPORT
   */
  console.log("\n========================================");
  console.log(" TEST REPORT");
  console.log("========================================\n");

  for (const result of results) {
    const icon = result.status === "PASS" ? "✓" : "✗";
    console.log(`${icon} ${result.status} - ${result.test}`);
    if (result.details) {
      console.log(`  ${result.details}`);
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log("\n========================================");
  console.log(`TOTAL  : ${results.length}`);
  console.log(`PASSED : ${passed}`);
  console.log(`FAILED : ${failed}`);
  console.log("========================================\n");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runPaymentsTests();
