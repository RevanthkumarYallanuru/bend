import axios from "axios";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let testCategoryId: string | null = null;

const testCategoryName =
  `AUTO TEST CATEGORY ${Date.now()}`;

const results: {
  test: string;
  status: "PASS" | "FAIL";
  details?: string;
}[] = [];

function pass(test: string) {
  results.push({
    test,
    status: "PASS",
  });
}

function fail(test: string, error: unknown) {
  results.push({
    test: "FAIL",
    status: "FAIL",
    details:
      error instanceof Error
        ? error.message
        : String(error),
  });
}

async function runTest(
  name: string,
  testFunction: () => Promise<void>
) {
  try {
    await testFunction();
    pass(name);
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

async function runCategoryTests() {
  console.log("\n======================================");
  console.log(" CATEGORY API AUTOMATED TESTS");
  console.log("======================================\n");

  await login();

  try {
    await runTest(
      "Create category",
      async () => {
        const response = await axios.post(
          `${API_URL}/categories`,
          {
            name: testCategoryName,
            telugu_name: "ఆటో టెస్ట్ కేటగిరీ",
          }
        );

        if (response.status !== 201) {
          throw new Error(
            `Expected 201, received ${response.status}`
          );
        }

        if (!response.data.success) {
          throw new Error(
            "API returned success=false"
          );
        }

        testCategoryId =
          response.data.data.id;

        if (!testCategoryId) {
          throw new Error(
            "Category ID was not returned"
          );
        }
      }
    );

    await runTest(
      "Get category by ID",
      async () => {
        if (!testCategoryId) {
          throw new Error(
            "No test category ID available"
          );
        }

        const response = await axios.get(
          `${API_URL}/categories/${testCategoryId}`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        if (
          response.data.data.name !==
          testCategoryName
        ) {
          throw new Error(
            "Category name does not match"
          );
        }
      }
    );

    await runTest(
      "List categories",
      async () => {
        const response = await axios.get(
          `${API_URL}/categories`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        if (!Array.isArray(response.data.data)) {
          throw new Error(
            "Expected categories array"
          );
        }
      }
    );

    await runTest(
      "Search category",
      async () => {
        const response = await axios.get(
          `${API_URL}/categories?search=AUTO%20TEST`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        if (response.data.count < 1) {
          throw new Error(
            "Test category was not found"
          );
        }
      }
    );

    await runTest(
      "Update category",
      async () => {
        if (!testCategoryId) {
          throw new Error(
            "No test category ID available"
          );
        }

        const response = await axios.patch(
          `${API_URL}/categories/${testCategoryId}`,
          {
            telugu_name:
              "ఆటో టెస్ట్ కేటగిరీ అప్డేట్",
          }
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        if (
          response.data.data.telugu_name !==
          "ఆటో టెస్ట్ కేటగిరీ అప్డేట్"
        ) {
          throw new Error(
            "Telugu name was not updated"
          );
        }
      }
    );

    await runTest(
      "Deactivate category",
      async () => {
        if (!testCategoryId) {
          throw new Error(
            "No test category ID available"
          );
        }

        const response = await axios.patch(
          `${API_URL}/categories/${testCategoryId}/deactivate`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        const category = await axios.get(
          `${API_URL}/categories/${testCategoryId}`
        );

        if (
          category.data.data.is_active !== false
        ) {
          throw new Error(
            "Category was not deactivated"
          );
        }
      }
    );

    await runTest(
      "Activate category",
      async () => {
        if (!testCategoryId) {
          throw new Error(
            "No test category ID available"
          );
        }

        const response = await axios.patch(
          `${API_URL}/categories/${testCategoryId}/activate`
        );

        if (response.status !== 200) {
          throw new Error(
            `Expected 200, received ${response.status}`
          );
        }

        const category = await axios.get(
          `${API_URL}/categories/${testCategoryId}`
        );

        if (
          category.data.data.is_active !== true
        ) {
          throw new Error(
            "Category was not activated"
          );
        }
      }
    );

    await runTest(
      "Validation rejects invalid category",
      async () => {
        try {
          await axios.post(
            `${API_URL}/categories`,
            {
              name: "",
            }
          );

          throw new Error(
            "Invalid category was accepted"
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
     * Test cleanup.
     *
     * This directly removes only the temporary category
     * created by this automated test.
     */
    if (testCategoryId) {
      await prisma.categories.delete({
        where: {
          id: BigInt(testCategoryId),
        },
      });
    }
  }

  console.log("\n======================================");
  console.log(" TEST REPORT");
  console.log("======================================\n");

  for (const result of results) {
    const icon =
      result.status === "PASS" ? "✓" : "✗";

    console.log(
      `${icon} ${result.status} - ${result.test}`
    );

    if (result.details) {
      console.log(`  ${result.details}`);
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

runCategoryTests();