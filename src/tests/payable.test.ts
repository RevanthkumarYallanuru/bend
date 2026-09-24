import axios from "axios";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let business2Id: bigint | null = null;
let user2Id: bigint | null = null;

let testSupplierId: string | null = null;
let manualDateSupplierId: string | null = null;
const createdSupplierIds: bigint[] = [];
const createdPayableIds: bigint[] = [];

const results: {
  test: string;
  status: "PASS" | "FAIL";
  details?: string;
}[] = [];

function pass(name: string) {
  results.push({ test: name, status: "PASS" });
}

function fail(name: string, error: unknown) {
  results.push({
    test: name,
    status: "FAIL",
    details: error instanceof Error ? error.message : String(error),
  });
}

async function runTest(name: string, testFunction: () => Promise<void>) {
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

async function runPayableTests() {
  console.log("\n========================================");
  console.log(" MY PAYS (PAYABLES) API AUTOMATED TESTS");
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

    await runTest("Create supplier fixture", async () => {
      const res = await axios.post(
        `${API_URL}/suppliers`,
        { name: `Ramesh Traders ${Date.now()}` },
        { headers: authHeaders() }
      );
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      testSupplierId = res.data.data.id;
      createdSupplierIds.push(BigInt(testSupplierId!));
    });

    await runTest("Create second supplier fixture", async () => {
      const res = await axios.post(
        `${API_URL}/suppliers`,
        { name: `Manual Date Vendor ${Date.now()}` },
        { headers: authHeaders() }
      );
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      manualDateSupplierId = res.data.data.id;
      createdSupplierIds.push(BigInt(manualDateSupplierId!));
    });

    let testPayableId: string | null = null;
    let baselineInsights: {
      count: number;
      total_amount: string;
      total_paid: string;
      total_remaining: string;
    } | null = null;

    await runTest("Capture baseline insights (today)", async () => {
      const res = await axios.get(`${API_URL}/payables/insights`, {
        params: { range: "today" },
        headers: authHeaders(),
      });

      if (res.status !== 200) {
        throw new Error(`Expected 200, got ${res.status}`);
      }
      baselineInsights = res.data.data;
    });

    await runTest("Create payable linked to a supplier", async () => {
      const res = await axios.post(
        `${API_URL}/payables`,
        {
          supplier_id: testSupplierId,
          total_amount: 15000,
          reason:
            "Purchased 20 bags of ragi, 10 bags of jowar and transportation charges from Kandukur market.",
        },
        { headers: authHeaders() }
      );

      if (res.status !== 201) {
        throw new Error(`Expected 201, got ${res.status}`);
      }

      const payable = res.data.data;
      testPayableId = payable.id;
      createdPayableIds.push(BigInt(payable.id));

      if (payable.supplier_id !== testSupplierId) {
        throw new Error(
          `Expected supplier_id ${testSupplierId}, got ${payable.supplier_id}`
        );
      }
      if (!payable.suppliers || payable.suppliers.id !== testSupplierId) {
        throw new Error("Expected the linked supplier to be included in the response");
      }
      if (payable.status !== "PENDING") {
        throw new Error(`Expected status PENDING, got ${payable.status}`);
      }
      if (Number(payable.amount_paid) !== 0) {
        throw new Error(`Expected amount_paid 0, got ${payable.amount_paid}`);
      }
      if (Number(payable.total_amount) !== 15000) {
        throw new Error(`Expected total_amount 15000, got ${payable.total_amount}`);
      }
      if (payable.paid_at !== null) {
        throw new Error("Expected paid_at to be null on creation");
      }
      const today = new Date().toISOString().slice(0, 10);
      if (
        typeof payable.payable_date !== "string" ||
        !payable.payable_date.startsWith(today)
      ) {
        throw new Error(
          `Expected payable_date to default to today (${today}), got ${payable.payable_date}`
        );
      }
    });

    let manualDatePayableId: string | null = null;

    await runTest(
      "Create payable with a manually selected past date stores that date",
      async () => {
        const res = await axios.post(
          `${API_URL}/payables`,
          {
            supplier_id: manualDateSupplierId,
            total_amount: 500,
            reason: "Diesel for delivery vehicle",
            payable_date: "2026-01-15",
          },
          { headers: authHeaders() }
        );

        if (res.status !== 201) {
          throw new Error(`Expected 201, got ${res.status}`);
        }

        const payable = res.data.data;
        manualDatePayableId = payable.id;
        createdPayableIds.push(BigInt(payable.id));

        if (
          typeof payable.payable_date !== "string" ||
          !payable.payable_date.startsWith("2026-01-15")
        ) {
          throw new Error(
            `Expected payable_date 2026-01-15, got ${payable.payable_date}`
          );
        }
      }
    );

    await runTest("Manually selected date persists on a fresh read", async () => {
      const res = await axios.get(
        `${API_URL}/payables/${manualDatePayableId}`,
        { headers: authHeaders() }
      );

      if (!res.data.data.payable_date.startsWith("2026-01-15")) {
        throw new Error(
          `Expected persisted payable_date 2026-01-15, got ${res.data.data.payable_date}`
        );
      }
    });

    await runTest("Reject payable with invalid date format", async () => {
      try {
        await axios.post(
          `${API_URL}/payables`,
          {
            supplier_id: testSupplierId,
            total_amount: 100,
            reason: "Test",
            payable_date: "15-01-2026",
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted a malformed payable_date");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected 400, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Reject payable with missing supplier_id or reason", async () => {
      try {
        await axios.post(
          `${API_URL}/payables`,
          { total_amount: 100, reason: "" },
          { headers: authHeaders() }
        );
        throw new Error("API accepted a missing supplier_id/empty reason");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected 400, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Reject payable for a non-existent supplier", async () => {
      try {
        await axios.post(
          `${API_URL}/payables`,
          { supplier_id: "999999999", total_amount: 100, reason: "Test" },
          { headers: authHeaders() }
        );
        throw new Error("API accepted a non-existent supplier_id");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(
            `Expected 404, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Reject payable with non-positive amount", async () => {
      try {
        await axios.post(
          `${API_URL}/payables`,
          { supplier_id: testSupplierId, total_amount: 0, reason: "Test" },
          { headers: authHeaders() }
        );
        throw new Error("API accepted a zero amount");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected 400, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Get payable by ID", async () => {
      const res = await axios.get(`${API_URL}/payables/${testPayableId}`, {
        headers: authHeaders(),
      });

      if (res.status !== 200 || res.data.data.id !== testPayableId) {
        throw new Error("Failed to fetch the created payable");
      }
      if (!Array.isArray(res.data.data.payable_payments)) {
        throw new Error("Expected payable_payments array in response");
      }
    });

    await runTest("List payables includes the created one", async () => {
      const res = await axios.get(`${API_URL}/payables`, {
        headers: authHeaders(),
      });

      const found = (res.data.data as any[]).some(
        (p) => p.id === testPayableId
      );
      if (!found) throw new Error("Created payable not found in list");
    });

    await runTest("List filters by supplier_id", async () => {
      const res = await axios.get(`${API_URL}/payables`, {
        params: { supplier_id: testSupplierId },
        headers: authHeaders(),
      });

      const rows = res.data.data as any[];
      if (rows.length === 0) {
        throw new Error("Expected at least one payable for this supplier");
      }
      if (rows.some((p) => p.supplier_id !== testSupplierId)) {
        throw new Error("supplier_id filter leaked another supplier's payable");
      }
    });

    await runTest(
      "List is ordered by payable_date descending, not created_at",
      async () => {
        const res = await axios.get(`${API_URL}/payables`, {
          headers: authHeaders(),
        });

        const rows = res.data.data as any[];
        const todayIndex = rows.findIndex((p) => p.id === testPayableId);
        const pastIndex = rows.findIndex((p) => p.id === manualDatePayableId);

        if (todayIndex === -1 || pastIndex === -1) {
          throw new Error("Both test payables should be present in the list");
        }
        if (todayIndex >= pastIndex) {
          throw new Error(
            `Expected today-dated payable (index ${todayIndex}) before the 2026-01-15-dated one (index ${pastIndex})`
          );
        }
      }
    );

    await runTest(
      "Among payables sharing the same payable_date, the most recently created one sorts first",
      async () => {
        // Explicit matching (and non-"today") payable_date: the real
        // page always sends an explicit date, and payable_date is a
        // plain calendar day (midnight UTC) — two payables dated the
        // same day genuinely tie on it, which is exactly the scenario
        // being tested. Backdated so it can't also shift the "today"
        // insights count the next test depends on.
        const first = await axios.post(
          `${API_URL}/payables`,
          {
            supplier_id: testSupplierId,
            total_amount: 111,
            reason: `Same-date first ${Date.now()}`,
            payable_date: "2026-02-10",
          },
          { headers: authHeaders() }
        );
        createdPayableIds.push(BigInt(first.data.data.id));

        const second = await axios.post(
          `${API_URL}/payables`,
          {
            supplier_id: testSupplierId,
            total_amount: 222,
            reason: `Same-date second ${Date.now()}`,
            payable_date: "2026-02-10",
          },
          { headers: authHeaders() }
        );
        createdPayableIds.push(BigInt(second.data.data.id));

        if (first.data.data.payable_date !== second.data.data.payable_date) {
          throw new Error(
            "Test fixture assumption broken: the two payables don't share a payable_date"
          );
        }

        const res = await axios.get(`${API_URL}/payables`, {
          headers: authHeaders(),
        });
        const rows = res.data.data as any[];
        const secondIndex = rows.findIndex((p) => p.id === second.data.data.id);
        const firstIndex = rows.findIndex((p) => p.id === first.data.data.id);

        if (secondIndex === -1 || firstIndex === -1) {
          throw new Error("Both same-date payables should be present in the list");
        }
        if (secondIndex >= firstIndex) {
          throw new Error(
            `Expected the more recently created payable (index ${secondIndex}) before the earlier one (index ${firstIndex})`
          );
        }
      }
    );

    await runTest("List filters by range=today and range=all", async () => {
      const todayRes = await axios.get(`${API_URL}/payables`, {
        params: { range: "today" },
        headers: authHeaders(),
      });
      const allRes = await axios.get(`${API_URL}/payables`, {
        params: { range: "all" },
        headers: authHeaders(),
      });
      const unfilteredRes = await axios.get(`${API_URL}/payables`, {
        headers: authHeaders(),
      });

      const todayHasManualDatePayable = (todayRes.data.data as any[]).some(
        (p) => p.id === manualDatePayableId
      );
      if (todayHasManualDatePayable) {
        throw new Error("range=today leaked the 2026-01-15-dated payable");
      }

      const allHasManualDatePayable = (allRes.data.data as any[]).some(
        (p) => p.id === manualDatePayableId
      );
      if (!allHasManualDatePayable) {
        throw new Error("range=all excluded the 2026-01-15-dated payable");
      }

      if (unfilteredRes.data.count !== allRes.data.count) {
        throw new Error(
          `Expected omitting range and range=all to return the same count (${unfilteredRes.data.count} vs ${allRes.data.count})`
        );
      }
    });

    await runTest(
      "Record a partial payment — status becomes PARTIALLY_PAID",
      async () => {
        const res = await axios.post(
          `${API_URL}/payables/${testPayableId}/payments`,
          { amount: 5000, payment_date: "2026-09-20T00:00:00.000Z" },
          { headers: authHeaders() }
        );

        if (res.status !== 200) {
          throw new Error(`Expected 200, got ${res.status}`);
        }

        const payable = res.data.data;
        if (payable.status !== "PARTIALLY_PAID") {
          throw new Error(
            `Expected status PARTIALLY_PAID, got ${payable.status}`
          );
        }
        if (Number(payable.amount_paid) !== 5000) {
          throw new Error(`Expected amount_paid 5000, got ${payable.amount_paid}`);
        }
        const remaining =
          Number(payable.total_amount) - Number(payable.amount_paid);
        if (remaining !== 10000) {
          throw new Error(`Expected remaining 10000, got ${remaining}`);
        }
        if (payable.paid_at !== null) {
          throw new Error("paid_at should still be null after a partial payment");
        }
        if (payable.payable_payments.length !== 1) {
          throw new Error(
            `Expected 1 payment history row, got ${payable.payable_payments.length}`
          );
        }
      }
    );

    await runTest(
      "Reject a payment that exceeds the remaining balance",
      async () => {
        try {
          await axios.post(
            `${API_URL}/payables/${testPayableId}/payments`,
            { amount: 50000 },
            { headers: authHeaders() }
          );
          throw new Error("API accepted an overpayment");
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(
              `Expected 409, got ${error.response?.status ?? error.message}`
            );
          }
        }
      }
    );

    await runTest(
      "Record the remaining payment — status becomes PAID with paid_at set",
      async () => {
        const res = await axios.post(
          `${API_URL}/payables/${testPayableId}/payments`,
          { amount: 10000, payment_date: "2026-09-22T00:00:00.000Z" },
          { headers: authHeaders() }
        );

        const payable = res.data.data;
        if (payable.status !== "PAID") {
          throw new Error(`Expected status PAID, got ${payable.status}`);
        }
        if (Number(payable.amount_paid) !== 15000) {
          throw new Error(`Expected amount_paid 15000, got ${payable.amount_paid}`);
        }
        if (!payable.paid_at) {
          throw new Error("Expected paid_at to be set once fully paid");
        }
        if (payable.payable_payments.length !== 2) {
          throw new Error(
            `Expected 2 payment history rows, got ${payable.payable_payments.length}`
          );
        }
        const amounts = payable.payable_payments.map((p: any) => Number(p.amount));
        if (amounts[0] !== 5000 || amounts[1] !== 10000) {
          throw new Error(
            `Expected payment history [5000, 10000] in date order, got ${JSON.stringify(amounts)}`
          );
        }
      }
    );

    await runTest("Reject further payments once fully paid", async () => {
      try {
        await axios.post(
          `${API_URL}/payables/${testPayableId}/payments`,
          { amount: 1 },
          { headers: authHeaders() }
        );
        throw new Error("API accepted a payment on an already-paid payable");
      } catch (error: any) {
        if (error.response?.status !== 409) {
          throw new Error(
            `Expected 409, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Data persists on a fresh read", async () => {
      const res = await axios.get(`${API_URL}/payables/${testPayableId}`, {
        headers: authHeaders(),
      });

      if (res.data.data.status !== "PAID") {
        throw new Error("Persisted status is not PAID on re-fetch");
      }
    });

    await runTest(
      "Insights (today) reflect the fully paid test payable",
      async () => {
        const res = await axios.get(`${API_URL}/payables/insights`, {
          params: { range: "today" },
          headers: authHeaders(),
        });

        if (res.status !== 200) {
          throw new Error(`Expected 200, got ${res.status}`);
        }
        const insights = res.data.data;
        if (!baselineInsights) {
          throw new Error("Baseline insights were not captured");
        }

        const countDelta = insights.count - baselineInsights.count;
        const amountDelta =
          Number(insights.total_amount) - Number(baselineInsights.total_amount);
        const paidDelta =
          Number(insights.total_paid) - Number(baselineInsights.total_paid);
        const remainingDelta =
          Number(insights.total_remaining) -
          Number(baselineInsights.total_remaining);

        if (countDelta !== 1) {
          throw new Error(`Expected count to increase by 1, got ${countDelta}`);
        }
        if (amountDelta !== 15000) {
          throw new Error(`Expected total_amount to increase by 15000, got ${amountDelta}`);
        }
        if (paidDelta !== 15000) {
          throw new Error(`Expected total_paid to increase by 15000, got ${paidDelta}`);
        }
        if (remainingDelta !== 0) {
          throw new Error(`Expected total_remaining delta 0, got ${remainingDelta}`);
        }
        if (insights.by_status.PAID < 1) {
          throw new Error("Expected by_status.PAID to include the test payable");
        }
      }
    );

    await runTest(
      "Insights (all) reaches back further than today — includes the 2026-01-15-dated payable",
      async () => {
        const res = await axios.get(`${API_URL}/payables/insights`, {
          params: { range: "all" },
          headers: authHeaders(),
        });

        if (res.status !== 200) {
          throw new Error(`Expected 200, got ${res.status}`);
        }
        const insights = res.data.data;

        // The manually-dated payable (500, PENDING, dated 2026-01-15)
        // falls outside "today"/"week"/"month" but must be included
        // here — this is what actually distinguishes "all" from a
        // large-but-bounded range rather than just accepting the enum
        // value.
        if (Number(insights.total_amount) < 15500) {
          throw new Error(
            `Expected total_amount to include both test payables (>= 15500), got ${insights.total_amount}`
          );
        }
        if (insights.count < 2) {
          throw new Error(`Expected count >= 2, got ${insights.count}`);
        }
      }
    );

    await runTest("Insights accept week/month/all/custom ranges", async () => {
      for (const range of ["week", "month", "all"]) {
        const res = await axios.get(`${API_URL}/payables/insights`, {
          params: { range },
          headers: authHeaders(),
        });
        if (res.status !== 200) {
          throw new Error(`range=${range}: expected 200, got ${res.status}`);
        }
      }

      const customRes = await axios.get(`${API_URL}/payables/insights`, {
        params: {
          range: "custom",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
        },
        headers: authHeaders(),
      });
      if (customRes.status !== 200) {
        throw new Error(`range=custom: expected 200, got ${customRes.status}`);
      }
    });

    await runTest("Reject custom insights range without dates", async () => {
      try {
        await axios.get(`${API_URL}/payables/insights`, {
          params: { range: "custom" },
          headers: authHeaders(),
        });
        throw new Error("API accepted range=custom without start_date/end_date");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected 400, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Reject unauthenticated access", async () => {
      try {
        await axios.get(`${API_URL}/payables`);
        throw new Error("Unauthenticated request was accepted");
      } catch (error: any) {
        if (error.response?.status !== 401) {
          throw new Error(
            `Expected 401, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Reject unauthenticated access to insights", async () => {
      try {
        await axios.get(`${API_URL}/payables/insights`);
        throw new Error("Unauthenticated insights request was accepted");
      } catch (error: any) {
        if (error.response?.status !== 401) {
          throw new Error(
            `Expected 401, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Business isolation — cross-business access rejected", async () => {
      const business2 = await prisma.businesses.create({
        data: {
          name: `Payables Test Business 2 ${Date.now()}`,
          is_active: true,
        },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `payables_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Payables Test Admin 2",
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
        await axios.get(`${API_URL}/payables/${testPayableId}`, {
          headers: authHeaders(token2),
        });
        throw new Error("Business 2 token accessed Business 1 payable");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(`Expected HTTP 404, got ${error.response?.status}`);
        }
      }

      const listRes = await axios.get(`${API_URL}/payables`, {
        headers: authHeaders(token2),
      });
      if (listRes.data.count !== 0) {
        throw new Error("Business 2 payables list leaked Business 1 data");
      }

      const insightsRes = await axios.get(`${API_URL}/payables/insights`, {
        params: { range: "today" },
        headers: authHeaders(token2),
      });
      if (insightsRes.data.data.count !== 0) {
        throw new Error("Business 2 insights leaked Business 1 data");
      }

      // A business-2 payable can never reference a business-1 supplier.
      try {
        await axios.post(
          `${API_URL}/payables`,
          { supplier_id: testSupplierId, total_amount: 100, reason: "Test" },
          { headers: authHeaders(token2) }
        );
        throw new Error("Business 2 was able to create a payable against a Business 1 supplier");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(`Expected HTTP 404, got ${error.response?.status}`);
        }
      }
    });
  } finally {
    try {
      for (const payableId of createdPayableIds) {
        await prisma.payable_payments.deleteMany({
          where: { payable_id: payableId },
        });
        await prisma.payables.deleteMany({ where: { id: payableId } });
      }

      for (const supplierId of createdSupplierIds) {
        await prisma.supplier_payments.deleteMany({ where: { supplier_id: supplierId } });
        await prisma.suppliers.deleteMany({ where: { id: supplierId } });
      }

      if (business2Id) {
        if (user2Id) {
          await prisma.users.deleteMany({ where: { id: user2Id } });
        }
        await prisma.businesses.deleteMany({ where: { id: business2Id } });
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
  console.log("========================================");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runPayableTests();
