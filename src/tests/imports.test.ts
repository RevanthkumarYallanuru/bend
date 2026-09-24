import axios from "axios";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let business2Id: bigint | null = null;
let user2Id: bigint | null = null;

let testSupplierId: string | null = null;
let testCategoryId: string | null = null;
let testItemId: string | null = null;

const createdSupplierIds: bigint[] = [];
const createdItemIds: bigint[] = [];
const createdImportIds: bigint[] = [];
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

async function runImportTests() {
  console.log("\n========================================");
  console.log(" IMPORTS API AUTOMATED TESTS");
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
        { name: `Import Test Supplier ${Date.now()}` },
        { headers: authHeaders() }
      );
      testSupplierId = res.data.data.id;
      createdSupplierIds.push(BigInt(testSupplierId!));
    });

    await runTest("Create item fixture", async () => {
      const catRes = await axios.post(
        `${API_URL}/categories`,
        { name: `Import Test Category ${Date.now()}` },
        { headers: authHeaders() }
      );
      testCategoryId = catRes.data.data.id;

      const itemRes = await axios.post(
        `${API_URL}/items`,
        {
          item_code: `IMP-ITEM-${Date.now()}`,
          english_name: `Onion ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );
      testItemId = itemRes.data.data.id;
      createdItemIds.push(BigInt(testItemId!));
    });

    let pendingImportId: string | null = null;
    let pendingImportPayableId: string | null = null;

    await runTest(
      "Import with a pending amount auto-creates a linked My Pay for the remainder only",
      async () => {
        const res = await axios.post(
          `${API_URL}/imports`,
          {
            supplier_id: testSupplierId,
            item_id: testItemId,
            quantity: 200,
            unit: "kg",
            amount: 6000,
            paid_amount: 2000,
          },
          { headers: authHeaders() }
        );

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        const importRecord = res.data.data;
        pendingImportId = importRecord.id;
        createdImportIds.push(BigInt(pendingImportId!));

        if (Number(importRecord.amount) !== 6000) {
          throw new Error(`Expected amount 6000, got ${importRecord.amount}`);
        }
        if (Number(importRecord.paid_amount) !== 2000) {
          throw new Error(`Expected paid_amount 2000, got ${importRecord.paid_amount}`);
        }
        if (!importRecord.payables) {
          throw new Error("Expected a linked payable in the response");
        }

        pendingImportPayableId = importRecord.payables.id;
        createdPayableIds.push(BigInt(pendingImportPayableId!));

        // The spec's own worked example: pending remainder (4000), not
        // the full import amount (6000).
        if (Number(importRecord.payables.total_amount) !== 4000) {
          throw new Error(
            `Expected linked payable amount 4000, got ${importRecord.payables.total_amount}`
          );
        }
        if (importRecord.payables.reason !== `Import - ${importRecord.items.english_name}`) {
          throw new Error(
            `Expected reason "Import - ${importRecord.items.english_name}", got "${importRecord.payables.reason}"`
          );
        }
        if (importRecord.payables.status !== "PENDING") {
          throw new Error(
            `Expected linked payable status PENDING, got ${importRecord.payables.status}`
          );
        }
      }
    );

    await runTest(
      "The linked My Pay appears in the main My Pays list",
      async () => {
        const res = await axios.get(`${API_URL}/payables`, {
          params: { supplier_id: testSupplierId },
          headers: authHeaders(),
        });
        const found = (res.data.data as any[]).some(
          (p) => p.id === pendingImportPayableId
        );
        if (!found) {
          throw new Error("Import-linked payable not found in My Pays list");
        }
      }
    );

    await runTest(
      "Supplier balance reflects only the pending import remainder",
      async () => {
        const res = await axios.get(
          `${API_URL}/suppliers/${testSupplierId}/balance`,
          { headers: authHeaders() }
        );
        if (Number(res.data.data.balance) !== 4000) {
          throw new Error(
            `Expected supplier balance 4000, got ${res.data.data.balance}`
          );
        }
      }
    );

    await runTest(
      "Paying off the linked My Pay clears the supplier balance",
      async () => {
        await axios.post(
          `${API_URL}/payables/${pendingImportPayableId}/payments`,
          { amount: 4000 },
          { headers: authHeaders() }
        );

        const payableRes = await axios.get(
          `${API_URL}/payables/${pendingImportPayableId}`,
          { headers: authHeaders() }
        );
        if (payableRes.data.data.status !== "PAID") {
          throw new Error(
            `Expected linked payable status PAID, got ${payableRes.data.data.status}`
          );
        }

        const balanceRes = await axios.get(
          `${API_URL}/suppliers/${testSupplierId}/balance`,
          { headers: authHeaders() }
        );
        if (Number(balanceRes.data.data.balance) !== 0) {
          throw new Error(
            `Expected supplier balance 0, got ${balanceRes.data.data.balance}`
          );
        }
      }
    );

    await runTest(
      "Import fully paid at purchase time creates no linked My Pay",
      async () => {
        const res = await axios.post(
          `${API_URL}/imports`,
          {
            supplier_id: testSupplierId,
            item_id: testItemId,
            quantity: 50,
            unit: "kg",
            amount: 1000,
            paid_amount: 1000,
          },
          { headers: authHeaders() }
        );

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        createdImportIds.push(BigInt(res.data.data.id));

        if (res.data.data.payables !== null) {
          throw new Error(
            `Expected no linked payable for a fully-paid import, got ${JSON.stringify(res.data.data.payables)}`
          );
        }

        const balanceRes = await axios.get(
          `${API_URL}/suppliers/${testSupplierId}/balance`,
          { headers: authHeaders() }
        );
        if (Number(balanceRes.data.data.balance) !== 0) {
          throw new Error(
            `Expected supplier balance to stay 0 after a fully-paid import, got ${balanceRes.data.data.balance}`
          );
        }
      }
    );

    await runTest(
      "Supplier's imports panel and My Pays list agree on the same records",
      async () => {
        const importsRes = await axios.get(`${API_URL}/imports`, {
          params: { supplier_id: testSupplierId },
          headers: authHeaders(),
        });
        const payablesRes = await axios.get(`${API_URL}/payables`, {
          params: { supplier_id: testSupplierId },
          headers: authHeaders(),
        });

        const imports = importsRes.data.data as any[];
        const payables = payablesRes.data.data as any[];

        if (imports.length !== 2) {
          throw new Error(`Expected 2 imports, got ${imports.length}`);
        }
        // Only the pending import produced a payable.
        const linkedImport = imports.find((i) => i.id === pendingImportId);
        const linkedPayable = payables.find(
          (p) => p.id === pendingImportPayableId
        );
        if (!linkedImport || !linkedPayable) {
          throw new Error("Import and its linked payable did not both resolve");
        }
        if (linkedImport.payables?.id !== linkedPayable.id) {
          throw new Error(
            "Import's linked payable id does not match the payable seen in My Pays"
          );
        }
      }
    );

    await runTest("Reject import for a non-existent supplier", async () => {
      try {
        await axios.post(
          `${API_URL}/imports`,
          {
            supplier_id: "999999999",
            item_id: testItemId,
            quantity: 1,
            unit: "kg",
            amount: 100,
            paid_amount: 0,
          },
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

    await runTest("Reject import for a non-existent item", async () => {
      try {
        await axios.post(
          `${API_URL}/imports`,
          {
            supplier_id: testSupplierId,
            item_id: "999999999",
            quantity: 1,
            unit: "kg",
            amount: 100,
            paid_amount: 0,
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted a non-existent item_id");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(
            `Expected 404, got ${error.response?.status ?? error.message}`
          );
        }
      }
    });

    await runTest("Reject paid_amount greater than amount", async () => {
      try {
        await axios.post(
          `${API_URL}/imports`,
          {
            supplier_id: testSupplierId,
            item_id: testItemId,
            quantity: 1,
            unit: "kg",
            amount: 100,
            paid_amount: 500,
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted paid_amount exceeding amount");
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
        await axios.get(`${API_URL}/imports`);
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
          name: `Imports Test Business 2 ${Date.now()}`,
          is_active: true,
        },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `imports_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Imports Test Admin 2",
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
        await axios.get(`${API_URL}/imports/${pendingImportId}`, {
          headers: authHeaders(token2),
        });
        throw new Error("Business 2 token accessed Business 1 import");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(`Expected HTTP 404, got ${error.response?.status}`);
        }
      }

      const listRes = await axios.get(`${API_URL}/imports`, {
        headers: authHeaders(token2),
      });
      if (listRes.data.count !== 0) {
        throw new Error("Business 2 imports list leaked Business 1 data");
      }

      // Cannot create an import against another business's supplier or item.
      try {
        await axios.post(
          `${API_URL}/imports`,
          {
            supplier_id: testSupplierId,
            item_id: testItemId,
            quantity: 1,
            unit: "kg",
            amount: 100,
            paid_amount: 0,
          },
          { headers: authHeaders(token2) }
        );
        throw new Error("Business 2 created an import against Business 1's supplier/item");
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
      }
      for (const importId of createdImportIds) {
        await prisma.payables.deleteMany({ where: { import_id: importId } });
        await prisma.imports.deleteMany({ where: { id: importId } });
      }

      for (const supplierId of createdSupplierIds) {
        await prisma.payables.deleteMany({ where: { supplier_id: supplierId } });
        await prisma.suppliers.deleteMany({ where: { id: supplierId } });
      }

      for (const itemId of createdItemIds) {
        await prisma.item_units.deleteMany({ where: { item_id: itemId } });
        await prisma.items.deleteMany({ where: { id: itemId } });
      }

      if (testCategoryId) {
        await prisma.categories.deleteMany({
          where: { id: BigInt(testCategoryId) },
        });
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

runImportTests();
