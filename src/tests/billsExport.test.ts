import axios from "axios";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let testCustomerId: string | null = null;
let testCategoryId: string | null = null;
let testItemId: string | null = null;
let testItemUnitId: string | null = null;

let bill1: any = null; // customer bill, partially paid
let bill2: any = null; // customer bill, fully paid (same customer, so it carries bill1's leftover)
let walkInBill: any = null;
let oldBill: any = null; // dated 2020-01-01 — outside every bounded range, only "all" should include it

let business2Id: bigint | null = null;
let user2Id: bigint | null = null;

const createdBillIds: bigint[] = [];
const createdCustomerIds: bigint[] = [];
const createdItemIds: bigint[] = [];

const EXPECTED_HEADERS = [
  "Sl.No.",
  "Bill ID",
  "Date & Time",
  "Customer Name",
  "Telugu Name",
  "Bill Amount",
  "Amount Paid by Customer",
  "Current Bill Balance",
  "Total Balance",
];

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

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

function rowsByBillId(sheet: ExcelJS.Worksheet): Map<string, ExcelJS.Row> {
  const map = new Map<string, ExcelJS.Row>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const billId = String(row.getCell(2).value);
    map.set(billId, row);
  });
  return map;
}

async function runBillsExportTests() {
  console.log("\n========================================");
  console.log(" BILLS XLSX EXPORT AUTOMATED TESTS");
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

    await runTest("Create customer fixture with Telugu name", async () => {
      const res = await axios.post(
        `${API_URL}/customers`,
        {
          customer_code: `XLSX-CUST-${Date.now()}`,
          english_name: "Ramesh",
          telugu_name: "రమేష్",
          phone: "9333333333",
        },
        { headers: authHeaders() }
      );
      testCustomerId = res.data.data.id;
      createdCustomerIds.push(BigInt(testCustomerId!));
    });

    await runTest("Create item fixture", async () => {
      const catRes = await axios.post(
        `${API_URL}/categories`,
        { name: `XLSX Export Test Category ${Date.now()}` },
        { headers: authHeaders() }
      );
      testCategoryId = catRes.data.data.id;

      const itemRes = await axios.post(
        `${API_URL}/items`,
        {
          item_code: `XLSX-ITEM-${Date.now()}`,
          english_name: `XLSX Export Test Item ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );
      testItemId = itemRes.data.data.id;
      createdItemIds.push(BigInt(testItemId!));

      const unitRes = await axios.post(
        `${API_URL}/items/${testItemId}/units`,
        { unit: "KG", standard_price: 100, is_default: true },
        { headers: authHeaders() }
      );
      testItemUnitId = unitRes.data.data.id;
    });

    await runTest(
      "Create customer bill 1 (partially paid — leaves a balance)",
      async () => {
        const res = await axios.post(
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
        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        bill1 = res.data.data;
        createdBillIds.push(BigInt(bill1.id));

        if (Number(bill1.grand_total) !== 1000) {
          throw new Error(`Expected grand_total 1000, got ${bill1.grand_total}`);
        }
        if (Number(bill1.current_bill_balance) !== 700) {
          throw new Error(
            `Expected current_bill_balance 700, got ${bill1.current_bill_balance}`
          );
        }
      }
    );

    await runTest(
      "Create customer bill 2 (fully paid, carries bill 1's leftover balance)",
      async () => {
        const res = await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "CUSTOMER",
            customer_id: testCustomerId,
            amount_paid: 500,
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
        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        bill2 = res.data.data;
        createdBillIds.push(BigInt(bill2.id));

        if (Number(bill2.grand_total) !== 500) {
          throw new Error(`Expected grand_total 500, got ${bill2.grand_total}`);
        }
        if (Number(bill2.current_bill_balance) !== 0) {
          throw new Error(
            `Expected current_bill_balance 0, got ${bill2.current_bill_balance}`
          );
        }
        // previous 700 (unpaid from bill 1) + this bill's 500 - paid 500 = 700
        if (Number(bill2.overall_balance) !== 700) {
          throw new Error(
            `Expected overall_balance 700, got ${bill2.overall_balance}`
          );
        }
      }
    );

    await runTest("Create walk-in bill", async () => {
      const res = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "WALK_IN",
          amount_paid: 200,
          items: [
            {
              item_id: testItemId,
              item_unit_id: testItemUnitId,
              quantity: 2,
              actual_rate: 100,
            },
          ],
        },
        { headers: authHeaders() }
      );
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      walkInBill = res.data.data;
      createdBillIds.push(BigInt(walkInBill.id));
    });

    await runTest("Create bill dated 2020-01-01 (outside any bounded range)", async () => {
      const res = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "WALK_IN",
          transaction_at: "2020-01-01T10:00:00.000Z",
          amount_paid: 50,
          items: [
            {
              item_id: testItemId,
              item_unit_id: testItemUnitId,
              quantity: 1,
              actual_rate: 50,
            },
          ],
        },
        { headers: authHeaders() }
      );
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
      oldBill = res.data.data;
      createdBillIds.push(BigInt(oldBill.id));
    });

    let sheet1: ExcelJS.Worksheet;

    await runTest("Daily export (range=today) is a valid xlsx with correct headers", async () => {
      const res = await axios.get(`${API_URL}/reports/bills/export?range=today`, {
        headers: authHeaders(),
        responseType: "arraybuffer",
      });

      if (
        res.headers["content-type"] !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        throw new Error(`Unexpected content-type: ${res.headers["content-type"]}`);
      }

      const disposition = res.headers["content-disposition"] as string;
      if (!/^attachment; filename="bills_\d{4}-\d{2}-\d{2}\.xlsx"$/.test(disposition)) {
        throw new Error(`Unexpected filename in content-disposition: ${disposition}`);
      }

      const workbook = await loadWorkbook(Buffer.from(res.data));
      const sheet = workbook.worksheets[0];
      sheet1 = sheet;

      const headerRow = sheet.getRow(1).values as unknown[];
      const headers = EXPECTED_HEADERS.map((_, i) => headerRow[i + 1]);
      if (JSON.stringify(headers) !== JSON.stringify(EXPECTED_HEADERS)) {
        throw new Error(
          `Header mismatch. Expected ${JSON.stringify(EXPECTED_HEADERS)}, got ${JSON.stringify(headers)}`
        );
      }
    });

    await runTest("Weekly export (range=week) includes all 3 test bills", async () => {
      const res = await axios.get(`${API_URL}/reports/bills/export?range=week`, {
        headers: authHeaders(),
        responseType: "arraybuffer",
      });
      const workbook = await loadWorkbook(Buffer.from(res.data));
      const rows = rowsByBillId(workbook.worksheets[0]);

      for (const bill of [bill1, bill2, walkInBill]) {
        if (!rows.has(bill.bill_number)) {
          throw new Error(`Bill ${bill.bill_number} missing from weekly export`);
        }
      }
    });

    await runTest("Monthly export (range=month) includes all 3 test bills", async () => {
      const res = await axios.get(`${API_URL}/reports/bills/export?range=month`, {
        headers: authHeaders(),
        responseType: "arraybuffer",
      });
      const workbook = await loadWorkbook(Buffer.from(res.data));
      const rows = rowsByBillId(workbook.worksheets[0]);

      for (const bill of [bill1, bill2, walkInBill]) {
        if (!rows.has(bill.bill_number)) {
          throw new Error(`Bill ${bill.bill_number} missing from monthly export`);
        }
      }
    });

    await runTest(
      "Monthly export (range=month) excludes the 2020-01-01 bill",
      async () => {
        const res = await axios.get(`${API_URL}/reports/bills/export?range=month`, {
          headers: authHeaders(),
          responseType: "arraybuffer",
        });
        const workbook = await loadWorkbook(Buffer.from(res.data));
        const rows = rowsByBillId(workbook.worksheets[0]);

        if (rows.has(oldBill.bill_number)) {
          throw new Error(
            "2020-01-01-dated bill should not appear in a range=month export"
          );
        }
      }
    );

    await runTest(
      "All-time export (range=all) includes every test bill, including 2020-01-01",
      async () => {
        const res = await axios.get(`${API_URL}/reports/bills/export?range=all`, {
          headers: authHeaders(),
          responseType: "arraybuffer",
        });
        const workbook = await loadWorkbook(Buffer.from(res.data));
        const rows = rowsByBillId(workbook.worksheets[0]);

        for (const bill of [bill1, bill2, walkInBill, oldBill]) {
          if (!rows.has(bill.bill_number)) {
            throw new Error(`Bill ${bill.bill_number} missing from all-time export`);
          }
        }
      }
    );

    await runTest(
      "Custom-range export covering today includes all 3 test bills",
      async () => {
        const today = new Date().toISOString().slice(0, 10);
        const res = await axios.get(
          `${API_URL}/reports/bills/export?range=custom&start_date=${today}&end_date=${today}`,
          { headers: authHeaders(), responseType: "arraybuffer" }
        );

        const disposition = res.headers["content-disposition"] as string;
        if (!disposition.includes(`bills_${today}.xlsx`)) {
          throw new Error(`Expected filename bills_${today}.xlsx, got ${disposition}`);
        }

        const workbook = await loadWorkbook(Buffer.from(res.data));
        const rows = rowsByBillId(workbook.worksheets[0]);

        for (const bill of [bill1, bill2, walkInBill]) {
          if (!rows.has(bill.bill_number)) {
            throw new Error(`Bill ${bill.bill_number} missing from custom-range export`);
          }
        }
      }
    );

    await runTest("Reject custom-range export without dates", async () => {
      try {
        await axios.get(`${API_URL}/reports/bills/export?range=custom`, {
          headers: authHeaders(),
          responseType: "arraybuffer",
        });
        throw new Error("API accepted range=custom without start_date/end_date");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(`Expected 400, got ${error.response?.status ?? error.message}`);
        }
      }
    });

    await runTest("Customer bill row has correct amount/paid/balance values", async () => {
      const res = await axios.get(`${API_URL}/reports/bills/export?range=today`, {
        headers: authHeaders(),
        responseType: "arraybuffer",
      });
      const workbook = await loadWorkbook(Buffer.from(res.data));
      const rows = rowsByBillId(workbook.worksheets[0]);

      const row1 = rows.get(bill1.bill_number);
      if (!row1) throw new Error("Bill 1 row not found");

      if (row1.getCell(4).value !== "Ramesh") {
        throw new Error(`Expected Customer Name "Ramesh", got "${row1.getCell(4).value}"`);
      }
      if (row1.getCell(5).value !== "రమేష్") {
        throw new Error(`Expected Telugu Name "రమేష్", got "${row1.getCell(5).value}"`);
      }
      if (Number(row1.getCell(6).value) !== 1000) {
        throw new Error(`Expected Bill Amount 1000, got ${row1.getCell(6).value}`);
      }
      if (Number(row1.getCell(7).value) !== 300) {
        throw new Error(`Expected Amount Paid 300, got ${row1.getCell(7).value}`);
      }
      if (Number(row1.getCell(8).value) !== 700) {
        throw new Error(`Expected Current Bill Balance 700, got ${row1.getCell(8).value}`);
      }
      if (Number(row1.getCell(9).value) !== 700) {
        throw new Error(`Expected Total Balance 700, got ${row1.getCell(9).value}`);
      }

      const row2 = rows.get(bill2.bill_number);
      if (!row2) throw new Error("Bill 2 row not found");

      if (Number(row2.getCell(8).value) !== 0) {
        throw new Error(`Expected bill 2 Current Bill Balance 0, got ${row2.getCell(8).value}`);
      }
      if (Number(row2.getCell(9).value) !== 700) {
        throw new Error(`Expected bill 2 Total Balance 700, got ${row2.getCell(9).value}`);
      }

      const dateCell = row1.getCell(3).value;
      if (!(dateCell instanceof Date)) {
        throw new Error(`Expected Date & Time cell to be a Date, got ${typeof dateCell}`);
      }
    });

    await runTest("Walk-in bill row handles missing customer fields cleanly", async () => {
      const res = await axios.get(`${API_URL}/reports/bills/export?range=today`, {
        headers: authHeaders(),
        responseType: "arraybuffer",
      });
      const workbook = await loadWorkbook(Buffer.from(res.data));
      const rows = rowsByBillId(workbook.worksheets[0]);

      const row = rows.get(walkInBill.bill_number);
      if (!row) throw new Error("Walk-in bill row not found");

      if (row.getCell(4).value !== "Walk-in Customer") {
        throw new Error(
          `Expected Customer Name "Walk-in Customer", got "${row.getCell(4).value}"`
        );
      }
      if (row.getCell(5).value !== "-") {
        throw new Error(`Expected Telugu Name "-", got "${row.getCell(5).value}"`);
      }
    });

    await runTest("Empty date range produces a valid header-only xlsx", async () => {
      const res = await axios.get(
        `${API_URL}/reports/bills/export?range=custom&start_date=2000-01-01&end_date=2000-01-02`,
        { headers: authHeaders(), responseType: "arraybuffer" }
      );
      const workbook = await loadWorkbook(Buffer.from(res.data));
      const sheet = workbook.worksheets[0];

      if (sheet.rowCount !== 1) {
        throw new Error(
          `Expected only the header row for an empty range, got ${sheet.rowCount} rows`
        );
      }
    });

    await runTest("Reject unauthenticated access to bills export", async () => {
      try {
        await axios.get(`${API_URL}/reports/bills/export?range=today`);
        throw new Error("Unauthenticated request was accepted");
      } catch (error: any) {
        if (error.response?.status !== 401) {
          throw new Error(`Expected 401, got ${error.response?.status ?? error.message}`);
        }
      }
    });

    await runTest("Business isolation — export never leaks another business's bills", async () => {
      const business2 = await prisma.businesses.create({
        data: { name: `Bills Export Test Business 2 ${Date.now()}`, is_active: true },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `bills_export_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Bills Export Test Admin 2",
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

      const res = await axios.get(`${API_URL}/reports/bills/export?range=month`, {
        headers: authHeaders(token2),
        responseType: "arraybuffer",
      });
      const workbook = await loadWorkbook(Buffer.from(res.data));
      const sheet = workbook.worksheets[0];

      if (sheet.rowCount !== 1) {
        throw new Error(
          `Expected business 2's export to be empty (header only), got ${sheet.rowCount} rows`
        );
      }
    });
  } finally {
    try {
      for (const billId of createdBillIds) {
        await prisma.payment_allocations.deleteMany({
          where: { bill_id: billId },
        });
        await prisma.bill_item_weights.deleteMany({
          where: { bill_items: { bill_id: billId } },
        });
        await prisma.bill_items.deleteMany({ where: { bill_id: billId } });
        await prisma.ledger_entries.deleteMany({ where: { bill_id: billId } });
        await prisma.audit_logs.deleteMany({
          where: { entity_type: "bill", entity_id: billId },
        });
        await prisma.bills.deleteMany({ where: { id: billId } });
      }

      if (testCustomerId) {
        await prisma.payments.deleteMany({
          where: { customer_id: BigInt(testCustomerId) },
        });
      }

      for (const customerId of createdCustomerIds) {
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

runBillsExportTests();
