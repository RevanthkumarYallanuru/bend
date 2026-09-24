import { prisma } from "./config/database";

async function main() {
  const customer = await prisma.customers.findUnique({ where: { id: 189n } });
  console.log("Customer 189:", customer?.customer_code, customer?.english_name);

  const bills = await prisma.bills.findMany({
    where: { customer_id: 189n },
    select: { id: true, bill_number: true, status: true, grand_total: true },
  });
  console.log("Linked bills:", bills);

  const payments = await prisma.payments.findMany({
    where: { customer_id: 189n },
    select: { id: true, payment_number: true, amount: true },
  });
  console.log("Linked payments:", payments);

  // Check a sample of the XLSX-CUST customers to confirm they're test-only
  const xlsxCustomers = await prisma.customers.findMany({
    where: { customer_code: { startsWith: "XLSX-CUST-" } },
    select: { id: true, customer_code: true, english_name: true },
  });
  console.log("\nXLSX-CUST customers:", xlsxCustomers.length);
  for (const c of xlsxCustomers) {
    const b = await prisma.bills.count({ where: { customer_id: c.id } });
    console.log(c.id.toString(), c.customer_code, c.english_name, "bills:", b);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
