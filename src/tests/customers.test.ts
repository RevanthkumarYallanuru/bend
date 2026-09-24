import axios from "axios";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let testCustomerId: string | null = null;

// Use a unique code so repeated test runs do not hit
// the unique customer_code constraint.
const TEST_CUSTOMER_CODE = `AUTO-${Date.now()}`;

const results: {
  test: string;
  status: "PASS" | "FAIL";
  details?: string;
}[] = [];

function pass(test: string, details?: string) {
  results.push({
    test,
    status: "PASS",
    details,
  });
}

function fail(test: string, error: unknown) {
  const details =
    error instanceof Error
      ? error.message
      : String(error);

  results.push({
    test,
    status: "FAIL",
    details,
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
    fail(name, error);
  }
}

/**
 * LOGIN
 *
 * Authenticate once before running customer tests.
 */
async function login() {
  const response = await axios.post(
    `${API_URL}/auth/login`,
    {
      username: "admin",
      password: "ChangeMe@123",
    }
  );

  if (response.status !== 200) {
    throw new Error(
      `Login failed. Expected 200, received ${response.status}`
    );
  }

  if (!response.data.success) {
    throw new Error(
      "Login returned success=false"
    );
  }

  if (!response.data.data?.token) {
    throw new Error(
      "JWT token was not returned"
    );
  }

  token = response.data.data.token;
}

/**
 * AUTH HEADERS
 *
 * Every protected customer request uses this.
 */
function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * RUN CUSTOMER TESTS
 */
async function runCustomerTests() {
  console.log("");
  console.log("======================================");
  console.log(" CUSTOMER API AUTOMATED TESTS");
  console.log("======================================");
  console.log("");

  /*
   * Authenticate before running protected APIs.
   */
  try {
    await login();

    console.log("✓ Authentication successful");
    console.log("");
  } catch (error) {
    console.log("✗ Authentication failed");

    console.log(
      `  ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );

    console.log("");
    console.log(
      "Customer tests cannot continue without a JWT."
    );

    process.exitCode = 1;
    return;
  }

  /*
   * 1. CREATE CUSTOMER
   */
  await runTest(
    "Create customer",
    async () => {
      const response = await axios.post(
        `${API_URL}/customers`,
        {
          customer_code: TEST_CUSTOMER_CODE,
          english_name:
            "Automated Test Customer",
          telugu_name:
            "ఆటోమేటెడ్ టెస్ట్ కస్టమర్",
          phone: "9000000001",
          address:
            "Automated Test Address",
          notes:
            "Created by automated test",
        },
        {
          headers: authHeaders(),
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

      testCustomerId =
        response.data.data?.id;

      if (!testCustomerId) {
        throw new Error(
          "Customer ID was not returned"
        );
      }
    }
  );

  /*
   * 2. GET CUSTOMER BY ID
   */
  await runTest(
    "Get customer by ID",
    async () => {
      if (!testCustomerId) {
        throw new Error(
          "No test customer ID available"
        );
      }

      const response = await axios.get(
        `${API_URL}/customers/${testCustomerId}`,
        {
          headers: authHeaders(),
        }
      );

      if (response.status !== 200) {
        throw new Error(
          `Expected 200, received ${response.status}`
        );
      }

      if (
        response.data.data?.english_name !==
        "Automated Test Customer"
      ) {
        throw new Error(
          "Customer name does not match"
        );
      }
    }
  );

  /*
   * 3. SEARCH CUSTOMER
   */
  await runTest(
    "Search customer",
    async () => {
      const response = await axios.get(
        `${API_URL}/customers`,
        {
          params: {
            search: "Automated",
          },
          headers: authHeaders(),
        }
      );

      if (response.status !== 200) {
        throw new Error(
          `Expected 200, received ${response.status}`
        );
      }

      if (
        response.data.count < 1
      ) {
        throw new Error(
          "Customer was not found in search"
        );
      }
    }
  );

  /*
   * 4. UPDATE CUSTOMER
   */
  await runTest(
    "Update customer",
    async () => {
      if (!testCustomerId) {
        throw new Error(
          "No test customer ID available"
        );
      }

      const response = await axios.patch(
        `${API_URL}/customers/${testCustomerId}`,
        {
          phone: "9000000002",
          address:
            "Updated Test Address",
        },
        {
          headers: authHeaders(),
        }
      );

      if (response.status !== 200) {
        throw new Error(
          `Expected 200, received ${response.status}`
        );
      }

      if (
        response.data.data?.phone !==
        "9000000002"
      ) {
        throw new Error(
          "Phone number was not updated"
        );
      }

      if (
        response.data.data?.address !==
        "Updated Test Address"
      ) {
        throw new Error(
          "Address was not updated"
        );
      }
    }
  );

  /*
   * 5. DEACTIVATE CUSTOMER
   */
  await runTest(
    "Deactivate customer",
    async () => {
      if (!testCustomerId) {
        throw new Error(
          "No test customer ID available"
        );
      }

      const response = await axios.patch(
        `${API_URL}/customers/${testCustomerId}/deactivate`,
        {},
        {
          headers: authHeaders(),
        }
      );

      if (response.status !== 200) {
        throw new Error(
          `Expected 200, received ${response.status}`
        );
      }

      const customer =
        await axios.get(
          `${API_URL}/customers/${testCustomerId}`,
          {
            headers: authHeaders(),
          }
        );

      if (
        customer.data.data?.is_active !==
        false
      ) {
        throw new Error(
          "Customer was not deactivated"
        );
      }
    }
  );

  /*
   * 6. ACTIVATE CUSTOMER
   */
  await runTest(
    "Activate customer",
    async () => {
      if (!testCustomerId) {
        throw new Error(
          "No test customer ID available"
        );
      }

      const response = await axios.patch(
        `${API_URL}/customers/${testCustomerId}/activate`,
        {},
        {
          headers: authHeaders(),
        }
      );

      if (response.status !== 200) {
        throw new Error(
          `Expected 200, received ${response.status}`
        );
      }

      const customer =
        await axios.get(
          `${API_URL}/customers/${testCustomerId}`,
          {
            headers: authHeaders(),
          }
        );

      if (
        customer.data.data?.is_active !==
        true
      ) {
        throw new Error(
          "Customer was not activated"
        );
      }
    }
  );

  /*
   * 7. VALIDATION
   */
  await runTest(
    "Validation rejects invalid customer",
    async () => {
      try {
        await axios.post(
          `${API_URL}/customers`,
          {
            customer_code: "",
            english_name: "",
          },
          {
            headers: authHeaders(),
          }
        );

        throw new Error(
          "Invalid customer was accepted by the API"
        );
      } catch (error: unknown) {
        if (
          axios.isAxiosError(error)
        ) {
          if (
            error.response?.status !==
            400
          ) {
            throw new Error(
              `Expected HTTP 400, received ${error.response?.status}`
            );
          }

          return;
        }

        throw error;
      }
    }
  );

  /*
   * CLEANUP
   *
   * Every other test file deletes what it creates; this one didn't,
   * which left an orphaned "Automated Test Customer" row in the real
   * database after every run. Each test in this file already catches
   * its own errors via runTest, so nothing above can throw past this
   * point — a plain cleanup call here is as reliable as a finally
   * block would be.
   */
  if (testCustomerId) {
    try {
      await prisma.customers.deleteMany({
        where: { id: BigInt(testCustomerId) },
      });
    } catch (cleanupErr) {
      console.error("Cleanup warning:", cleanupErr);
    }
  }

  /*
   * PRINT REPORT
   */
  console.log("");
  console.log("======================================");
  console.log(" TEST REPORT");
  console.log("======================================");
  console.log("");

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

  const passed =
    results.filter(
      (result) =>
        result.status === "PASS"
    ).length;

  const failed =
    results.filter(
      (result) =>
        result.status === "FAIL"
    ).length;

  console.log("");
  console.log("======================================");
  console.log(
    `TOTAL  : ${results.length}`
  );
  console.log(
    `PASSED : ${passed}`
  );
  console.log(
    `FAILED : ${failed}`
  );
  console.log("======================================");
  console.log("");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runCustomerTests();