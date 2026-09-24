import { prisma } from "./config/database";

const REAL_ITEM_IDS = [
  147, 148, 157, 158, 159, 160, 161, 168, 171, 184, 185, 197, 216, 262, 263,
  264, 265, 266, 267, 268,
].map(BigInt);

const REAL_CATEGORY_IDS = [49, 58].map(BigInt);

// Test suppliers currently present, enumerated by exact id from the audit
// (all "Import Test Supplier <ts>" / "Dbg Supplier <ts>").
const TEST_SUPPLIER_IDS = [31, 34, 40, 47, 56, 67, 83].map(BigInt);

// Customer 189 ("Automated Test Customer") has a real linked COMPLETED
// bill (BILL-000406, ₹260) — confirmed still true — so it is deliberately
// preserved, exactly as decided earlier this session.
const PRESERVE_CUSTOMER_IDS = [189n];

const TEST_CUSTOMER_CODE_PREFIXES = [
  "BILL-CUST-",
  "PAY-CUST-",
  "PAY-CUSTB-",
  "LEDGER-CUST-",
  "RPT-CUST-",
  "XLSX-CUST-",
  "INV-CUST-",
];

async function main() {
  // ---------------------------------------------------------------
  // Part A: wholesale removal of every "Test Business 2" isolation
  // fixture (business_id != 1). None of this touches the real
  // business (id=1) or anything under it.
  // ---------------------------------------------------------------
  const otherBusinesses = await prisma.businesses.findMany({
    where: { id: { not: 1n } },
    select: { id: true },
  });
  const otherBusinessIds = otherBusinesses.map((b) => b.id);
  console.log(`Part A: ${otherBusinessIds.length} test businesses to remove`);

  if (otherBusinessIds.length > 0) {
    const where = { business_id: { in: otherBusinessIds } };

    const otherItems = await prisma.items.findMany({
      where,
      select: { id: true },
    });
    const otherItemIds = otherItems.map((i) => i.id);
    const otherBills = await prisma.bills.findMany({
      where,
      select: { id: true },
    });
    const otherBillIds = otherBills.map((b) => b.id);
    const otherPayments = await prisma.payments.findMany({
      where,
      select: { id: true },
    });
    const otherPaymentIds = otherPayments.map((p) => p.id);
    const otherPayables = await prisma.payables.findMany({
      where,
      select: { id: true },
    });
    const otherPayableIds = otherPayables.map((p) => p.id);
    const otherSupplierPayments = await prisma.supplier_payments.findMany({
      where,
      select: { id: true },
    });
    const otherSupplierPaymentIds = otherSupplierPayments.map((p) => p.id);

    await prisma.stock_movements.deleteMany({ where });
    await prisma.payment_allocations.deleteMany({
      where: { OR: [{ payment_id: { in: otherPaymentIds } }, { bill_id: { in: otherBillIds } }] },
    });
    await prisma.bill_item_weights.deleteMany({
      where: { bill_items: { bill_id: { in: otherBillIds } } },
    });
    await prisma.bill_items.deleteMany({ where: { bill_id: { in: otherBillIds } } });
    await prisma.bill_deliveries.deleteMany({ where: { bill_id: { in: otherBillIds } } });
    await prisma.ledger_entries.deleteMany({ where });
    await prisma.audit_logs.deleteMany({ where });
    await prisma.payable_payments.deleteMany({
      where: {
        OR: [
          { payable_id: { in: otherPayableIds } },
          { supplier_payment_id: { in: otherSupplierPaymentIds } },
        ],
      },
    });
    await prisma.payables.deleteMany({ where });
    await prisma.supplier_payments.deleteMany({ where });
    await prisma.imports.deleteMany({ where });
    await prisma.bills.deleteMany({ where });
    await prisma.payments.deleteMany({ where });
    await prisma.item_units.deleteMany({ where: { item_id: { in: otherItemIds } } });
    await prisma.items.deleteMany({ where });
    await prisma.delivery_agents.deleteMany({ where });
    await prisma.suppliers.deleteMany({ where });
    await prisma.customers.deleteMany({ where });
    await prisma.categories.deleteMany({ where });
    await prisma.users.deleteMany({ where });
    await prisma.businesses.deleteMany({ where: { id: { in: otherBusinessIds } } });
  }
  console.log("Part A complete.");

  // ---------------------------------------------------------------
  // Part B: precise, pattern-matched test fixtures inside the real
  // business (business_id=1). Every match is by an exact code/id
  // pattern that only ever comes from a test file's Date.now()
  // fixture — real rows are excluded by construction, and customer
  // 189 is explicitly preserved.
  // ---------------------------------------------------------------
  const testItems = await prisma.items.findMany({
    where: { business_id: 1n, id: { notIn: REAL_ITEM_IDS } },
    select: { id: true },
  });
  const testItemIds = testItems.map((i) => i.id);
  console.log(`Part B: ${testItemIds.length} test items in business 1`);

  const testCustomers = await prisma.customers.findMany({
    where: {
      business_id: 1n,
      id: { notIn: PRESERVE_CUSTOMER_IDS },
      OR: TEST_CUSTOMER_CODE_PREFIXES.map((prefix) => ({
        customer_code: { startsWith: prefix },
      })),
    },
    select: { id: true },
  });
  const testCustomerIds = testCustomers.map((c) => c.id);
  console.log(`Part B: ${testCustomerIds.length} test customers in business 1`);

  const testCategories = await prisma.categories.findMany({
    where: { business_id: 1n, id: { notIn: REAL_CATEGORY_IDS } },
    select: { id: true },
  });
  const testCategoryIds = testCategories.map((c) => c.id);
  console.log(`Part B: ${testCategoryIds.length} test categories in business 1`);

  const testBills = await prisma.bills.findMany({
    where: {
      business_id: 1n,
      OR: [
        { customer_id: { in: testCustomerIds } },
        { bill_items: { some: { item_id: { in: testItemIds } } } },
      ],
    },
    select: { id: true },
  });
  const testBillIds = testBills.map((b) => b.id);
  console.log(`Part B: ${testBillIds.length} test bills in business 1`);

  const testPayments = await prisma.payments.findMany({
    where: { business_id: 1n, customer_id: { in: testCustomerIds } },
    select: { id: true },
  });
  const testPaymentIds = testPayments.map((p) => p.id);

  const testPayables = await prisma.payables.findMany({
    where: { business_id: 1n, supplier_id: { in: TEST_SUPPLIER_IDS } },
    select: { id: true },
  });
  const testPayableIds = testPayables.map((p) => p.id);

  const testImports = await prisma.imports.findMany({
    where: { business_id: 1n, supplier_id: { in: TEST_SUPPLIER_IDS } },
    select: { id: true },
  });
  const testImportIds = testImports.map((i) => i.id);

  await prisma.stock_movements.deleteMany({
    where: {
      business_id: 1n,
      OR: [
        { item_id: { in: testItemIds } },
        { bill_id: { in: testBillIds } },
        { import_id: { in: testImportIds } },
      ],
    },
  });
  await prisma.payment_allocations.deleteMany({
    where: { OR: [{ payment_id: { in: testPaymentIds } }, { bill_id: { in: testBillIds } }] },
  });
  await prisma.bill_item_weights.deleteMany({
    where: { bill_items: { bill_id: { in: testBillIds } } },
  });
  await prisma.bill_items.deleteMany({ where: { bill_id: { in: testBillIds } } });
  await prisma.bill_deliveries.deleteMany({ where: { bill_id: { in: testBillIds } } });
  await prisma.ledger_entries.deleteMany({
    where: { business_id: 1n, OR: [{ customer_id: { in: testCustomerIds } }, { bill_id: { in: testBillIds } }] },
  });
  await prisma.audit_logs.deleteMany({
    where: { business_id: 1n, entity_type: "bill", entity_id: { in: testBillIds } },
  });
  await prisma.bills.deleteMany({ where: { id: { in: testBillIds } } });
  await prisma.payments.deleteMany({ where: { id: { in: testPaymentIds } } });
  await prisma.payable_payments.deleteMany({ where: { payable_id: { in: testPayableIds } } });
  await prisma.payables.deleteMany({ where: { id: { in: testPayableIds } } });
  await prisma.imports.deleteMany({ where: { id: { in: testImportIds } } });
  await prisma.suppliers.deleteMany({ where: { id: { in: TEST_SUPPLIER_IDS } } });
  await prisma.item_units.deleteMany({ where: { item_id: { in: testItemIds } } });
  await prisma.items.deleteMany({ where: { id: { in: testItemIds } } });
  await prisma.customers.deleteMany({ where: { id: { in: testCustomerIds } } });
  await prisma.categories.deleteMany({ where: { id: { in: testCategoryIds } } });

  console.log("Part B complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
