import axios from "axios";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let testCustomerId: string | null = null;
let testItemId: string | null = null;
let testItemUnitId: string | null = null;
let testCategoryId: string | null = null;
let testBillId: string | null = null;
let testPaymentId: string | null = null;

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

function isValidXlsx(buffer: Buffer): boolean {
  return (
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b
  );
}

async function runReportsTests() {
  console.log("\n========================================");
  console.log(" REPORTS API AUTOMATED TESTS");
  console.log("========================================\n");

  try {
    await runTest("Login", async () => {
      const response = await axios.post(`${API_URL}/auth/login`, {
        username: "admin",
        password: "ChangeMe@123",
      });
      token = response.data.data?.token;
      if (!token) throw new Error("JWT token was not returned");
    });

    await runTest("Create fixtures (customer, item, bill, payment)", async () => {
      const custRes = await axios.post(
        `${API_URL}/customers`,
        {
          customer_code: `RPT-CUST-${Date.now()}`,
          english_name: "Reports Test Customer",
          phone: "9222222222",
        },
        { headers: authHeaders() }
      );
      testCustomerId = custRes.data.data.id;
      createdCustomerIds.push(BigInt(testCustomerId!));

      const catRes = await axios.post(
        `${API_URL}/categories`,
        { name: `Reports Test Category ${Date.now()}` },
        { headers: authHeaders() }
      );
      testCategoryId = catRes.data?.data?.id ?? null;
      if (!testCategoryId) throw new Error("Failed to create a category fixture");

      const itemRes = await axios.post(
        `${API_URL}/items`,
        {
          item_code: `RPT-ITEM-${Date.now()}`,
          english_name: `Reports Item ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );
      testItemId = itemRes.data.data.id;
      createdItemIds.push(BigInt(testItemId!));

      const unitRes = await axios.post(
        `${API_URL}/items/${testItemId}/units`,
        { unit: "PCS", standard_price: 200, is_default: true },
        { headers: authHeaders() }
      );
      testItemUnitId = unitRes.data.data.id;

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
              actual_rate: 200,
            },
          ],
        },
        { headers: authHeaders() }
      );
      testBillId = billRes.data.data.id;
      createdBillIds.push(BigInt(testBillId!));
      // grand_total = 600

      const paymentRes = await axios.post(
        `${API_URL}/payments`,
        {
          customer_id: testCustomerId,
          amount: 250,
          payment_method: "UPI",
        },
        { headers: authHeaders() }
      );
      testPaymentId = paymentRes.data.data.id;
      // Customer balance now 350
    });

    await runTest("Dashboard returns expected shape", async () => {
      const res = await axios.get(`${API_URL}/reports/dashboard`, {
        headers: authHeaders(),
      });

      if (res.status !== 200 || !res.data.success) {
        throw new Error(`Expected 200, got ${res.status}`);
      }

      const d = res.data.data;
      const requiredFields = [
        "today",
        "outstanding_total",
        "customers_count",
        "items_count",
        "recent_bills",
        "recent_payments",
      ];
      for (const field of requiredFields) {
        if (!(field in d)) {
          throw new Error(`Dashboard missing field: ${field}`);
        }
      }

      if (d.today.bills_count < 1 || d.today.payments_count < 1) {
        throw new Error(
          "Dashboard did not reflect today's bill/payment"
        );
      }
    });

    await runTest("Sales report (today) reflects created bill", async () => {
      const res = await axios.get(
        `${API_URL}/reports/sales?range=today`,
        { headers: authHeaders() }
      );

      if (Number(res.data.data.summary.total_sales) < 600) {
        throw new Error(
          `Expected total_sales >= 600, got ${res.data.data.summary.total_sales}`
        );
      }
      if (!Array.isArray(res.data.data.daily)) {
        throw new Error("Expected daily breakdown array");
      }
    });

    await runTest("Sales report (all time) reflects created bill", async () => {
      const res = await axios.get(
        `${API_URL}/reports/sales?range=all`,
        { headers: authHeaders() }
      );

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`);
      }
      // range=all must be at least as inclusive as range=today.
      if (Number(res.data.data.summary.total_sales) < 600) {
        throw new Error(
          `Expected all-time total_sales >= 600, got ${res.data.data.summary.total_sales}`
        );
      }
    });

    await runTest("Dashboard accepts range=all", async () => {
      const res = await axios.get(
        `${API_URL}/reports/dashboard?range=all`,
        { headers: authHeaders() }
      );

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`);
      }
    });

    await runTest("Sales report (custom range)", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await axios.get(
        `${API_URL}/reports/sales?range=custom&start_date=${today}&end_date=${today}`,
        { headers: authHeaders() }
      );

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`);
      }
    });

    await runTest(
      "Reject custom range without start/end dates",
      async () => {
        try {
          await axios.get(`${API_URL}/reports/sales?range=custom`, {
            headers: authHeaders(),
          });
          throw new Error("API accepted range=custom without dates");
        } catch (error: any) {
          if (error.response?.status !== 400) {
            throw new Error(
              `Expected HTTP 400, got ${error.response?.status}`
            );
          }
        }
      }
    );

    await runTest(
      "Payments report reflects created payment",
      async () => {
        const res = await axios.get(
          `${API_URL}/reports/payments?range=today`,
          { headers: authHeaders() }
        );

        if (Number(res.data.data.summary.total_amount) < 250) {
          throw new Error(
            `Expected total_amount >= 250, got ${res.data.data.summary.total_amount}`
          );
        }

        const upi = res.data.data.by_method.find(
          (m: any) => m.payment_method === "UPI"
        );
        if (!upi || Number(upi.total_amount) < 250) {
          throw new Error("UPI breakdown missing or incorrect");
        }
      }
    );

    await runTest(
      "Outstanding report reflects customer balance",
      async () => {
        const res = await axios.get(
          `${API_URL}/reports/customers/outstanding`,
          { headers: authHeaders() }
        );

        const row = res.data.data.find(
          (c: any) => c.customer_id === testCustomerId
        );
        if (!row) {
          throw new Error(
            "Outstanding report did not include test customer"
          );
        }
        if (Number(row.outstanding_balance) !== 350) {
          throw new Error(
            `Expected outstanding 350, got ${row.outstanding_balance}`
          );
        }
      }
    );

    await runTest(
      "Item sales report reflects quantity and revenue",
      async () => {
        const res = await axios.get(
          `${API_URL}/reports/items?range=today`,
          { headers: authHeaders() }
        );

        const row = res.data.data.items.find(
          (i: any) => i.item_id === testItemId
        );
        if (!row) {
          throw new Error(
            "Item sales report did not include test item"
          );
        }
        if (Number(row.total_quantity) !== 3) {
          throw new Error(
            `Expected quantity 3, got ${row.total_quantity}`
          );
        }
        if (Number(row.total_sales) !== 600) {
          throw new Error(
            `Expected revenue 600, got ${row.total_sales}`
          );
        }
      }
    );

    await runTest("Sales report XLSX export is a valid file", async () => {
      const res = await axios.get(
        `${API_URL}/reports/sales/export?range=today`,
        { headers: authHeaders(), responseType: "arraybuffer" }
      );

      if (
        res.headers["content-type"] !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        throw new Error(
          `Unexpected content-type: ${res.headers["content-type"]}`
        );
      }
      if (!isValidXlsx(Buffer.from(res.data))) {
        throw new Error("Response is not a valid xlsx file");
      }
    });

    await runTest(
      "Payments report XLSX export is a valid file",
      async () => {
        const res = await axios.get(
          `${API_URL}/reports/payments/export?range=today`,
          { headers: authHeaders(), responseType: "arraybuffer" }
        );
        if (!isValidXlsx(Buffer.from(res.data))) {
          throw new Error("Response is not a valid xlsx file");
        }
      }
    );

    await runTest(
      "Outstanding report XLSX export is a valid file",
      async () => {
        const res = await axios.get(
          `${API_URL}/reports/customers/outstanding/export`,
          { headers: authHeaders(), responseType: "arraybuffer" }
        );
        if (!isValidXlsx(Buffer.from(res.data))) {
          throw new Error("Response is not a valid xlsx file");
        }
      }
    );

    await runTest("Item sales XLSX export is a valid file", async () => {
      const res = await axios.get(
        `${API_URL}/reports/items/export?range=today`,
        { headers: authHeaders(), responseType: "arraybuffer" }
      );
      if (!isValidXlsx(Buffer.from(res.data))) {
        throw new Error("Response is not a valid xlsx file");
      }
    });

    await runTest("Customer ledger XLSX export is a valid file", async () => {
      const res = await axios.get(
        `${API_URL}/ledger/customer/${testCustomerId}/export`,
        { headers: authHeaders(), responseType: "arraybuffer" }
      );
      if (!isValidXlsx(Buffer.from(res.data))) {
        throw new Error("Response is not a valid xlsx file");
      }
    });

    await runTest(
      "Reject unauthenticated access on report endpoints",
      async () => {
        const calls = [
          () => axios.get(`${API_URL}/reports/dashboard`),
          () => axios.get(`${API_URL}/reports/sales`),
          () => axios.get(`${API_URL}/reports/customers/outstanding`),
        ];

        for (const call of calls) {
          try {
            await call();
            throw new Error("Unauthenticated request was accepted");
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

    await runTest("Cross-business report isolation", async () => {
      const business2 = await prisma.businesses.create({
        data: {
          name: `Reports Test Business 2 ${Date.now()}`,
          is_active: true,
        },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `reports_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Reports Test Admin 2",
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

      const dashboard = await axios.get(
        `${API_URL}/reports/dashboard`,
        { headers: authHeaders(token2) }
      );
      if (
        dashboard.data.data.today.bills_count !== 0 ||
        dashboard.data.data.customers_count !== 0
      ) {
        throw new Error(
          "Business 2 dashboard leaked Business 1 data"
        );
      }

      const outstanding = await axios.get(
        `${API_URL}/reports/customers/outstanding`,
        { headers: authHeaders(token2) }
      );
      if (
        outstanding.data.data.some(
          (c: any) => c.customer_id === testCustomerId
        )
      ) {
        throw new Error(
          "Business 2 outstanding report leaked Business 1 customer"
        );
      }

      try {
        await axios.get(
          `${API_URL}/ledger/customer/${testCustomerId}/export`,
          { headers: authHeaders(token2) }
        );
        throw new Error(
          "Business 2 token exported Business 1 customer ledger"
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
    try {
      for (const billId of createdBillIds) {
        await prisma.bill_deliveries.deleteMany({
          where: { bill_id: billId },
        });
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

      if (business2Id) {
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

  console.log("\n========================================");
  console.log(" TEST REPORT");
  console.log("========================================\n");

  for (const result of results) {
    const icon = result.status === "PASS" ? "✓" : "✗";
    console.log(`${icon} ${result.status} - ${result.test}`);
    if (result.details) console.log(`  ${result.details}`);
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log("\n========================================");
  console.log(`TOTAL  : ${results.length}`);
  console.log(`PASSED : ${passed}`);
  console.log(`FAILED : ${failed}`);
  console.log("========================================\n");

  if (failed > 0) process.exitCode = 1;
}

runReportsTests();
