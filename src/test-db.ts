import { prisma } from "./config/database";

async function testDatabaseConnection() {
  try {
    console.log("Connecting to Neon PostgreSQL...");

    const result = await prisma.$queryRaw<
      Array<{
        database_name: string;
        schema_name: string;
      }>
    >`
      SELECT
        current_database() AS database_name,
        current_schema() AS schema_name
    `;

    console.log("Database connection successful.");
    console.log("Database:", result[0].database_name);
    console.log("Schema:", result[0].schema_name);

    const businessCount = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*) AS count
      FROM businesses
    `;

    console.log(
      "Businesses table accessible.",
      "Rows:",
      businessCount[0].count.toString()
    );
  } catch (error) {
    console.error("Database connection failed.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseConnection();