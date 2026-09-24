import axios from "axios";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let testCustomerId: string | null = null;
let testCategoryId: string | null = null;
let testItemId: string | null = null;
let testItemUnitId: string | null = null;

let bill1Id: string | null = null;
let bill2Id: string | null = null;

let business2Id: bigint | null = null;
let user2Id: bigint | null = null;

const createdBillIds: bigint[] = [];
const createdCustomerIds: bigint[] = [];
const createdItemIds: bigint[] = [];

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

async function runLedgerTests() {
  console.log("\n========================================");
  console.log(" LEDGER API AUTOMATED TESTS");
  console.log("========================================\n");

  let ledgerEntries: any[] = [];

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
     * 2. CREATE CUSTOMER + ITEM FIXTURES
     */
    await runTest("Create customer and item fixtures", async () => {
      const custCode = `LEDGER-CUST-${Date.now()}`;
      const custRes = await axios.post(
        `${API_URL}/customers`,
        {
          customer_code: custCode,
          english_name: "Ledger Test Customer",
          phone: "9111111111",
        },
        { headers: authHeaders() }
      );

      testCustomerId = custRes.data.data.id;
      if (testCustomerId) {
        createdCustomerIds.push(BigInt(testCustomerId));
      }

      const catRes = await axios.post(
        `${API_URL}/categories`,
        { name: `Ledger Test Category ${Date.now()}` },
        { headers: authHeaders() }
      );

      if (catRes.status !== 201 || !catRes.data?.data?.id) {
        throw new Error("Failed to create a category fixture for item fixture");
      }
      testCategoryId = catRes.data.data.id;

      const itemRes = await axios.post(
        `${API_URL}/items`,
        {
          item_code: `LEDGER-ITEM-${Date.now()}`,
          english_name: `Ledger Item ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );

      testItemId = itemRes.data.data.id;
      if (testItemId) {
        createdItemIds.push(BigInt(testItemId));
      }

      const unitRes = await axios.post(
        `${API_URL}/items/${testItemId}/units`,
        { unit: "PCS", standard_price: 100, is_default: true },
        { headers: authHeaders() }
      );

      testItemUnitId = unitRes.data.data.id;
    });

    /*
     * 3. BILL WITH INITIAL PAYMENT (SALE + PAYMENT entries)
     */
    await runTest(
      "Create bill with initial payment (bill payment appears in ledger)",
      async () => {
        const response = await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "CUSTOMER",
            customer_id: testCustomerId,
            amount_paid: 300,
            items: [
              {
                item_id: testItemId,
                item_unit_id: testItemUnitId,
                quantity: 10,
                actual_rate: 100,
              },
            ],
          },
          { headers: authHeaders() }
        );

        if (response.status !== 201) {
          throw new Error(`Expected 201, got ${response.status}`);
        }

        bill1Id = response.data.data.id;
        createdBillIds.push(BigInt(bill1Id!));

        if (!moneyEquals(response.data.data.grand_total, 1000)) {
          throw new Error(
            `Expected grand_total 1000, got ${response.data.data.grand_total}`
          );
        }
        // Balance after: SALE 1000 (bal 1000), PAYMENT 300 (bal 700).
      }
    );

    /*
     * 4. SECOND BILL, UNPAID
     */
    await runTest("Create second bill, unpaid", async () => {
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
              quantity: 5,
              actual_rate: 100,
            },
          ],
        },
        { headers: authHeaders() }
      );

      bill2Id = response.data.data.id;
      createdBillIds.push(BigInt(bill2Id!));

      if (!moneyEquals(response.data.data.grand_total, 500)) {
        throw new Error(
          `Expected grand_total 500, got ${response.data.data.grand_total}`
        );
      }
      // Balance after: SALE 500 (bal 1200).
    });

    /*
     * 5. PAYMENT-ONLY TRANSACTION
     */
    await runTest(
      "Payment-only transaction (payment-only entry appears in ledger)",
      async () => {
        const response = await axios.post(
          `${API_URL}/payments`,
          {
            customer_id: testCustomerId,
            amount: 200,
            payment_method: "CASH",
          },
          { headers: authHeaders() }
        );

        if (response.status !== 201) {
          throw new Error(`Expected 201, got ${response.status}`);
        }
        // Balance after: PAYMENT 200 (bal 1000).
      }
    );

    /*
     * 6. CUSTOMER LEDGER RETRIEVAL
     */
    await runTest("Customer ledger retrieval", async () => {
      // The API is newest-first by default; these assertions walk the
      // running balance chronologically, so ask for oldest-first.
      const response = await axios.get(
        `${API_URL}/ledger/customer/${testCustomerId}?order=asc`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || !response.data.success) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      ledgerEntries = response.data.data;

      if (ledgerEntries.length !== 4) {
        throw new Error(
          `Expected 4 ledger entries, got ${ledgerEntries.length}`
        );
      }
    });

    /*
     * 7. SALE ENTRY EXISTS
     */
    await runTest("SALE entry exists", async () => {
      const saleEntries = ledgerEntries.filter(
        (e) => e.entry_type === "SALE"
      );
      if (saleEntries.length !== 2) {
        throw new Error(
          `Expected 2 SALE entries, got ${saleEntries.length}`
        );
      }
    });

    /*
     * 8. PAYMENT ENTRY EXISTS
     */
    await runTest("PAYMENT entry exists", async () => {
      const paymentEntries = ledgerEntries.filter(
        (e) => e.entry_type === "PAYMENT"
      );
      if (paymentEntries.length !== 2) {
        throw new Error(
          `Expected 2 PAYMENT entries, got ${paymentEntries.length}`
        );
      }
    });

    /*
     * 9. DEBIT IS CORRECT
     */
    await runTest("Debit is correct", async () => {
      const firstSale = ledgerEntries.find(
        (e) => e.entry_type === "SALE" && e.bill_id === bill1Id
      );
      if (!firstSale || !moneyEquals(firstSale.debit, 1000)) {
        throw new Error(
          `Expected debit 1000 on first SALE, got ${firstSale?.debit}`
        );
      }
    });

    /*
     * 10. CREDIT IS CORRECT
     */
    await runTest("Credit is correct", async () => {
      const firstPayment = ledgerEntries.find(
        (e) => e.entry_type === "PAYMENT" && e.bill_id === bill1Id
      );
      if (!firstPayment || !moneyEquals(firstPayment.credit, 300)) {
        throw new Error(
          `Expected credit 300 on first PAYMENT, got ${firstPayment?.credit}`
        );
      }
    });

    /*
     * 11. BALANCE_AFTER IS CORRECT
     */
    await runTest("balance_after is correct", async () => {
      const expectedRunningBalances = [1000, 700, 1200, 1000];

      for (let i = 0; i < ledgerEntries.length; i++) {
        if (
          !moneyEquals(
            ledgerEntries[i].balance_after,
            expectedRunningBalances[i]
          )
        ) {
          throw new Error(
            `Entry ${i}: expected balance_after ${expectedRunningBalances[i]}, got ${ledgerEntries[i].balance_after}`
          );
        }
      }
    });

    /*
     * 12. CHRONOLOGICAL ORDERING
     */
    await runTest("Ledger chronological ordering", async () => {
      for (let i = 1; i < ledgerEntries.length; i++) {
        const prevTime = new Date(
          ledgerEntries[i - 1].transaction_at
        ).getTime();
        const currTime = new Date(
          ledgerEntries[i].transaction_at
        ).getTime();

        if (currTime < prevTime) {
          throw new Error(
            `Entry ${i} is out of chronological order`
          );
        }
      }

      const expectedTypes = ["SALE", "PAYMENT", "SALE", "PAYMENT"];
      const actualTypes = ledgerEntries.map((e) => e.entry_type);
      if (JSON.stringify(actualTypes) !== JSON.stringify(expectedTypes)) {
        throw new Error(
          `Expected order ${expectedTypes}, got ${actualTypes}`
        );
      }
    });

    /*
     * 13. CUSTOMER BALANCE
     */
    await runTest("Customer balance", async () => {
      const response = await axios.get(
        `${API_URL}/ledger/customer/${testCustomerId}/balance`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || !response.data.success) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (!moneyEquals(response.data.data.balance, 1000)) {
        throw new Error(
          `Expected balance 1000, got ${response.data.data.balance}`
        );
      }
    });

    /*
     * 14. DATE FILTERING
     */
    await runTest("Date filtering", async () => {
      const today = new Date().toISOString().slice(0, 10);

      const inRange = await axios.get(
        `${API_URL}/ledger/customer/${testCustomerId}?start_date=${today}&end_date=${today}`,
        { headers: authHeaders() }
      );

      if (inRange.data.count !== 4) {
        throw new Error(
          `Expected 4 entries today, got ${inRange.data.count}`
        );
      }

      const outOfRange = await axios.get(
        `${API_URL}/ledger/customer/${testCustomerId}?start_date=2000-01-01&end_date=2000-01-31`,
        { headers: authHeaders() }
      );

      if (outOfRange.data.count !== 0) {
        throw new Error(
          `Expected 0 entries for year 2000, got ${outOfRange.data.count}`
        );
      }
    });

    /*
     * 15. ENTRY TYPE FILTERING
     */
    await runTest("Entry type filtering", async () => {
      const saleOnly = await axios.get(
        `${API_URL}/ledger/customer/${testCustomerId}?entry_type=SALE`,
        { headers: authHeaders() }
      );

      if (
        saleOnly.data.count !== 2 ||
        saleOnly.data.data.some((e: any) => e.entry_type !== "SALE")
      ) {
        throw new Error("SALE entry_type filter returned wrong data");
      }

      const paymentOnly = await axios.get(
        `${API_URL}/ledger/customer/${testCustomerId}?entry_type=PAYMENT`,
        { headers: authHeaders() }
      );

      if (
        paymentOnly.data.count !== 2 ||
        paymentOnly.data.data.some(
          (e: any) => e.entry_type !== "PAYMENT"
        )
      ) {
        throw new Error(
          "PAYMENT entry_type filter returned wrong data"
        );
      }
    });

    /*
     * 16. BIGINT SERIALIZATION
     */
    await runTest("BigInt serialization", async () => {
      for (const entry of ledgerEntries) {
        if (typeof entry.id !== "string") {
          throw new Error(`Entry id should be a string, got ${typeof entry.id}`);
        }
        if (typeof entry.customer_id !== "string") {
          throw new Error(
            `customer_id should be a string, got ${typeof entry.customer_id}`
          );
        }
        if (entry.bill_id !== null && typeof entry.bill_id !== "string") {
          throw new Error(
            `bill_id should be a string or null, got ${typeof entry.bill_id}`
          );
        }
        if (
          entry.payment_id !== null &&
          typeof entry.payment_id !== "string"
        ) {
          throw new Error(
            `payment_id should be a string or null, got ${typeof entry.payment_id}`
          );
        }
      }
    });

    /*
     * 17. DECIMAL SERIALIZATION
     */
    await runTest("Decimal serialization", async () => {
      for (const entry of ledgerEntries) {
        if (typeof entry.debit !== "string") {
          throw new Error(
            `debit should be a string, got ${typeof entry.debit}`
          );
        }
        if (typeof entry.credit !== "string") {
          throw new Error(
            `credit should be a string, got ${typeof entry.credit}`
          );
        }
        if (typeof entry.balance_after !== "string") {
          throw new Error(
            `balance_after should be a string, got ${typeof entry.balance_after}`
          );
        }
        if (
          Number.isNaN(Number(entry.debit)) ||
          Number.isNaN(Number(entry.credit)) ||
          Number.isNaN(Number(entry.balance_after))
        ) {
          throw new Error("Decimal fields did not serialize to valid numeric strings");
        }
      }
    });

    /*
     * 18. AUTHENTICATION REQUIRED
     */
    await runTest(
      "Reject unauthenticated access on all ledger endpoints",
      async () => {
        const calls = [
          () => axios.get(`${API_URL}/ledger/customer/${testCustomerId}`),
          () =>
            axios.get(
              `${API_URL}/ledger/customer/${testCustomerId}/balance`
            ),
          () =>
            axios.get(`${API_URL}/ledger/customer/${testCustomerId}`, {
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
     * 19. CROSS-BUSINESS LEDGER ACCESS REJECTED
     */
    await runTest("Cross-business ledger access rejected", async () => {
      const business2 = await prisma.businesses.create({
        data: {
          name: `Ledger Test Business 2 ${Date.now()}`,
          is_active: true,
        },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `ledger_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Ledger Test Admin 2",
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

      try {
        await axios.get(
          `${API_URL}/ledger/customer/${testCustomerId}`,
          { headers: authHeaders(token2) }
        );
        throw new Error(
          "Business 2 token accessed Business 1 customer ledger"
        );
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(
            `Expected HTTP 404, got ${error.response?.status}`
          );
        }
      }

      try {
        await axios.get(
          `${API_URL}/ledger/customer/${testCustomerId}/balance`,
          { headers: authHeaders(token2) }
        );
        throw new Error(
          "Business 2 token accessed Business 1 customer balance"
        );
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(
            `Expected HTTP 404, got ${error.response?.status}`
          );
        }
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
        await prisma.stock_movements.deleteMany({ where: { bill_id: billId } });
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
        await prisma.stock_movements.deleteMany({ where: { item_id: itemId } });
        await prisma.item_units.deleteMany({
          where: { item_id: itemId },
        });
        await prisma.items.deleteMany({ where: { id: itemId } });
      }

      if (testCategoryId) {
        await prisma.categories.deleteMany({ where: { id: BigInt(testCategoryId) } });
      }

      if (business2Id) {
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

runLedgerTests();
