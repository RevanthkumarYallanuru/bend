import axios from "axios";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let testCustomerId: string | null = null;
let testCategoryId: string | null = null;
let testItemId1: string | null = null;
let testItemUnitId1: string | null = null;
let testItemId2: string | null = null;
let testItemUnitId2: string | null = null;

let testCustomerBillId: string | null = null;
let testCustomerBillNumber: string | null = null;
let testWalkInBillId: string | null = null;
let testCancellableBillId: string | null = null;

const createdBillIds: bigint[] = [];
const createdCustomerIds: bigint[] = [];
const createdItemIds: bigint[] = [];

const results: {
  test: string;
  status: "PASS" | "FAIL";
  details?: string;
}[] = [];

function pass(name: string, details?: string) {
  results.push({
    test: name,
    status: "PASS",
    details,
  });
}

function fail(name: string, error: unknown) {
  const details =
    error instanceof Error ? error.message : String(error);

  results.push({
    test: name,
    status: "FAIL",
    details,
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

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function runBillingTests() {
  console.log("\n========================================");
  console.log(" BILLING API AUTOMATED TESTS");
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
      const custCode = `BILL-CUST-${Date.now()}`;
      const response = await axios.post(
        `${API_URL}/customers`,
        {
          customer_code: custCode,
          english_name: "Billing Test Customer",
          phone: "9876543210",
          place: "Test Store",
          address: "123 Main St",
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
    });

    /*
     * 3. CREATE ITEM TEST FIXTURES
     */
    await runTest("Create item test fixtures", async () => {
      const catRes = await axios.post(
        `${API_URL}/categories`,
        { name: `Billing Test Category ${Date.now()}` },
        { headers: authHeaders() }
      );

      if (catRes.status !== 201 || !catRes.data?.data?.id) {
        throw new Error("Failed to create a category fixture for item fixtures");
      }
      testCategoryId = catRes.data.data.id;

      const code1 = `BILL-ITEM1-${Date.now()}`;
      const res1 = await axios.post(
        `${API_URL}/items`,
        {
          item_code: code1,
          english_name: `Billing Item 1 ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );

      testItemId1 = res1.data.data.id;
      if (testItemId1) {
        createdItemIds.push(BigInt(testItemId1));
      }

      const unitRes1 = await axios.post(
        `${API_URL}/items/${testItemId1}/units`,
        {
          unit: "KG",
          standard_price: 50,
          is_default: true,
        },
        { headers: authHeaders() }
      );

      testItemUnitId1 = unitRes1.data.data.id;

      const code2 = `BILL-ITEM2-${Date.now()}`;
      const res2 = await axios.post(
        `${API_URL}/items`,
        {
          item_code: code2,
          english_name: `Billing Item 2 ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );

      testItemId2 = res2.data.data.id;
      if (testItemId2) {
        createdItemIds.push(BigInt(testItemId2));
      }

      const unitRes2 = await axios.post(
        `${API_URL}/items/${testItemId2}/units`,
        {
          unit: "BOX",
          standard_price: 50,
          is_default: true,
        },
        { headers: authHeaders() }
      );

      testItemUnitId2 = unitRes2.data.data.id;
    });

    /*
     * 4. CREATE CUSTOMER BILL
     */
    let customerBillData: any = null;

    await runTest("Create customer bill", async () => {
      const response = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "CUSTOMER",
          customer_id: testCustomerId,
          discount: 15,
          amount_paid: 500,
          notes: "Automated test customer bill",
          items: [
            {
              item_id: testItemId1,
              item_unit_id: testItemUnitId1,
              quantity: 10,
              actual_rate: 50,
              discount: 0,
            },
            {
              item_id: testItemId2,
              item_unit_id: testItemUnitId2,
              quantity: 5,
              actual_rate: 45,
              discount: 10,
            },
          ],
        },
        { headers: authHeaders() }
      );

      if (response.status !== 201 || !response.data.success) {
        throw new Error(`Expected 201, received ${response.status}`);
      }

      customerBillData = response.data.data;
      testCustomerBillId = customerBillData.id;
      testCustomerBillNumber = customerBillData.bill_number;

      if (testCustomerBillId) {
        createdBillIds.push(BigInt(testCustomerBillId));
      }
    });

    /*
     * 5. VALIDATE BILL NUMBER
     */
    await runTest("Bill number generated", async () => {
      if (!testCustomerBillNumber || !/^BILL-\d+$/.test(testCustomerBillNumber)) {
        throw new Error(`Invalid bill number format: ${testCustomerBillNumber}`);
      }
    });

    /*
     * 6. VALIDATE BILL SUBTOTAL CALCULATION
     */
    await runTest("Bill subtotal calculation", async () => {
      // Line 1: (10 * 50) - 0 = 500
      // Line 2: (5 * 45) - 10 = 215
      // Subtotal = 715
      if (customerBillData.subtotal !== "715" && customerBillData.subtotal !== "715.00") {
        throw new Error(`Expected subtotal 715, got ${customerBillData.subtotal}`);
      }
    });

    /*
     * 7. VALIDATE BILL DISCOUNT CALCULATION
     */
    await runTest("Bill discount calculation", async () => {
      if (customerBillData.discount !== "15" && customerBillData.discount !== "15.00") {
        throw new Error(`Expected discount 15, got ${customerBillData.discount}`);
      }
    });

    /*
     * 8. VALIDATE BILL GRAND TOTAL CALCULATION
     */
    await runTest("Bill grand total calculation", async () => {
      // 715 - 15 = 700
      if (customerBillData.grand_total !== "700" && customerBillData.grand_total !== "700.00") {
        throw new Error(`Expected grand_total 700, got ${customerBillData.grand_total}`);
      }
    });

    /*
     * 9. CUSTOM PRICING PRESERVED
     */
    await runTest("Custom pricing preserved", async () => {
      const item2Line = customerBillData.bill_items.find(
        (item: any) => item.item_id === testItemId2
      );

      if (!item2Line) {
        throw new Error("Item 2 not found in bill items");
      }

      if (item2Line.actual_rate !== "45" && item2Line.actual_rate !== "45.00") {
        throw new Error(`Expected actual_rate 45, got ${item2Line.actual_rate}`);
      }
    });

    /*
     * 10. STANDARD PRICE PRESERVED
     */
    await runTest("Standard price preserved", async () => {
      const item2Line = customerBillData.bill_items.find(
        (item: any) => item.item_id === testItemId2
      );

      if (item2Line.standard_rate !== "50" && item2Line.standard_rate !== "50.00") {
        throw new Error(`Expected standard_rate 50, got ${item2Line.standard_rate}`);
      }

      // Verify master item unit standard price was NOT mutated
      const unit = await prisma.item_units.findUnique({
        where: { id: BigInt(testItemUnitId2!) },
      });

      if (unit?.standard_price.toString() !== "50") {
        throw new Error("Master price was modified!");
      }
    });

    /*
     * 11. CUSTOMER SNAPSHOT PRESERVED
     */
    await runTest("Customer snapshot preserved", async () => {
      if (customerBillData.customer_name_snapshot !== "Billing Test Customer") {
        throw new Error(`Expected snapshot name 'Billing Test Customer', got '${customerBillData.customer_name_snapshot}'`);
      }
      if (customerBillData.customer_phone_snapshot !== "9876543210") {
        throw new Error(`Expected snapshot phone '9876543210', got '${customerBillData.customer_phone_snapshot}'`);
      }
    });

    /*
     * 12. PREVIOUS BALANCE CALCULATED
     */
    await runTest("Previous balance calculated", async () => {
      if (customerBillData.previous_balance !== "0" && customerBillData.previous_balance !== "0.00") {
        throw new Error(`Expected previous_balance 0, got ${customerBillData.previous_balance}`);
      }
    });

    /*
     * 13. CURRENT BILL BALANCE CALCULATED
     */
    await runTest("Current bill balance calculated", async () => {
      // Grand total = 700, amount paid = 500 => current_bill_balance = 200
      if (customerBillData.current_bill_balance !== "200" && customerBillData.current_bill_balance !== "200.00") {
        throw new Error(`Expected current_bill_balance 200, got ${customerBillData.current_bill_balance}`);
      }
    });

    /*
     * 14. OVERALL BALANCE CALCULATED
     */
    await runTest("Overall balance calculated", async () => {
      // Previous = 0, current = 200 => overall_balance = 200
      if (customerBillData.overall_balance !== "200" && customerBillData.overall_balance !== "200.00") {
        throw new Error(`Expected overall_balance 200, got ${customerBillData.overall_balance}`);
      }
    });

    /*
     * 15. GET BILL BY ID
     */
    await runTest("Get bill by ID", async () => {
      const response = await axios.get(
        `${API_URL}/bills/${testCustomerBillId}`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || !response.data.success) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (response.data.data.id !== testCustomerBillId) {
        throw new Error("Returned bill ID does not match");
      }
    });

    /*
     * 16. GET BILL BY NUMBER
     */
    await runTest("Get bill by number", async () => {
      const response = await axios.get(
        `${API_URL}/bills/number/${testCustomerBillNumber}`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || !response.data.success) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (response.data.data.bill_number !== testCustomerBillNumber) {
        throw new Error("Returned bill number does not match");
      }
    });

    /*
     * 17. LIST BILLS
     */
    await runTest("List bills", async () => {
      const response = await axios.get(
        `${API_URL}/bills`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || !response.data.success) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (!Array.isArray(response.data.data) || response.data.count < 1) {
        throw new Error("List bills returned empty array");
      }
    });

    /*
     * 18. SEARCH BILLS
     */
    await runTest("Search bills", async () => {
      const response = await axios.get(
        `${API_URL}/bills?search=${encodeURIComponent(testCustomerBillNumber!)}`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || response.data.count < 1) {
        throw new Error("Search failed to find created bill");
      }
    });


    /*
     * 15a. LEDGER + PAYMENT INTEGRATION FOR CUSTOMER BILL
     */
    await runTest("Initial payment, allocation and ledger created", async () => {
      const billId = BigInt(testCustomerBillId!);

      const allocations = await prisma.payment_allocations.findMany({
        where: { bill_id: billId },
        include: { payments: true },
      });

      if (allocations.length !== 1) {
        throw new Error(`Expected 1 allocation, got ${allocations.length}`);
      }

      if (allocations[0].allocated_amount.toString() !== "500") {
        throw new Error("Allocated amount should be 500");
      }

      if (!allocations[0].payments.payment_number) {
        throw new Error("Payment number missing");
      }

      const ledger = await prisma.ledger_entries.findMany({
        where: { bill_id: billId },
        orderBy: { id: "asc" },
      });

      if (ledger.length !== 2) {
        throw new Error(`Expected 2 ledger entries, got ${ledger.length}`);
      }

      if (
        ledger[0].entry_type !== "SALE" ||
        ledger[0].debit.toString() !== "700" ||
        ledger[0].balance_after.toString() !== "700"
      ) {
        throw new Error("SALE ledger entry is incorrect");
      }

      if (
        ledger[1].entry_type !== "PAYMENT" ||
        ledger[1].credit.toString() !== "500" ||
        ledger[1].balance_after.toString() !== "200"
      ) {
        throw new Error("PAYMENT ledger entry is incorrect");
      }
    });

    /*
     * 15b. AUDIT LOG FOR CREATE
     */
    await runTest("Audit log written for bill creation", async () => {
      const logs = await prisma.audit_logs.findMany({
        where: {
          entity_type: "bill",
          entity_id: BigInt(testCustomerBillId!),
          action: "CREATE",
        },
      });

      if (logs.length !== 1) {
        throw new Error(`Expected 1 CREATE audit log, got ${logs.length}`);
      }
    });

    /*
     * 15c. SECOND BILL CARRIES PREVIOUS BALANCE FORWARD
     */
    let secondBillId: string | null = null;

    await runTest("Second bill carries previous balance forward", async () => {
      const response = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "CUSTOMER",
          customer_id: testCustomerId,
          amount_paid: 0,
          items: [
            {
              item_id: testItemId1,
              item_unit_id: testItemUnitId1,
              quantity: 2,
              actual_rate: 50,
            },
          ],
        },
        { headers: authHeaders() }
      );

      const bill = response.data.data;
      secondBillId = bill.id;
      createdBillIds.push(BigInt(bill.id));

      // previous 200 + current 100 = 300
      if (Number(bill.previous_balance) !== 200) {
        throw new Error(`Expected previous_balance 200, got ${bill.previous_balance}`);
      }
      if (Number(bill.current_bill_balance) !== 100) {
        throw new Error(`Expected current_bill_balance 100, got ${bill.current_bill_balance}`);
      }
      if (Number(bill.overall_balance) !== 300) {
        throw new Error(`Expected overall_balance 300, got ${bill.overall_balance}`);
      }
    });

    /*
     * 15d. STANDARD RATE USED WHEN actual_rate OMITTED
     */
    await runTest("Default rate uses standard price when actual_rate omitted", async () => {
      const response = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "WALK_IN",
          items: [{ item_id: testItemId1, quantity: 1 }],
        },
        { headers: authHeaders() }
      );

      const bill = response.data.data;
      createdBillIds.push(BigInt(bill.id));

      const line = bill.bill_items[0];
      if (Number(line.actual_rate) !== 50 || Number(line.standard_rate) !== 50) {
        throw new Error("Expected both rates to equal master price 50");
      }
      if (Number(bill.grand_total) !== 50) {
        throw new Error(`Expected grand_total 50, got ${bill.grand_total}`);
      }
    });

    /*
     * 15e. DATE FILTERING
     */
    await runTest("Date filter includes and excludes bills", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const inRange = await axios.get(
        `${API_URL}/bills?customer_id=${testCustomerId}&start_date=${today}&end_date=${today}`,
        { headers: authHeaders() }
      );

      if (inRange.data.count < 2) {
        throw new Error(`Expected >=2 bills today, got ${inRange.data.count}`);
      }

      const outOfRange = await axios.get(
        `${API_URL}/bills?customer_id=${testCustomerId}&start_date=2000-01-01&end_date=2000-01-31`,
        { headers: authHeaders() }
      );

      if (outOfRange.data.count !== 0) {
        throw new Error("Expected 0 bills for year 2000");
      }
    });

    /*
     * 15f. FILTER BY CUSTOMER, TYPE AND STATUS
     */
    await runTest("Filter bills by customer, type and status", async () => {
      const response = await axios.get(
        `${API_URL}/bills?customer_id=${testCustomerId}&bill_type=CUSTOMER&bill_status=COMPLETED`,
        { headers: authHeaders() }
      );

      const bills = response.data.data;
      if (bills.length < 2) {
        throw new Error("Expected at least 2 completed customer bills");
      }
      if (bills.some((b: any) => b.customer_id !== testCustomerId || b.bill_type !== "CUSTOMER")) {
        throw new Error("Filter returned unrelated bills");
      }
    });

    /*
     * 15g. SEARCH BY CUSTOMER NAME / PHONE
     */
    await runTest("Search bills by customer name and phone", async () => {
      const byName = await axios.get(
        `${API_URL}/bills?search=${encodeURIComponent("Billing Test Customer")}`,
        { headers: authHeaders() }
      );
      const byPhone = await axios.get(
        `${API_URL}/bills?search=9876543210`,
        { headers: authHeaders() }
      );

      if (byName.data.count < 1 || byPhone.data.count < 1) {
        throw new Error("Search by name/phone returned nothing");
      }
    });

    /*
     * 15h. NOT FOUND HANDLING
     */
    await runTest("Unknown bill returns 404", async () => {
      for (const url of [
        `${API_URL}/bills/999999999`,
        `${API_URL}/bills/number/BILL-DOES-NOT-EXIST`,
      ]) {
        try {
          await axios.get(url, { headers: authHeaders() });
          throw new Error(`Expected 404 for ${url}`);
        } catch (error: any) {
          if (error.response?.status !== 404) {
            throw new Error(`Expected 404 for ${url}, got ${error.response?.status}`);
          }
        }
      }
    });

    /*
     * 15i. WALK-IN WITH CUSTOMER ID REJECTED
     */
    await runTest("Reject walk-in bill with customer_id", async () => {
      try {
        await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "WALK_IN",
            customer_id: testCustomerId,
            items: [{ item_id: testItemId1, quantity: 1 }],
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted walk-in bill with customer_id");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(`Expected HTTP 400, got ${error.response?.status}`);
        }
      }
    });

    /*
     * 15j. BILL DISCOUNT GREATER THAN SUBTOTAL
     */
    await runTest("Reject bill discount greater than subtotal", async () => {
      try {
        await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "WALK_IN",
            discount: 1000,
            items: [{ item_id: testItemId1, quantity: 1, actual_rate: 50 }],
          },
          { headers: authHeaders() }
        );
        throw new Error("API accepted discount > subtotal");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(`Expected HTTP 400, got ${error.response?.status}`);
        }
      }
    });

    /*
     * 15k. CANCELLING A BILL WITH ALLOCATED PAYMENTS IS REFUSED
     */
    await runTest("Reject cancelling bill with allocated payments (409)", async () => {
      try {
        await axios.patch(
          `${API_URL}/bills/${testCustomerBillId}/cancel`,
          {},
          { headers: authHeaders() }
        );
        throw new Error("API cancelled a bill that has allocated payments");
      } catch (error: any) {
        if (error.response?.status !== 409) {
          throw new Error(`Expected HTTP 409, got ${error.response?.status}`);
        }
      }

      const bill = await prisma.bills.findUnique({
        where: { id: BigInt(testCustomerBillId!) },
      });
      if (bill?.status !== "COMPLETED") {
        throw new Error("Refused cancellation still changed bill status");
      }
    });

    /*
     * 15l. CANCELLING A CUSTOMER BILL REVERSES ITS LEDGER EFFECT
     */
    await runTest("Cancel customer bill reverses customer balance", async () => {
      const cancelRes = await axios.patch(
        `${API_URL}/bills/${secondBillId}/cancel`,
        {},
        { headers: authHeaders() }
      );

      if (cancelRes.data.data.status !== "CANCELLED") {
        throw new Error("Second bill was not cancelled");
      }

      const latest = await prisma.ledger_entries.findFirst({
        where: { customer_id: BigInt(testCustomerId!) },
        orderBy: [{ transaction_at: "desc" }, { id: "desc" }],
      });

      if (latest?.balance_after.toString() !== "200") {
        throw new Error(`Expected customer balance back to 200, got ${latest?.balance_after}`);
      }

      const logs = await prisma.audit_logs.findMany({
        where: {
          entity_type: "bill",
          entity_id: BigInt(secondBillId!),
          action: "CANCEL",
        },
      });
      if (logs.length !== 1) {
        throw new Error("CANCEL audit log missing");
      }

      // Original SALE entry must still exist (history preserved)
      const entries = await prisma.ledger_entries.count({
        where: { bill_id: BigInt(secondBillId!) },
      });
      if (entries !== 2) {
        throw new Error(`Expected SALE + reversal (2 entries), got ${entries}`);
      }
    });

    /*
     * 15m. CANCELLING TWICE IS A CONFLICT
     */
    await runTest("Reject cancelling an already cancelled bill (409)", async () => {
      try {
        await axios.patch(
          `${API_URL}/bills/${secondBillId}/cancel`,
          {},
          { headers: authHeaders() }
        );
        throw new Error("API cancelled a bill twice");
      } catch (error: any) {
        if (error.response?.status !== 409) {
          throw new Error(`Expected HTTP 409, got ${error.response?.status}`);
        }
      }
    });

    /*
     * 15n. AUTH REQUIRED ON EVERY ENDPOINT
     */
    await runTest("Reject unauthenticated access on all bill endpoints", async () => {
      const calls = [
        () => axios.post(`${API_URL}/bills`, {}),
        () => axios.get(`${API_URL}/bills/1`),
        () => axios.get(`${API_URL}/bills/number/BILL-000001`),
        () => axios.patch(`${API_URL}/bills/1/cancel`),
        () => axios.get(`${API_URL}/bills`, { headers: { Authorization: "Bearer invalid.token" } }),
      ];

      for (const call of calls) {
        try {
          await call();
          throw new Error("Request without valid token was accepted");
        } catch (error: any) {
          if (error.response?.status !== 401) {
            throw new Error(`Expected 401, got ${error.response?.status ?? error.message}`);
          }
        }
      }
    });

    /*
     * 19. CREATE WALK-IN BILL
     */
    await runTest("Create walk-in bill", async () => {
      const response = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "WALK_IN",
          discount: 0,
          amount_paid: 100,
          notes: "Automated walk-in bill",
          items: [
            {
              item_id: testItemId1,
              item_unit_id: testItemUnitId1,
              quantity: 2,
              actual_rate: 50,
            },
          ],
        },
        { headers: authHeaders() }
      );

      if (response.status !== 201 || !response.data.success) {
        throw new Error(`Expected 201, got ${response.status}`);
      }

      const walkInBill = response.data.data;
      testWalkInBillId = walkInBill.id;

      if (testWalkInBillId) {
        createdBillIds.push(BigInt(testWalkInBillId));
      }

      if (walkInBill.customer_id !== null) {
        throw new Error("Walk-in bill should have null customer_id");
      }
    });

    /*
     * 20. VERIFY WALK-IN BILL HAS NO CUSTOMER LEDGER
     */
    await runTest("Verify walk-in bill has no customer ledger", async () => {
      if (!testWalkInBillId) {
        throw new Error("No walk-in bill ID available");
      }

      const ledgerEntries = await prisma.ledger_entries.findMany({
        where: { bill_id: BigInt(testWalkInBillId) },
      });

      if (ledgerEntries.length > 0) {
        throw new Error("Walk-in bill generated ledger entries!");
      }
    });

    /*
     * 21. REJECT INVALID QUANTITY
     */
    await runTest("Reject invalid quantity", async () => {
      try {
        await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "WALK_IN",
            items: [
              {
                item_id: testItemId1,
                quantity: -1,
              },
            ],
          },
          { headers: authHeaders() }
        );

        throw new Error("API accepted negative quantity");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(`Expected HTTP 400, got ${error.response?.status}`);
        }
      }
    });

    /*
     * 22. REJECT INVALID DISCOUNT
     */
    await runTest("Reject invalid discount", async () => {
      try {
        await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "WALK_IN",
            discount: -50,
            items: [
              {
                item_id: testItemId1,
                quantity: 1,
              },
            ],
          },
          { headers: authHeaders() }
        );

        throw new Error("API accepted negative bill discount");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(`Expected HTTP 400, got ${error.response?.status}`);
        }
      }
    });

    /*
     * 23. REJECT INVALID AMOUNT PAID
     */
    await runTest("Reject invalid amount paid", async () => {
      try {
        await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "WALK_IN",
            amount_paid: 99999, // Exceeds grand total
            items: [
              {
                item_id: testItemId1,
                quantity: 1,
                actual_rate: 50,
              },
            ],
          },
          { headers: authHeaders() }
        );

        throw new Error("API accepted amount_paid exceeding grand total");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(`Expected HTTP 400, got ${error.response?.status}`);
        }
      }
    });

    /*
     * 24. REJECT CUSTOMER BILL WITHOUT CUSTOMER
     */
    await runTest("Reject customer bill without customer", async () => {
      try {
        await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "CUSTOMER",
            items: [
              {
                item_id: testItemId1,
                quantity: 1,
              },
            ],
          },
          { headers: authHeaders() }
        );

        throw new Error("API accepted CUSTOMER bill without customer_id");
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(`Expected HTTP 400, got ${error.response?.status}`);
        }
      }
    });

    /*
     * 25. REJECT INVALID ITEM
     */
    await runTest("Reject invalid item", async () => {
      try {
        await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "WALK_IN",
            items: [
              {
                item_id: "999999999",
                quantity: 1,
              },
            ],
          },
          { headers: authHeaders() }
        );

        throw new Error("API accepted non-existent item_id");
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(`Expected HTTP 404, got ${error.response?.status}`);
        }
      }
    });

    /*
     * 26. REJECT UNAUTHORIZED REQUEST
     */
    await runTest("Reject unauthorized request", async () => {
      try {
        await axios.get(`${API_URL}/bills`);
        throw new Error("API accepted request without token");
      } catch (error: any) {
        if (error.response?.status !== 401) {
          throw new Error(`Expected HTTP 401, got ${error.response?.status}`);
        }
      }
    });

    /*
     * 27. CANCEL BILL
     */
    await runTest("Cancel bill", async () => {
      // Create a zero-payment bill specifically for cancellation test
      const res = await axios.post(
        `${API_URL}/bills`,
        {
          bill_type: "WALK_IN",
          discount: 0,
          amount_paid: 0,
          notes: "Bill to be cancelled",
          items: [
            {
              item_id: testItemId1,
              item_unit_id: testItemUnitId1,
              quantity: 1,
              actual_rate: 50,
            },
          ],
        },
        { headers: authHeaders() }
      );

      testCancellableBillId = res.data.data.id;

      if (testCancellableBillId) {
        createdBillIds.push(BigInt(testCancellableBillId));
      }

      const cancelRes = await axios.patch(
        `${API_URL}/bills/${testCancellableBillId}/cancel`,
        {},
        { headers: authHeaders() }
      );

      if (cancelRes.status !== 200 || !cancelRes.data.success) {
        throw new Error(`Cancel failed with status ${cancelRes.status}`);
      }

      if (cancelRes.data.data.status !== "CANCELLED") {
        throw new Error(`Expected status CANCELLED, got ${cancelRes.data.data.status}`);
      }
    });

    /*
     * 28. CANCELLED BILL REMAINS IN DATABASE
     */
    await runTest("Cancelled bill remains in database", async () => {
      if (!testCancellableBillId) {
        throw new Error("No cancellable bill ID available");
      }

      const response = await axios.get(
        `${API_URL}/bills/${testCancellableBillId}`,
        { headers: authHeaders() }
      );

      if (response.status !== 200 || !response.data.success) {
        throw new Error("Cancelled bill could not be retrieved");
      }

      if (response.data.data.status !== "CANCELLED") {
        throw new Error(`Expected status CANCELLED, got ${response.data.data.status}`);
      }
    });

    /*
     * 29. CANCELLATION REASON RECORDED (Phase 2: Cancellation + Audit)
     */
    await runTest(
      "Cancel bill with reason records reason in ledger and audit log",
      async () => {
        const res = await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "CUSTOMER",
            customer_id: testCustomerId,
            amount_paid: 0,
            notes: "Bill to be cancelled with a reason",
            items: [
              {
                item_id: testItemId1,
                item_unit_id: testItemUnitId1,
                quantity: 1,
                actual_rate: 50,
              },
            ],
          },
          { headers: authHeaders() }
        );

        const billId = res.data.data.id;
        createdBillIds.push(BigInt(billId));

        const cancelRes = await axios.patch(
          `${API_URL}/bills/${billId}/cancel`,
          { reason: "Customer changed order" },
          { headers: authHeaders() }
        );

        if (
          cancelRes.status !== 200 ||
          cancelRes.data.data.status !== "CANCELLED"
        ) {
          throw new Error("Bill cancellation with reason failed");
        }

        const reversalEntry = await prisma.ledger_entries.findFirst({
          where: {
            bill_id: BigInt(billId),
            entry_type: "ADJUSTMENT",
          },
        });

        if (
          !reversalEntry?.description?.includes(
            "Customer changed order"
          )
        ) {
          throw new Error(
            `Expected ledger reversal description to include reason, got "${reversalEntry?.description}"`
          );
        }

        const auditLog = await prisma.audit_logs.findFirst({
          where: {
            entity_type: "bill",
            entity_id: BigInt(billId),
            action: "CANCEL",
          },
          orderBy: { id: "desc" },
        });

        const newData = auditLog?.new_data as any;
        if (newData?.cancellation_reason !== "Customer changed order") {
          throw new Error(
            `Expected cancellation_reason recorded, got ${JSON.stringify(
              newData?.cancellation_reason
            )}`
          );
        }
      }
    );

    /*
     * VARIABLE-WEIGHT UNITS (bags/sacks billed by actual kg weight)
     */
    let weightItemId: string | null = null;
    let weightUnitId: string | null = null;

    await runTest("Create weight-variable item unit fixture", async () => {
      const itemRes = await axios.post(
        `${API_URL}/items`,
        {
          item_code: `WEIGHT-ITEM-${Date.now()}`,
          english_name: `Weight Test Item ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );

      if (itemRes.status !== 201) {
        throw new Error("Failed to create weight-variable item fixture");
      }

      weightItemId = itemRes.data.data.id;
      createdItemIds.push(BigInt(weightItemId!));

      const unitRes = await axios.post(
        `${API_URL}/items/${weightItemId}/units`,
        {
          unit: "Bags",
          standard_price: 50,
          is_default: true,
          is_weight_variable: true,
        },
        { headers: authHeaders() }
      );

      if (unitRes.status !== 201 || unitRes.data.data.is_weight_variable !== true) {
        throw new Error("Failed to create weight-variable unit fixture");
      }

      weightUnitId = unitRes.data.data.id;
    });

    let weightBillData: any = null;

    await runTest(
      "Create bill with variable-weight line computes total from container weights",
      async () => {
        const response = await axios.post(
          `${API_URL}/bills`,
          {
            bill_type: "CUSTOMER",
            customer_id: testCustomerId,
            amount_paid: 0,
            items: [
              {
                item_id: weightItemId,
                item_unit_id: weightUnitId,
                quantity: 5,
                actual_rate: 50,
                weights: [48, 51, 49.5, 50, 52],
              },
            ],
          },
          { headers: authHeaders() }
        );

        if (response.status !== 201) {
          throw new Error(
            `Expected 201, got ${response.status}: ${JSON.stringify(response.data)}`
          );
        }

        weightBillData = response.data.data;
        createdBillIds.push(BigInt(weightBillData.id));

        const line = weightBillData.bill_items[0];

        if (line.unit !== "kg") {
          throw new Error(`Expected unit "kg", got "${line.unit}"`);
        }

        if (Number(line.quantity) !== 250.5) {
          throw new Error(`Expected quantity 250.5, got ${line.quantity}`);
        }

        if (Number(line.total_weight_kg) !== 250.5) {
          throw new Error(
            `Expected total_weight_kg 250.5, got ${line.total_weight_kg}`
          );
        }

        if (Number(line.line_total) !== 12525) {
          throw new Error(`Expected line_total 12525, got ${line.line_total}`);
        }
      }
    );

    await runTest(
      "Weight breakdown rows recorded, one per container",
      async () => {
        const line = weightBillData.bill_items[0];

        const rows = await prisma.bill_item_weights.findMany({
          where: { bill_item_id: BigInt(line.id) },
          orderBy: { sequence: "asc" },
        });

        const expected = [48, 51, 49.5, 50, 52];

        if (rows.length !== expected.length) {
          throw new Error(
            `Expected ${expected.length} weight rows, got ${rows.length}`
          );
        }

        for (const [i, row] of rows.entries()) {
          if (Number(row.weight_kg) !== expected[i]) {
            throw new Error(
              `Row ${i + 1}: expected ${expected[i]}kg, got ${row.weight_kg}kg`
            );
          }
        }
      }
    );

    await runTest(
      "Reject weight-variable line when weight count doesn't match quantity",
      async () => {
        try {
          await axios.post(
            `${API_URL}/bills`,
            {
              bill_type: "CUSTOMER",
              customer_id: testCustomerId,
              amount_paid: 0,
              items: [
                {
                  item_id: weightItemId,
                  item_unit_id: weightUnitId,
                  quantity: 5,
                  actual_rate: 50,
                  weights: [48, 51],
                },
              ],
            },
            { headers: authHeaders() }
          );
          throw new Error("Expected request to be rejected");
        } catch (error: any) {
          if (error.response?.status !== 400) {
            throw new Error(
              `Expected 400, got ${error.response?.status ?? error.message}`
            );
          }
        }
      }
    );

    await runTest(
      "Reject non-integer container quantity for weight-variable unit",
      async () => {
        try {
          await axios.post(
            `${API_URL}/bills`,
            {
              bill_type: "CUSTOMER",
              customer_id: testCustomerId,
              amount_paid: 0,
              items: [
                {
                  item_id: weightItemId,
                  item_unit_id: weightUnitId,
                  quantity: 2.5,
                  actual_rate: 50,
                  weights: [10, 12],
                },
              ],
            },
            { headers: authHeaders() }
          );
          throw new Error("Expected request to be rejected");
        } catch (error: any) {
          if (error.response?.status !== 400) {
            throw new Error(
              `Expected 400, got ${error.response?.status ?? error.message}`
            );
          }
        }
      }
    );
  } finally {
    /*
     * CLEANUP TEST FIXTURES
     */
    try {
      for (const billId of createdBillIds) {
        await prisma.payment_allocations.deleteMany({ where: { bill_id: billId } });
        await prisma.ledger_entries.deleteMany({ where: { bill_id: billId } });
        await prisma.audit_logs.deleteMany({ where: { entity_type: "bill", entity_id: billId } });
        await prisma.stock_movements.deleteMany({ where: { bill_id: billId } });
        await prisma.bill_items.deleteMany({ where: { bill_id: billId } });
        await prisma.bills.deleteMany({ where: { id: billId } });
      }

      for (const itemId of createdItemIds) {
        await prisma.stock_movements.deleteMany({ where: { item_id: itemId } });
        await prisma.item_units.deleteMany({ where: { item_id: itemId } });
        await prisma.items.deleteMany({ where: { id: itemId } });
      }

      if (testCategoryId) {
        await prisma.categories.deleteMany({ where: { id: BigInt(testCategoryId) } });
      }

      for (const customerId of createdCustomerIds) {
        await prisma.payments.deleteMany({ where: { customer_id: customerId } });
        await prisma.ledger_entries.deleteMany({ where: { customer_id: customerId } });
        await prisma.customers.deleteMany({ where: { id: customerId } });
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

runBillingTests();
