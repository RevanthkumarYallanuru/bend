import axios from "axios";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let testItemId: string | null = null;
let firstUnitId: string | null = null;
let secondUnitId: string | null = null;
let testCategoryId: string | null = null;

const testItemCode = `AUTO-ITEM-${Date.now()}`;
const testItemName = `Automated Test Item ${Date.now()}`;
const testCategoryName = `Automated Test Category ${Date.now()}`;

const results: {
  test: string;
  status: "PASS" | "FAIL";
  details?: string;
}[] = [];

async function login() {
  const response = await axios.post(
    `${API_URL}/auth/login`,
    {
      username: "admin",
      password: "ChangeMe@123",
    }
  );

  if (!response.data?.data?.token) {
    throw new Error("JWT token was not returned");
  }

  axios.defaults.headers.common.Authorization = `Bearer ${response.data.data.token}`;
}

async function runTest(
  name: string,
  testFunction: () => Promise<void>
) {
  try {
    await testFunction();

    results.push({
      test: name,
      status: "PASS",
    });
  } catch (error) {
    results.push({
      test: name,
      status: "FAIL",
      details:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }
}

async function setupCategory() {
  const response = await axios.post(`${API_URL}/categories`, {
    name: testCategoryName,
    telugu_name: "ఆటోమేటెడ్ టెస్ట్ కేటగిరీ",
  });

  if (response.status !== 201 || !response.data?.data?.id) {
    throw new Error(
      `Failed to create the test fixture category needed by item tests: ${response.status}`
    );
  }

  testCategoryId = response.data.data.id;
}

async function runItemTests() {
  console.log("\n======================================");
  console.log(" ITEMS + ITEM UNITS AUTOMATED TESTS");
  console.log("======================================\n");

  await login();
  await setupCategory();

  try {
    /*
     * 1. CREATE ITEM
     */
    await runTest("Create item", async () => {
      const response = await axios.post(
        `${API_URL}/items`,
        {
          item_code: testItemCode,
          category_id: testCategoryId,
          english_name: testItemName,
          telugu_name: "ఆటోమేటెడ్ టెస్ట్ ఐటమ్",
          description: "Created by automated test",
        }
      );

      if (response.status !== 201) {
        throw new Error(
          `Expected 201, received ${response.status}`
        );
      }

      testItemId = response.data.data.id;

      if (!testItemId) {
        throw new Error(
          "Item ID was not returned"
        );
      }
    });

    /*
     * 2. GET ITEM
     */
    await runTest("Get item by ID", async () => {
      if (!testItemId) {
        throw new Error(
          "No test item ID available"
        );
      }

      const response = await axios.get(
        `${API_URL}/items/${testItemId}`
      );

      if (response.status !== 200) {
        throw new Error(
          `Expected 200, received ${response.status}`
        );
      }

      if (
        response.data.data.english_name !==
        testItemName
      ) {
        throw new Error(
          "Item name does not match"
        );
      }
    });

    /*
     * 3. LIST ITEMS
     */
    await runTest("List items", async () => {
      const response = await axios.get(
        `${API_URL}/items`
      );

      if (response.status !== 200) {
        throw new Error(
          `Expected 200, received ${response.status}`
        );
      }

      if (!Array.isArray(response.data.data)) {
        throw new Error(
          "Expected items array"
        );
      }

      if (response.data.count < 1) {
        throw new Error(
          "No items returned"
        );
      }
    });

    /*
     * 4. SEARCH ITEM
     */
    await runTest("Search item", async () => {
      const response = await axios.get(
        `${API_URL}/items?search=${encodeURIComponent(
          testItemCode
        )}`
      );

      if (response.status !== 200) {
        throw new Error(
          `Expected 200, received ${response.status}`
        );
      }

      if (response.data.count < 1) {
        throw new Error(
          "Test item was not found"
        );
      }
    });

    /*
     * 5. CATEGORY FILTER
     */
    await runTest(
      "Filter items by category",
      async () => {
        const response = await axios.get(
          `${API_URL}/items?categoryId=${testCategoryId}`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        const found = response.data.data.some(
          (item: any) =>
            item.id === testItemId
        );

        if (!found) {
          throw new Error(
            "Test item was not found in category"
          );
        }
      }
    );

    /*
     * 6. UPDATE ITEM
     */
    await runTest("Update item", async () => {
      if (!testItemId) {
        throw new Error(
          "No test item ID available"
        );
      }

      const response = await axios.patch(
        `${API_URL}/items/${testItemId}`,
        {
          description:
            "Updated automated test item",
        }
      );

      if (response.status !== 200) {
        throw new Error(
          `Expected 200, received ${response.status}`
        );
      }

      if (
        response.data.data.description !==
        "Updated automated test item"
      ) {
        throw new Error(
          "Item description was not updated"
        );
      }
    });

    /*
     * 7. DEACTIVATE ITEM
     */
    await runTest(
      "Deactivate item",
      async () => {
        if (!testItemId) {
          throw new Error(
            "No test item ID available"
          );
        }

        const response = await axios.patch(
          `${API_URL}/items/${testItemId}/deactivate`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        const item = await axios.get(
          `${API_URL}/items/${testItemId}`
        );

        if (
          item.data.data.is_active !== false
        ) {
          throw new Error(
            "Item was not deactivated"
          );
        }
      }
    );

    /*
     * 8. ACTIVATE ITEM
     */
    await runTest(
      "Activate item",
      async () => {
        if (!testItemId) {
          throw new Error(
            "No test item ID available"
          );
        }

        const response = await axios.patch(
          `${API_URL}/items/${testItemId}/activate`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        const item = await axios.get(
          `${API_URL}/items/${testItemId}`
        );

        if (
          item.data.data.is_active !== true
        ) {
          throw new Error(
            "Item was not activated"
          );
        }
      }
    );

    /*
     * 9. CREATE FIRST ITEM UNIT
     */
    await runTest(
      "Create first item unit",
      async () => {
        if (!testItemId) {
          throw new Error(
            "No test item ID available"
          );
        }

        const response = await axios.post(
          `${API_URL}/items/${testItemId}/units`,
          {
            unit: "KG",
            standard_price: 100,
            is_default: true,
          }
        );

        if (response.status !== 201) {
          throw new Error(
            `Expected 201, received ${response.status}`
          );
        }

        firstUnitId =
          response.data.data.id;

        if (!firstUnitId) {
          throw new Error(
            "First unit ID was not returned"
          );
        }

        if (
          response.data.data.is_default !== true
        ) {
          throw new Error(
            "First unit should be default"
          );
        }
      }
    );

    /*
     * 10. CREATE SECOND ITEM UNIT
     */
    await runTest(
      "Create second item unit",
      async () => {
        if (!testItemId) {
          throw new Error(
            "No test item ID available"
          );
        }

        const response = await axios.post(
          `${API_URL}/items/${testItemId}/units`,
          {
            unit: "BAG",
            standard_price: 2500,
            is_default: true,
          }
        );

        if (response.status !== 201) {
          throw new Error(
            `Expected 201, received ${response.status}`
          );
        }

        secondUnitId =
          response.data.data.id;

        if (!secondUnitId) {
          throw new Error(
            "Second unit ID was not returned"
          );
        }

        /*
         * Because this unit was created as default,
         * the service should have removed the
         * default flag from the first unit.
         */
        const units = await axios.get(
          `${API_URL}/items/${testItemId}/units`
        );

        const firstUnit = units.data.data.find(
          (unit: any) =>
            unit.id === firstUnitId
        );

        const secondUnit = units.data.data.find(
          (unit: any) =>
            unit.id === secondUnitId
        );

        if (
          firstUnit?.is_default !== false
        ) {
          throw new Error(
            "First unit should no longer be default"
          );
        }

        if (
          secondUnit?.is_default !== true
        ) {
          throw new Error(
            "Second unit should be default"
          );
        }
      }
    );

    /*
     * 11. LIST ITEM UNITS
     */
    await runTest(
      "List item units",
      async () => {
        if (!testItemId) {
          throw new Error(
            "No test item ID available"
          );
        }

        const response = await axios.get(
          `${API_URL}/items/${testItemId}/units`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        if (response.data.count !== 2) {
          throw new Error(
            `Expected 2 units, received ${response.data.count}`
          );
        }
      }
    );

    /*
     * 12. UPDATE ITEM UNIT
     */
    await runTest(
      "Update item unit",
      async () => {
        if (!testItemId || !firstUnitId) {
          throw new Error(
            "Test item/unit ID unavailable"
          );
        }

        const response = await axios.patch(
          `${API_URL}/items/${testItemId}/units/${firstUnitId}`,
          {
            standard_price: 125,
            is_default: true,
          }
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        if (
          response.data.data.standard_price !==
          "125"
        ) {
          throw new Error(
            "Unit price was not updated"
          );
        }

        if (
          response.data.data.is_default !== true
        ) {
          throw new Error(
            "First unit should now be default"
          );
        }

        /*
         * Verify the second unit is no longer
         * the default.
         */
        const units = await axios.get(
          `${API_URL}/items/${testItemId}/units`
        );

        const secondUnit = units.data.data.find(
          (unit: any) =>
            unit.id === secondUnitId
        );

        if (
          secondUnit?.is_default !== false
        ) {
          throw new Error(
            "Second unit should no longer be default"
          );
        }
      }
    );

    /*
     * 13. VALIDATION
     */
    await runTest(
      "Validation rejects invalid item",
      async () => {
        try {
          await axios.post(
            `${API_URL}/items`,
            {
              item_code: "",
              english_name: "",
              category_id: "-1",
            }
          );

          throw new Error(
            "Invalid item was accepted"
          );
        } catch (error: any) {
          if (error.response?.status !== 400) {
            throw new Error(
              `Expected HTTP 400, received ${error.response?.status}`
            );
          }
        }
      }
    );
  } finally {
    /*
     * Cleanup only the temporary item and
     * its temporary units.
     *
     * No real business data is touched.
     */
    if (testItemId) {
      await prisma.item_units.deleteMany({
        where: {
          item_id: BigInt(testItemId),
        },
      });

      await prisma.items.delete({
        where: {
          id: BigInt(testItemId),
        },
      });
    }

    if (testCategoryId) {
      await prisma.categories.delete({
        where: {
          id: BigInt(testCategoryId),
        },
      });
    }
  }

  /*
   * REPORT
   */
  console.log("\n======================================");
  console.log(" TEST REPORT");
  console.log("======================================\n");

  for (const result of results) {
    const icon =
      result.status === "PASS"
        ? "✓"
        : "✗";

    console.log(
      `${icon} ${result.status} - ${result.test}`
    );

    if (result.details) {
      console.log(
        `  ${result.details}`
      );
    }
  }

  const passed = results.filter(
    (result) => result.status === "PASS"
  ).length;

  const failed = results.filter(
    (result) => result.status === "FAIL"
  ).length;

  console.log("\n======================================");
  console.log(`TOTAL  : ${results.length}`);
  console.log(`PASSED : ${passed}`);
  console.log(`FAILED : ${failed}`);
  console.log("======================================");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runItemTests();