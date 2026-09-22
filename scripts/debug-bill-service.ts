import { createBill } from "../src/modules/billing/billing.service";
import { prisma } from "../src/config/database";

async function main() {
  const customer = await prisma.customers.findFirst({
    where: { business_id: 1n, is_active: true },
    orderBy: { id: "desc" },
  });

  const items = await prisma.items.findMany({
    where: { business_id: 1n, is_active: true },
    include: { item_units: true },
    orderBy: { id: "desc" },
    take: 2,
  });

  console.log("customer", customer?.id);
  console.log(
    "items",
    items.map((i) => ({
      id: i.id,
      unit: i.item_units[0]?.id,
    }))
  );

  if (!customer || items.length < 2) {
    throw new Error("Missing fixtures");
  }

  const u1 = items[0].item_units[0];
  const u2 = items[1].item_units[0];

  if (!u1 || !u2) {
    throw new Error("Missing units");
  }

  try {
    const bill = await createBill(1n, 1n, {
      bill_type: "CUSTOMER",
      customer_id: customer.id.toString(),
      discount: 100,
      amount_paid: 500,
      payment_method: "CASH",
      items: [
        {
          item_id: items[0].id.toString(),
          item_unit_id: u1.id.toString(),
          quantity: 10,
          actual_rate: 47,
          discount: 0,
        },
        {
          item_id: items[1].id.toString(),
          item_unit_id: u2.id.toString(),
          quantity: 5,
          actual_rate: 45,
          discount: 10,
        },
      ],
    });

    console.log("created", bill.bill_number);
  } catch (error) {
    console.error("ERROR", error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
