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
const createdItemIds: bigint[] = [];
const createdImportIds: bigint[] = [];
let testCategoryId: string | null = null;

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

async function createSupplier(name: string) {
  const res = await axios.post(
    `${API_URL}/suppliers`,
    { name: `${name} ${Date.now()}` },
    { headers: authHeaders() }
  );
  createdSupplierIds.push(BigInt(res.data.data.id));
  return res.data.data.id as string;
}

async function createPayable(supplierId: string, amount: number, reason: string) {
  const res = await axios.post(
    `${API_URL}/payables`,
    { supplier_id: supplierId, total_amount: amount, reason },
    { headers: authHeaders() }
  );
  createdPayableIds.push(BigInt(res.data.data.id));
  return res.data.data.id as string;
}

async function getPayable(id: string) {
  const res = await axios.get(`${API_URL}/payables/${id}`, {
    headers: authHeaders(),
  });
  return res.data.data;
}

async function getSupplierBalance(supplierId: string) {
  const res = await axios.get(`${API_URL}/suppliers/${supplierId}/balance`, {
    headers: authHeaders(),
  });
  return res.data.data;
}

async function runSupplierPaymentTests() {
  console.log("\n========================================");
  console.log(" SUPPLIER BULK PAYMENT (FIFO) AUTOMATED TESTS");
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

    let fifoSupplierId: string;
    let bill1Id: string;
    let bill2Id: string;
    let bill3Id: string;

    await runTest(
      "Full FIFO payment across multiple payables (6000/8000/6000, pay 10000)",
      async () => {
        fifoSupplierId = await createSupplier("FIFO Supplier");
        bill1Id = await createPayable(fifoSupplierId, 6000, "Onions 42 bags");
        bill2Id = await createPayable(fifoSupplierId, 8000, "Onions 69 bags");
        bill3Id = await createPayable(fifoSupplierId, 6000, "Onions 52 bags");

        const baseline = await getSupplierBalance(fifoSupplierId);
        if (Number(baseline.balance) !== 20000) {
          throw new Error(`Expected baseline balance 20000, got ${baseline.balance}`);
        }

        const res = await axios.post(
          `${API_URL}/suppliers/${fifoSupplierId}/payments`,
          { amount: 10000 },
          { headers: authHeaders() }
        );

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        if (res.data.data.reason !== "Bulk pay to supplier") {
          throw new Error(`Expected exact reason "Bulk pay to supplier", got "${res.data.data.reason}"`);
        }
        if (Number(res.data.data.amount) !== 10000) {
          throw new Error(`Expected payment amount 10000, got ${res.data.data.amount}`);
        }

        const p1 = await getPayable(bill1Id);
        const p2 = await getPayable(bill2Id);
        const p3 = await getPayable(bill3Id);

        if (Number(p1.amount_paid) !== 6000 || p1.status !== "PAID") {
          throw new Error(`Bill1 expected PAID/6000, got ${p1.status}/${p1.amount_paid}`);
        }
        if (Number(p2.amount_paid) !== 4000 || p2.status !== "PARTIALLY_PAID") {
          throw new Error(`Bill2 expected PARTIALLY_PAID/4000, got ${p2.status}/${p2.amount_paid}`);
        }
        if (Number(p3.amount_paid) !== 0 || p3.status !== "PENDING") {
          throw new Error(`Bill3 expected PENDING/0, got ${p3.status}/${p3.amount_paid}`);
        }
      }
    );

    await runTest("Supplier balance updates correctly after bulk payment", async () => {
      const balance = await getSupplierBalance(fifoSupplierId);
      if (Number(balance.total_payable) !== 20000) {
        throw new Error(`Expected total_payable 20000, got ${balance.total_payable}`);
      }
      if (Number(balance.total_paid) !== 10000) {
        throw new Error(`Expected total_paid 10000, got ${balance.total_paid}`);
      }
      if (Number(balance.balance) !== 10000) {
        throw new Error(`Expected balance 10000, got ${balance.balance}`);
      }
    });

    await runTest("My Pays list totals reflect the bulk payment", async () => {
      const res = await axios.get(`${API_URL}/payables`, {
        params: { supplier_id: fifoSupplierId },
        headers: authHeaders(),
      });
      const payables = res.data.data as any[];
      const totalPaid = payables.reduce((sum, p) => sum + Number(p.amount_paid), 0);
      if (totalPaid !== 10000) {
        throw new Error(`Expected My Pays total_paid 10000, got ${totalPaid}`);
      }
    });

    await runTest("Bulk payment appears in supplier payment history", async () => {
      const res = await axios.get(`${API_URL}/suppliers/${fifoSupplierId}/payments`, {
        headers: authHeaders(),
      });
      const payments = res.data.data as any[];
      if (payments.length !== 1) {
        throw new Error(`Expected 1 payment record, got ${payments.length}`);
      }
      if (Number(payments[0].amount) !== 10000) {
        throw new Error(`Expected payment amount 10000, got ${payments[0].amount}`);
      }
      if (payments[0].payable_payments.length !== 2) {
        throw new Error(
          `Expected 2 payable_payments allocations, got ${payments[0].payable_payments.length}`
        );
      }
    });

    await runTest(
      "Individual payable's own payment history shows the bulk allocation",
      async () => {
        const p1 = await getPayable(bill1Id);
        if (p1.payable_payments.length !== 1) {
          throw new Error(`Expected 1 payable_payments row on bill1, got ${p1.payable_payments.length}`);
        }
        if (p1.payable_payments[0].supplier_payment_id === null) {
          throw new Error("Expected bill1's payment row to carry a supplier_payment_id");
        }
      }
    );

    await runTest(
      "Reject a bulk payment exceeding the supplier's remaining balance (409), no side effects",
      async () => {
        const balanceBefore = await getSupplierBalance(fifoSupplierId);
        const paymentsBefore = await axios.get(
          `${API_URL}/suppliers/${fifoSupplierId}/payments`,
          { headers: authHeaders() }
        );

        try {
          await axios.post(
            `${API_URL}/suppliers/${fifoSupplierId}/payments`,
            { amount: 999999 },
            { headers: authHeaders() }
          );
          throw new Error("API accepted a payment exceeding the supplier's balance");
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(`Expected 409, got ${error.response?.status ?? error.message}`);
          }
        }

        const balanceAfter = await getSupplierBalance(fifoSupplierId);
        if (Number(balanceAfter.balance) !== Number(balanceBefore.balance)) {
          throw new Error(
            `Rejected payment changed the balance: ${balanceBefore.balance} -> ${balanceAfter.balance}`
          );
        }

        const paymentsAfter = await axios.get(
          `${API_URL}/suppliers/${fifoSupplierId}/payments`,
          { headers: authHeaders() }
        );
        if (paymentsAfter.data.count !== paymentsBefore.data.count) {
          throw new Error("Rejected payment still created a supplier_payments row");
        }
      }
    );

    let partialSupplierId: string;
    let partialPayableId: string;

    await runTest("Partial payment of the oldest (only) payable", async () => {
      partialSupplierId = await createSupplier("Partial Supplier");
      partialPayableId = await createPayable(partialSupplierId, 6000, "Coconuts");

      const res = await axios.post(
        `${API_URL}/suppliers/${partialSupplierId}/payments`,
        { amount: 4000 },
        { headers: authHeaders() }
      );
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);

      const payable = await getPayable(partialPayableId);
      if (Number(payable.amount_paid) !== 4000 || payable.status !== "PARTIALLY_PAID") {
        throw new Error(
          `Expected PARTIALLY_PAID/4000, got ${payable.status}/${payable.amount_paid}`
        );
      }
    });

    await runTest(
      "A later payment continues from the remaining balance, not a new payable",
      async () => {
        const res = await axios.post(
          `${API_URL}/suppliers/${partialSupplierId}/payments`,
          { amount: 2000 },
          { headers: authHeaders() }
        );
        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);

        const payable = await getPayable(partialPayableId);
        if (Number(payable.amount_paid) !== 6000 || payable.status !== "PAID") {
          throw new Error(`Expected PAID/6000, got ${payable.status}/${payable.amount_paid}`);
        }

        const paymentsRes = await axios.get(
          `${API_URL}/payables`,
          { params: { supplier_id: partialSupplierId }, headers: authHeaders() }
        );
        if ((paymentsRes.data.data as any[]).length !== 1) {
          throw new Error("A second payable was created instead of continuing the first");
        }
      }
    );

    await runTest(
      "Reject a bulk payment for a supplier with no outstanding balance",
      async () => {
        const zeroBalanceSupplierId = await createSupplier("Zero Balance Supplier");
        try {
          await axios.post(
            `${API_URL}/suppliers/${zeroBalanceSupplierId}/payments`,
            { amount: 100 },
            { headers: authHeaders() }
          );
          throw new Error("API accepted a payment for a supplier with no payables");
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(`Expected 409, got ${error.response?.status ?? error.message}`);
          }
        }
      }
    );

    await runTest(
      "Existing import-linked payables participate in FIFO normally",
      async () => {
        const importSupplierId = await createSupplier("Import FIFO Supplier");

        const catRes = await axios.post(
          `${API_URL}/categories`,
          { name: `Supplier Payment Test Category ${Date.now()}` },
          { headers: authHeaders() }
        );
        testCategoryId = catRes.data.data.id;

        const itemRes = await axios.post(
          `${API_URL}/items`,
          {
            item_code: `SP-ITEM-${Date.now()}`,
            english_name: `Supplier Payment Test Item ${Date.now()}`,
            category_id: testCategoryId,
          },
          { headers: authHeaders() }
        );
        const itemId = itemRes.data.data.id;
        createdItemIds.push(BigInt(itemId));

        const importRes = await axios.post(
          `${API_URL}/imports`,
          {
            supplier_id: importSupplierId,
            item_id: itemId,
            quantity: 10,
            unit: "kg",
            amount: 5000,
            paid_amount: 0,
          },
          { headers: authHeaders() }
        );
        createdImportIds.push(BigInt(importRes.data.data.id));
        const linkedPayableId = importRes.data.data.payables.id as string;
        createdPayableIds.push(BigInt(linkedPayableId));

        const res = await axios.post(
          `${API_URL}/suppliers/${importSupplierId}/payments`,
          { amount: 5000 },
          { headers: authHeaders() }
        );
        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);

        const payable = await getPayable(linkedPayableId);
        if (payable.status !== "PAID") {
          throw new Error(`Expected import-linked payable PAID, got ${payable.status}`);
        }
      }
    );

    await runTest("Reject unauthenticated access", async () => {
      try {
        await axios.post(`${API_URL}/suppliers/${fifoSupplierId}/payments`, {
          amount: 100,
        });
        throw new Error("Unauthenticated request was accepted");
      } catch (error: any) {
        if (error.response?.status !== 401) {
          throw new Error(`Expected 401, got ${error.response?.status ?? error.message}`);
        }
      }
    });

    await runTest("Business isolation — cross-business access rejected", async () => {
      const business2 = await prisma.businesses.create({
        data: {
          name: `Supplier Payment Test Business 2 ${Date.now()}`,
          is_active: true,
        },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `supplier_payment_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Supplier Payment Test Admin 2",
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
        await axios.post(
          `${API_URL}/suppliers/${fifoSupplierId}/payments`,
          { amount: 100 },
          { headers: authHeaders(token2) }
        );
        throw new Error("Business 2 token paid a Business 1 supplier");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(`Expected HTTP 404, got ${error.response?.status}`);
        }
      }

      try {
        await axios.get(`${API_URL}/suppliers/${fifoSupplierId}/payments`, {
          headers: authHeaders(token2),
        });
        throw new Error("Business 2 token read Business 1 supplier's payment history");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(`Expected HTTP 404, got ${error.response?.status}`);
        }
      }
    });
  } finally {
    try {
      for (const payableId of createdPayableIds) {
        await prisma.payable_payments.deleteMany({ where: { payable_id: payableId } });
      }
      for (const importId of createdImportIds) {
        await prisma.stock_movements.deleteMany({ where: { import_id: importId } });
      }
      for (const supplierId of createdSupplierIds) {
        await prisma.supplier_payments.deleteMany({ where: { supplier_id: supplierId } });
      }
      for (const importId of createdImportIds) {
        await prisma.payables.deleteMany({ where: { import_id: importId } });
        await prisma.imports.deleteMany({ where: { id: importId } });
      }
      for (const payableId of createdPayableIds) {
        await prisma.payables.deleteMany({ where: { id: payableId } });
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
        await prisma.categories.deleteMany({ where: { id: BigInt(testCategoryId) } });
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

runSupplierPaymentTests();
