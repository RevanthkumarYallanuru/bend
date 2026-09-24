import axios from "axios";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let business2Id: bigint | null = null;
let user2Id: bigint | null = null;

let testCategoryId: string | null = null;
let testItemId: string | null = null;
let testItemUnitId: string | null = null;
let testSupplierId: string | null = null;
let testCustomerId: string | null = null;

const createdItemIds: bigint[] = [];
const createdSupplierIds: bigint[] = [];
const createdCustomerIds: bigint[] = [];
const createdImportIds: bigint[] = [];
const createdBillIds: bigint[] = [];

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

async function getTallyRow(itemId: string, bearer = token) {
  const res = await axios.get(`${API_URL}/inventory/tally`, {
    headers: authHeaders(bearer),
  });
  return (res.data.data as any[]).find((row) => row.item_id === itemId);
}

async function runInventoryTests() {
  console.log("\n========================================");
  console.log(" INVENTORY / STOCK TALLY AUTOMATED TESTS");
  console.log("========================================\n");

  let firstBillId: string | null = null;

  try {
    await runTest("Login", async () => {
      const response = await axios.post(`${API_URL}/auth/login`, {
        username: "admin",
        password: "ChangeMe@123",
      });
      token = response.data.data?.token;
      if (!token) throw new Error("JWT token was not returned");
    });

    await runTest("Create supplier/customer/item fixtures", async () => {
      const supplierRes = await axios.post(
        `${API_URL}/suppliers`,
        { name: `Inventory Test Supplier ${Date.now()}` },
        { headers: authHeaders() }
      );
      testSupplierId = supplierRes.data.data.id;
      createdSupplierIds.push(BigInt(testSupplierId!));

      const customerRes = await axios.post(
        `${API_URL}/customers`,
        {
          customer_code: `INV-CUST-${Date.now()}`,
          english_name: `Inventory Test Customer ${Date.now()}`,
          phone: "9876500000",
        },
        { headers: authHeaders() }
      );
      testCustomerId = customerRes.data.data.id;
      createdCustomerIds.push(BigInt(testCustomerId!));

      const catRes = await axios.post(
        `${API_URL}/categories`,
        { name: `Inventory Test Category ${Date.now()}` },
        { headers: authHeaders() }
      );
      testCategoryId = catRes.data.data.id;

      const itemRes = await axios.post(
        `${API_URL}/items`,
        {
          item_code: `INV-ITEM-${Date.now()}`,
          english_name: `Inventory Test Item ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );
      testItemId = itemRes.data.data.id;
      createdItemIds.push(BigInt(testItemId!));

      const unitRes = await axios.post(
        `${API_URL}/items/${testItemId}/units`,
        { unit: "kg", standard_price: 10, is_default: true },
        { headers: authHeaders() }
      );
      testItemUnitId = unitRes.data.data.id;
    });

    await runTest(
      "Importing 200kg adds 200 to the item's stock tally",
      async () => {
        const res = await axios.post(
          `${API_URL}/imports`,
          {
            supplier_id: testSupplierId,
            item_id: testItemId,
            quantity: 200,
            unit: "kg",
            amount: 2000,
            paid_amount: 2000,
          },
          { headers: authHeaders() }
        );
        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        createdImportIds.push(BigInt(res.data.data.id));

        const row = await getTallyRow(testItemId!);
        if (!row) throw new Error("Item not found in stock tally");
        if (Number(row.total_imported) !== 200) {
          throw new Error(`Expected total_imported 200, got ${row.total_imported}`);
        }
        if (Number(row.remaining_stock) !== 200) {
          throw new Error(`Expected remaining_stock 200, got ${row.remaining_stock}`);
        }
        if (Number(row.last_import_qty) !== 200) {
          throw new Error(`Expected last_import_qty 200, got ${row.last_import_qty}`);
        }
      }
    );

    await runTest(
      "Selling 100kg via a completed bill reduces stock to 100",
      async () => {
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
                quantity: 100,
                actual_rate: 10,
                discount: 0,
              },
            ],
          },
          { headers: authHeaders() }
        );
        if (billRes.status !== 201) {
          throw new Error(`Expected 201, got ${billRes.status}`);
        }
        firstBillId = billRes.data.data.id;
        createdBillIds.push(BigInt(firstBillId!));

        if (billRes.data.data.status !== "COMPLETED") {
          throw new Error(`Expected bill status COMPLETED, got ${billRes.data.data.status}`);
        }

        const row = await getTallyRow(testItemId!);
        if (Number(row.total_sold) !== 100) {
          throw new Error(`Expected total_sold 100, got ${row.total_sold}`);
        }
        if (Number(row.remaining_stock) !== 100) {
          throw new Error(`Expected remaining_stock 100, got ${row.remaining_stock}`);
        }
      }
    );

    await runTest(
      "Stock movement history shows IMPORT then SALE with correct balances",
      async () => {
        const res = await axios.get(
          `${API_URL}/inventory/items/${testItemId}/movements`,
          { headers: authHeaders() }
        );
        const movements = res.data.data as any[];
        if (movements.length !== 2) {
          throw new Error(`Expected 2 movements, got ${movements.length}`);
        }
        if (movements[0].movement_type !== "IMPORT" || Number(movements[0].quantity_in) !== 200) {
          throw new Error(`Unexpected first movement: ${JSON.stringify(movements[0])}`);
        }
        if (Number(movements[0].balance_after) !== 200) {
          throw new Error(`Expected first balance_after 200, got ${movements[0].balance_after}`);
        }
        if (movements[1].movement_type !== "SALE" || Number(movements[1].quantity_out) !== 100) {
          throw new Error(`Unexpected second movement: ${JSON.stringify(movements[1])}`);
        }
        if (Number(movements[1].balance_after) !== 100) {
          throw new Error(`Expected second balance_after 100, got ${movements[1].balance_after}`);
        }
      }
    );

    await runTest(
      "Cancelling the bill restores stock and nets total_sold back to 0",
      async () => {
        const cancelRes = await axios.patch(
          `${API_URL}/bills/${firstBillId}/cancel`,
          {},
          { headers: authHeaders() }
        );
        if (cancelRes.data.data.status !== "CANCELLED") {
          throw new Error(`Expected bill status CANCELLED, got ${cancelRes.data.data.status}`);
        }

        const row = await getTallyRow(testItemId!);
        if (Number(row.total_sold) !== 0) {
          throw new Error(`Expected total_sold back to 0, got ${row.total_sold}`);
        }
        if (Number(row.remaining_stock) !== 200) {
          throw new Error(`Expected remaining_stock restored to 200, got ${row.remaining_stock}`);
        }

        const res = await axios.get(
          `${API_URL}/inventory/items/${testItemId}/movements`,
          { headers: authHeaders() }
        );
        const movements = res.data.data as any[];
        if (movements.length !== 3) {
          throw new Error(`Expected 3 movements after cancellation, got ${movements.length}`);
        }
        const reversal = movements[2];
        if (reversal.movement_type !== "ADJUSTMENT" || Number(reversal.quantity_in) !== 100) {
          throw new Error(`Unexpected reversal movement: ${JSON.stringify(reversal)}`);
        }
        if (Number(reversal.balance_after) !== 200) {
          throw new Error(`Expected reversal balance_after 200, got ${reversal.balance_after}`);
        }
      }
    );

    await runTest(
      "A second import of the same item accumulates on top of the first",
      async () => {
        const res = await axios.post(
          `${API_URL}/imports`,
          {
            supplier_id: testSupplierId,
            item_id: testItemId,
            quantity: 50,
            unit: "kg",
            amount: 500,
            paid_amount: 500,
          },
          { headers: authHeaders() }
        );
        createdImportIds.push(BigInt(res.data.data.id));

        const row = await getTallyRow(testItemId!);
        if (Number(row.total_imported) !== 250) {
          throw new Error(`Expected total_imported 250, got ${row.total_imported}`);
        }
        if (Number(row.remaining_stock) !== 250) {
          throw new Error(`Expected remaining_stock 250, got ${row.remaining_stock}`);
        }
        if (Number(row.last_import_qty) !== 50) {
          throw new Error(`Expected last_import_qty 50 (most recent import), got ${row.last_import_qty}`);
        }
      }
    );

    await runTest("Reject unauthenticated access to stock tally", async () => {
      try {
        await axios.get(`${API_URL}/inventory/tally`);
        throw new Error("Unauthenticated request was accepted");
      } catch (error: any) {
        if (error.response?.status !== 401) {
          throw new Error(`Expected 401, got ${error.response?.status ?? error.message}`);
        }
      }
    });

    await runTest("Reject movement history for a non-existent item", async () => {
      try {
        await axios.get(`${API_URL}/inventory/items/999999999/movements`, {
          headers: authHeaders(),
        });
        throw new Error("API returned movements for a non-existent item");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(`Expected 404, got ${error.response?.status ?? error.message}`);
        }
      }
    });

    await runTest("Business isolation — cross-business access rejected", async () => {
      const business2 = await prisma.businesses.create({
        data: {
          name: `Inventory Test Business 2 ${Date.now()}`,
          is_active: true,
        },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `inventory_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Inventory Test Admin 2",
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

      const tallyRes = await axios.get(`${API_URL}/inventory/tally`, {
        headers: authHeaders(token2),
      });
      const leaked = (tallyRes.data.data as any[]).some(
        (row) => row.item_id === testItemId
      );
      if (leaked) {
        throw new Error("Business 2 stock tally leaked Business 1's item");
      }

      try {
        await axios.get(`${API_URL}/inventory/items/${testItemId}/movements`, {
          headers: authHeaders(token2),
        });
        throw new Error("Business 2 token accessed Business 1 item's movements");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(`Expected HTTP 404, got ${error.response?.status}`);
        }
      }
    });
  } finally {
    try {
      for (const billId of createdBillIds) {
        await prisma.stock_movements.deleteMany({ where: { bill_id: billId } });
        await prisma.payment_allocations.deleteMany({ where: { bill_id: billId } });
        await prisma.ledger_entries.deleteMany({ where: { bill_id: billId } });
        await prisma.audit_logs.deleteMany({ where: { entity_type: "bill", entity_id: billId } });
        await prisma.bill_items.deleteMany({ where: { bill_id: billId } });
        await prisma.bills.deleteMany({ where: { id: billId } });
      }

      for (const importId of createdImportIds) {
        await prisma.stock_movements.deleteMany({ where: { import_id: importId } });
        await prisma.payables.deleteMany({ where: { import_id: importId } });
        await prisma.imports.deleteMany({ where: { id: importId } });
      }

      if (testItemId) {
        await prisma.stock_movements.deleteMany({ where: { item_id: BigInt(testItemId) } });
      }

      for (const supplierId of createdSupplierIds) {
        await prisma.payables.deleteMany({ where: { supplier_id: supplierId } });
        await prisma.suppliers.deleteMany({ where: { id: supplierId } });
      }

      for (const customerId of createdCustomerIds) {
        await prisma.payments.deleteMany({ where: { customer_id: customerId } });
        await prisma.ledger_entries.deleteMany({ where: { customer_id: customerId } });
        await prisma.customers.deleteMany({ where: { id: customerId } });
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

runInventoryTests();
