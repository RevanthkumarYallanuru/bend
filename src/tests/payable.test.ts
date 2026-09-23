import axios from "axios";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let business2Id: bigint | null = null;
let user2Id: bigint | null = null;

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

    await runTest("Create payable", async () => {
      const res = await axios.post(
        `${API_URL}/payables`,
        {
          payee_name: `Ramesh Traders ${Date.now()}`,
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
    });

    await runTest("Reject payable with missing required fields", async () => {
      try {
        await axios.post(
          `${API_URL}/payables`,
          { payee_name: "", total_amount: 100, reason: "" },
          { headers: authHeaders() }
        );
        throw new Error("API accepted empty name/reason");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected 400, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Reject payable with non-positive amount", async () => {
      try {
        await axios.post(
          `${API_URL}/payables`,
          { payee_name: "ABC Transport", total_amount: 0, reason: "Test" },
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

    await runTest("Insights accept week/month/custom ranges", async () => {
      for (const range of ["week", "month"]) {
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
    });
  } finally {
    try {
      for (const payableId of createdPayableIds) {
        await prisma.payable_payments.deleteMany({
          where: { payable_id: payableId },
        });
        await prisma.payables.deleteMany({ where: { id: payableId } });
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
