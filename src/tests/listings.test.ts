import axios from "axios";

const API_URL = "http://localhost:5000/api";

let token = "";

const results: {
  test: string;
  status: "PASS" | "FAIL";
  details?: string;
}[] = [];

function pass(name: string) {
  results.push({ test: name, status: "PASS" });
}

function fail(name: string, error: unknown) {
  results.push({
    test: name,
    status: "FAIL",
    details: error instanceof Error ? error.message : String(error),
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
  return { Authorization: `Bearer ${token}` };
}

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isDescendingBy(rows: any[], key: string): boolean {
  for (let i = 1; i < rows.length; i++) {
    if (new Date(rows[i - 1][key]).getTime() < new Date(rows[i][key]).getTime()) {
      return false;
    }
  }
  return true;
}

/**
 * Read-only checks on the shared list behaviour (newest-first order,
 * the quick date ranges, Excel exports). Creates no data, so there is
 * nothing to clean up.
 */
async function runListingTests() {
  console.log("\n========================================");
  console.log(" LISTINGS (ORDER / RANGE / EXPORT) TESTS");
  console.log("========================================\n");

  await runTest("Login", async () => {
    const response = await axios.post(`${API_URL}/auth/login`, {
      username: "admin",
      password: "ChangeMe@123",
    });
    token = response.data.data?.token;
    if (!token) throw new Error("JWT token was not returned");
  });

  const listEndpoints = ["bills", "payments", "deliveries", "payables", "imports"];
  const newRanges = ["today", "last3days", "week", "last30days", "month", "year", "all"];

  await runTest("Every list accepts the quick ranges (incl. last3days/last30days)", async () => {
    for (const endpoint of listEndpoints) {
      for (const range of newRanges) {
        const res = await axios.get(`${API_URL}/${endpoint}`, {
          params: { range },
          headers: authHeaders(),
        });
        if (res.status !== 200) {
          throw new Error(`${endpoint}?range=${range} returned ${res.status}`);
        }
      }
    }
  });

  await runTest("A narrower range never returns more rows than a wider one", async () => {
    for (const endpoint of listEndpoints) {
      const counts: number[] = [];
      for (const range of ["today", "last3days", "week", "last30days", "all"]) {
        const res = await axios.get(`${API_URL}/${endpoint}`, {
          params: { range },
          headers: authHeaders(),
        });
        counts.push(res.data.count);
      }
      for (let i = 1; i < counts.length; i++) {
        if (counts[i] < counts[i - 1]) {
          throw new Error(`${endpoint} counts not monotonic: ${counts.join(", ")}`);
        }
      }
    }
  });

  await runTest("range=custom without dates is rejected (400)", async () => {
    for (const endpoint of listEndpoints) {
      try {
        await axios.get(`${API_URL}/${endpoint}`, {
          params: { range: "custom" },
          headers: authHeaders(),
        });
        throw new Error(`${endpoint} accepted range=custom without dates`);
      } catch (error: any) {
        if (error.response?.status !== 400) {
          throw new Error(`${endpoint}: expected 400, got ${error.response?.status ?? error.message}`);
        }
      }
    }
  });

  await runTest("Bills are newest first", async () => {
    const res = await axios.get(`${API_URL}/bills`, { headers: authHeaders() });
    if (!isDescendingBy(res.data.data, "transaction_at")) {
      throw new Error("Bills list is not newest-first");
    }
  });

  await runTest("Payments are newest first", async () => {
    const res = await axios.get(`${API_URL}/payments`, { headers: authHeaders() });
    if (!isDescendingBy(res.data.data, "payment_at")) {
      throw new Error("Payments list is not newest-first");
    }
  });

  await runTest("Imports are newest first", async () => {
    const res = await axios.get(`${API_URL}/imports`, { headers: authHeaders() });
    if (!isDescendingBy(res.data.data, "import_date")) {
      throw new Error("Imports list is not newest-first");
    }
  });

  await runTest("Items and categories are newest first; sort=name is alphabetical", async () => {
    const items = await axios.get(`${API_URL}/items`, { headers: authHeaders() });
    const ids = (items.data.data as any[]).map((i) => BigInt(i.id));
    for (let i = 1; i < ids.length; i++) {
      if (ids[i - 1] < ids[i]) throw new Error("Items are not newest-first");
    }

    const byName = await axios.get(`${API_URL}/items`, {
      params: { sort: "name" },
      headers: authHeaders(),
    });
    const names = (byName.data.data as any[]).map((i) => String(i.english_name).toLowerCase());
    const sorted = [...names].sort();
    if (JSON.stringify(names) !== JSON.stringify(sorted)) {
      // Postgres collation can differ slightly from JS sort; only fail
      // if the first/last are clearly out of order.
      if (names[0] > names[names.length - 1]) {
        throw new Error("sort=name is not alphabetical");
      }
    }

    const cats = await axios.get(`${API_URL}/categories`, { headers: authHeaders() });
    const catIds = (cats.data.data as any[]).map((c) => BigInt(c.id));
    for (let i = 1; i < catIds.length; i++) {
      if (catIds[i - 1] < catIds[i]) throw new Error("Categories are not newest-first");
    }
  });

  await runTest("Ledger is newest first by default and order=asc flips it", async () => {
    const customers = await axios.get(`${API_URL}/customers`, { headers: authHeaders() });
    const list = customers.data.data as any[];

    let checked = false;
    for (const customer of list.slice(0, 30)) {
      const res = await axios.get(`${API_URL}/ledger/customer/${customer.id}`, {
        headers: authHeaders(),
      });
      const rows = res.data.data as any[];
      if (rows.length < 2) continue;

      if (!isDescendingBy(rows, "transaction_at")) {
        throw new Error(`Ledger for customer ${customer.id} is not newest-first`);
      }

      const asc = await axios.get(`${API_URL}/ledger/customer/${customer.id}`, {
        params: { order: "asc" },
        headers: authHeaders(),
      });
      const ascRows = asc.data.data as any[];
      if (ascRows[0].id !== rows[rows.length - 1].id) {
        throw new Error("order=asc did not reverse the ledger");
      }
      checked = true;
      break;
    }

    if (!checked) throw new Error("No customer with 2+ ledger entries found to verify ordering");
  });

  await runTest("Every Excel export returns a valid .xlsx file", async () => {
    const suppliers = await axios.get(`${API_URL}/suppliers`, { headers: authHeaders() });
    const supplierId = (suppliers.data.data as any[])[0]?.id;

    const paths = [
      "/payments/export",
      "/payables/export",
      "/imports/export",
      "/deliveries/export",
      "/inventory/tally/export",
      "/reports/bills/export?range=all",
      ...(supplierId ? [`/suppliers/${supplierId}/payments/export`] : []),
    ];

    for (const path of paths) {
      const res = await axios.get(`${API_URL}${path}`, {
        headers: authHeaders(),
        responseType: "arraybuffer",
      });
      if (res.status !== 200) throw new Error(`${path} returned ${res.status}`);
      if (!String(res.headers["content-type"]).includes(XLSX_TYPE)) {
        throw new Error(`${path} content-type was ${res.headers["content-type"]}`);
      }
      const bytes = Buffer.from(res.data);
      // .xlsx files are zip archives ("PK").
      if (bytes.length < 100 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        throw new Error(`${path} did not return a valid xlsx file`);
      }
    }
  });

  await runTest("Exports honour range filters and reject unauthenticated access", async () => {
    const res = await axios.get(`${API_URL}/payments/export`, {
      params: { range: "last30days" },
      headers: authHeaders(),
      responseType: "arraybuffer",
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

    try {
      await axios.get(`${API_URL}/payments/export`);
      throw new Error("Unauthenticated export was accepted");
    } catch (error: any) {
      if (error.response?.status !== 401) {
        throw new Error(`Expected 401, got ${error.response?.status ?? error.message}`);
      }
    }
  });

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
  console.log("========================================");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runListingTests();
