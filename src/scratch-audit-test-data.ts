import { prisma } from "./config/database";

async function main() {
  console.log("=== ALL ITEMS (business_id=1) ===");
  const items = await prisma.items.findMany({
    where: { business_id: 1n },
    select: { id: true, item_code: true, english_name: true, created_at: true },
    orderBy: { id: "asc" },
  });
  for (const i of items) {
    console.log(i.id.toString().padEnd(5), i.item_code.padEnd(30), i.english_name);
  }

  console.log("\n=== ALL CUSTOMERS (business_id=1) ===");
  const customers = await prisma.customers.findMany({
    where: { business_id: 1n },
    select: { id: true, customer_code: true, english_name: true },
    orderBy: { id: "asc" },
  });
  for (const c of customers) {
    console.log(c.id.toString().padEnd(5), c.customer_code.padEnd(20), c.english_name);
  }

  console.log("\n=== ALL SUPPLIERS (business_id=1) ===");
  const suppliers = await prisma.suppliers.findMany({
    where: { business_id: 1n },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  for (const s of suppliers) {
    console.log(s.id.toString().padEnd(5), s.name);
  }

  console.log("\n=== ALL CATEGORIES (business_id=1) ===");
  const categories = await prisma.categories.findMany({
    where: { business_id: 1n },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  for (const c of categories) {
    console.log(c.id.toString().padEnd(5), c.name);
  }

  console.log("\n=== OTHER BUSINESSES (business_id != 1) ===");
  const businesses = await prisma.businesses.findMany({
    where: { id: { not: 1n } },
    select: { id: true, name: true, created_at: true },
    orderBy: { id: "asc" },
  });
  for (const b of businesses) {
    console.log(b.id.toString().padEnd(5), b.name, b.created_at.toISOString());
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
