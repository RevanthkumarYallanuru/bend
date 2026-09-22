const BASE_URL = "http://localhost:5000/api";

let token = "";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`✓ PASS - ${name}`);
  passed++;
}

function fail(name: string, error: unknown) {
  console.log(`✗ FAIL - ${name}`);
  console.log(
    `  ${error instanceof Error ? error.message : error}`
  );
  failed++;
}

async function testLogin() {
  const response = await fetch(
    `${BASE_URL}/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        password: "ChangeMe@123",
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(data)}`
    );
  }

  if (!data.success) {
    throw new Error("Login returned success=false");
  }

  if (!data.data?.token) {
    throw new Error("JWT token was not returned");
  }

  if (data.data.user.role !== "ADMIN") {
    throw new Error("Expected ADMIN role");
  }

  if (!data.data.user.business_id) {
    throw new Error(
      "business_id was not returned"
    );
  }

  token = data.data.token;
}

async function testMe() {
  const response = await fetch(
    `${BASE_URL}/auth/me`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(data)}`
    );
  }

  if (!data.success) {
    throw new Error("/me returned success=false");
  }

  if (!data.data?.id) {
    throw new Error("User ID missing");
  }

  if (!data.data?.business_id) {
    throw new Error("Business ID missing");
  }

  if (data.data.role !== "ADMIN") {
    throw new Error("Expected ADMIN role");
  }
}

async function testInvalidPassword() {
  const response = await fetch(
    `${BASE_URL}/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "admin",
        password: "WrongPassword123",
      }),
    }
  );

  if (response.status !== 401) {
    throw new Error(
      `Expected HTTP 401, received ${response.status}`
    );
  }
}

async function testMissingToken() {
  const response = await fetch(
    `${BASE_URL}/auth/me`
  );

  if (response.status !== 401) {
    throw new Error(
      `Expected HTTP 401, received ${response.status}`
    );
  }
}

async function testInvalidToken() {
  const response = await fetch(
    `${BASE_URL}/auth/me`,
    {
      headers: {
        Authorization: "Bearer invalid-token",
      },
    }
  );

  if (response.status !== 401) {
    throw new Error(
      `Expected HTTP 401, received ${response.status}`
    );
  }
}

async function runTests() {
  console.log("");
  console.log("==============================");
  console.log("AUTHENTICATION API TESTS");
  console.log("==============================");
  console.log("");

  try {
    await testLogin();
    pass("Login with valid credentials");
  } catch (error) {
    fail("Login with valid credentials", error);
  }

  if (token) {
    try {
      await testMe();
      pass("Get current user with JWT");
    } catch (error) {
      fail("Get current user with JWT", error);
    }
  } else {
    fail(
      "Get current user with JWT",
      "Skipped because login failed"
    );
  }

  try {
    await testInvalidPassword();
    pass("Reject invalid password");
  } catch (error) {
    fail("Reject invalid password", error);
  }

  try {
    await testMissingToken();
    pass("Reject missing token");
  } catch (error) {
    fail("Reject missing token", error);
  }

  try {
    await testInvalidToken();
    pass("Reject invalid token");
  } catch (error) {
    fail("Reject invalid token", error);
  }

  console.log("");
  console.log("==============================");
  console.log("TEST REPORT");
  console.log("==============================");
  console.log(`TOTAL  : ${passed + failed}`);
  console.log(`PASSED : ${passed}`);
  console.log(`FAILED : ${failed}`);
  console.log("==============================");
  console.log("");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();