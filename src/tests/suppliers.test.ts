import axios from "axios";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let business2Id: bigint | null = null;
let user2Id: bigint | null = null;

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

async function runSupplierTests() {
  console.log("\n========================================");
  console.log(" SUPPLIERS API AUTOMATED TESTS");
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

    let plainSupplierId: string | null = null;

    await runTest("Create supplier (no initial balance)", async () => {
      const res = await axios.post(
        `${API_URL}/suppliers`,
        {
          name: `Test Supplier ${Date.now()}`,
          telugu_name: "టెస్ట్ సప్లయర్",
          phone: "9998887770",
          organization: "Test Traders",
        },
        { headers: authHeaders() }
      );

      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      plainSupplierId = res.data.data.id;
      createdSupplierIds.push(BigInt(plainSupplierId!));

      if (res.data.data.is_active !== true) {
        throw new Error("Expected new supplier to default to active");
      }
    });

    await runTest("Reject supplier with missing name", async () => {
      try {
        await axios.post(
          `${API_URL}/suppliers`,
          { name: "" },
          { headers: authHeaders() }
        );
        throw new Error("API accepted an empty supplier name");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(
            `Expected 400, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    let openingBalanceSupplierId: string | null = null;

    await runTest(
      "Create supplier with an initial balance auto-creates a linked payable",
      async () => {
        const res = await axios.post(
          `${API_URL}/suppliers`,
          {
            name: `Opening Balance Supplier ${Date.now()}`,
            initial_balance: 7500,
          },
          { headers: authHeaders() }
        );

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        openingBalanceSupplierId = res.data.data.id;
        createdSupplierIds.push(BigInt(openingBalanceSupplierId!));

        const payablesRes = await axios.get(`${API_URL}/payables`, {
          params: { supplier_id: openingBalanceSupplierId },
          headers: authHeaders(),
        });

        const payables = payablesRes.data.data as any[];
        if (payables.length !== 1) {
          throw new Error(
            `Expected exactly 1 auto-created payable, got ${payables.length}`
          );
        }
        createdPayableIds.push(BigInt(payables[0].id));

        if (Number(payables[0].total_amount) !== 7500) {
          throw new Error(
            `Expected opening balance payable of 7500, got ${payables[0].total_amount}`
          );
        }
        if (payables[0].reason !== "Opening Balance") {
          throw new Error(
            `Expected reason "Opening Balance", got "${payables[0].reason}"`
          );
        }
        if (payables[0].status !== "PENDING") {
          throw new Error(`Expected status PENDING, got ${payables[0].status}`);
        }
      }
    );

    await runTest(
      "Supplier balance endpoint reflects the opening-balance payable",
      async () => {
        const res = await axios.get(
          `${API_URL}/suppliers/${openingBalanceSupplierId}/balance`,
          { headers: authHeaders() }
        );

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (Number(res.data.data.total_payable) !== 7500) {
          throw new Error(
            `Expected total_payable 7500, got ${res.data.data.total_payable}`
          );
        }
        if (Number(res.data.data.total_paid) !== 0) {
          throw new Error(
            `Expected total_paid 0, got ${res.data.data.total_paid}`
          );
        }
        if (Number(res.data.data.balance) !== 7500) {
          throw new Error(
            `Expected balance 7500, got ${res.data.data.balance}`
          );
        }
      }
    );

    await runTest(
      "Bulk supplier balances include this supplier with the same figures",
      async () => {
        const res = await axios.get(`${API_URL}/suppliers/balances`, {
          headers: authHeaders(),
        });

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        const row = (res.data.data as any[]).find(
          (r) => r.supplier_id === openingBalanceSupplierId
        );
        if (!row) {
          throw new Error("Supplier missing from bulk balances endpoint");
        }
        if (Number(row.balance) !== 7500) {
          throw new Error(`Expected bulk balance 7500, got ${row.balance}`);
        }
      }
    );

    await runTest(
      "Supplier balance updates after a payment against the opening balance",
      async () => {
        const payablesRes = await axios.get(`${API_URL}/payables`, {
          params: { supplier_id: openingBalanceSupplierId },
          headers: authHeaders(),
        });
        const payableId = payablesRes.data.data[0].id;

        await axios.post(
          `${API_URL}/payables/${payableId}/payments`,
          { amount: 3000 },
          { headers: authHeaders() }
        );

        const balanceRes = await axios.get(
          `${API_URL}/suppliers/${openingBalanceSupplierId}/balance`,
          { headers: authHeaders() }
        );

        if (Number(balanceRes.data.data.total_paid) !== 3000) {
          throw new Error(
            `Expected total_paid 3000, got ${balanceRes.data.data.total_paid}`
          );
        }
        if (Number(balanceRes.data.data.balance) !== 4500) {
          throw new Error(
            `Expected balance 4500, got ${balanceRes.data.data.balance}`
          );
        }
      }
    );

    await runTest("Get supplier by ID", async () => {
      const res = await axios.get(`${API_URL}/suppliers/${plainSupplierId}`, {
        headers: authHeaders(),
      });
      if (res.status !== 200 || res.data.data.id !== plainSupplierId) {
        throw new Error("Failed to fetch the created supplier");
      }
    });

    await runTest("List / search suppliers", async () => {
      const res = await axios.get(`${API_URL}/suppliers`, {
        params: { search: "Test Traders" },
        headers: authHeaders(),
      });
      const found = (res.data.data as any[]).some(
        (s) => s.id === plainSupplierId
      );
      if (!found) throw new Error("Search by organization did not find the supplier");
    });

    await runTest("Update supplier", async () => {
      const res = await axios.patch(
        `${API_URL}/suppliers/${plainSupplierId}`,
        { phone: "9111122223" },
        { headers: authHeaders() }
      );
      if (res.data.data.phone !== "9111122223") {
        throw new Error("Phone number was not updated");
      }
    });

    await runTest("Deactivate then reactivate supplier", async () => {
      const deactivateRes = await axios.patch(
        `${API_URL}/suppliers/${plainSupplierId}/deactivate`,
        {},
        { headers: authHeaders() }
      );
      if (deactivateRes.data.data.is_active !== false) {
        throw new Error("Expected supplier to be deactivated");
      }

      const activateRes = await axios.patch(
        `${API_URL}/suppliers/${plainSupplierId}/activate`,
        {},
        { headers: authHeaders() }
      );
      if (activateRes.data.data.is_active !== true) {
        throw new Error("Expected supplier to be reactivated");
      }
    });

    await runTest("Reject unauthenticated access", async () => {
      try {
        await axios.get(`${API_URL}/suppliers`);
        throw new Error("Unauthenticated request was accepted");
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
          name: `Suppliers Test Business 2 ${Date.now()}`,
          is_active: true,
        },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `suppliers_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Suppliers Test Admin 2",
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
        await axios.get(`${API_URL}/suppliers/${plainSupplierId}`, {
          headers: authHeaders(token2),
        });
        throw new Error("Business 2 token accessed Business 1 supplier");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(`Expected HTTP 404, got ${error.response?.status}`);
        }
      }

      const listRes = await axios.get(`${API_URL}/suppliers`, {
        headers: authHeaders(token2),
      });
      if (listRes.data.count !== 0) {
        throw new Error("Business 2 suppliers list leaked Business 1 data");
      }

      const balancesRes = await axios.get(`${API_URL}/suppliers/balances`, {
        headers: authHeaders(token2),
      });
      if (balancesRes.data.data.length !== 0) {
        throw new Error("Business 2 balances leaked Business 1 data");
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
        await prisma.payables.deleteMany({ where: { supplier_id: supplierId } });
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

runSupplierTests();
