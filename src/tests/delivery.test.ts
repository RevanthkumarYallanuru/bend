import axios from "axios";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database";

const API_URL = "http://localhost:5000/api";

let token = "";
let token2 = "";

let testItemId: string | null = null;
let testItemUnitId: string | null = null;
let testCategoryId: string | null = null;

let testAgentId: string | null = null;

let business2Id: bigint | null = null;
let user2Id: bigint | null = null;

const createdBillIds: bigint[] = [];
const createdItemIds: bigint[] = [];
const createdAgentIds: bigint[] = [];

const results: {
  test: string;
  status: "PASS" | "FAIL";
  details?: string;
}[] = [];

function pass(name: string, details?: string) {
  results.push({ test: name, status: "PASS", details });
}

function fail(name: string, error: unknown) {
  const details =
    error instanceof Error ? error.message : String(error);
  results.push({ test: name, status: "FAIL", details });
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

function authHeaders(bearer = token) {
  return {
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
  };
}

async function createWalkInBill(): Promise<string> {
  const res = await axios.post(
    `${API_URL}/bills`,
    {
      bill_type: "WALK_IN",
      items: [
        {
          item_id: testItemId,
          item_unit_id: testItemUnitId,
          quantity: 1,
          actual_rate: 50,
        },
      ],
    },
    { headers: authHeaders() }
  );

  const billId = res.data.data.id;
  createdBillIds.push(BigInt(billId));
  return billId;
}

async function runDeliveryTests() {
  console.log("\n========================================");
  console.log(" DELIVERY API AUTOMATED TESTS");
  console.log("========================================\n");

  try {
    await runTest("Login", async () => {
      const response = await axios.post(`${API_URL}/auth/login`, {
        username: "admin",
        password: "ChangeMe@123",
      });

      token = response.data.data?.token;
      if (!token) throw new Error("JWT token was not returned");
    });

    await runTest("Create item fixture", async () => {
      const catRes = await axios.post(
        `${API_URL}/categories`,
        { name: `Delivery Test Category ${Date.now()}` },
        { headers: authHeaders() }
      );
      testCategoryId = catRes.data?.data?.id ?? null;
      if (!testCategoryId) throw new Error("Failed to create a category fixture");

      const itemRes = await axios.post(
        `${API_URL}/items`,
        {
          item_code: `DEL-ITEM-${Date.now()}`,
          english_name: `Delivery Item ${Date.now()}`,
          category_id: testCategoryId,
        },
        { headers: authHeaders() }
      );
      testItemId = itemRes.data.data.id;
      createdItemIds.push(BigInt(testItemId!));

      const unitRes = await axios.post(
        `${API_URL}/items/${testItemId}/units`,
        { unit: "PCS", standard_price: 50, is_default: true },
        { headers: authHeaders() }
      );
      testItemUnitId = unitRes.data.data.id;
    });

    await runTest("Create delivery agent", async () => {
      const res = await axios.post(
        `${API_URL}/delivery-agents`,
        {
          name: `Delivery Test Agent ${Date.now()}`,
          phone: "9123456789",
          vehicle_number: "TS09AB1234",
        },
        { headers: authHeaders() }
      );

      if (res.status !== 201) {
        throw new Error(`Expected 201, got ${res.status}`);
      }

      testAgentId = res.data.data.id;
      createdAgentIds.push(BigInt(testAgentId!));
    });

    await runTest("List delivery agents", async () => {
      const res = await axios.get(`${API_URL}/delivery-agents`, {
        headers: authHeaders(),
      });
      if (res.data.count < 1) {
        throw new Error("Expected at least 1 delivery agent");
      }
    });

    await runTest("Update delivery agent", async () => {
      const res = await axios.patch(
        `${API_URL}/delivery-agents/${testAgentId}`,
        { vehicle_number: "TS09AB9999" },
        { headers: authHeaders() }
      );
      if (res.data.data.vehicle_number !== "TS09AB9999") {
        throw new Error("Vehicle number was not updated");
      }
    });

    await runTest("Deactivate and reactivate agent", async () => {
      const deactivate = await axios.patch(
        `${API_URL}/delivery-agents/${testAgentId}/deactivate`,
        {},
        { headers: authHeaders() }
      );
      if (deactivate.data.data.is_active !== false) {
        throw new Error("Agent was not deactivated");
      }

      const activate = await axios.patch(
        `${API_URL}/delivery-agents/${testAgentId}/activate`,
        {},
        { headers: authHeaders() }
      );
      if (activate.data.data.is_active !== true) {
        throw new Error("Agent was not reactivated");
      }
    });

    let deliveryId: string | null = null;

    await runTest("Assign bill to delivery", async () => {
      const billId = await createWalkInBill();

      const res = await axios.post(
        `${API_URL}/deliveries`,
        { bill_id: billId, delivery_agent_id: testAgentId },
        { headers: authHeaders() }
      );

      if (res.status !== 201) {
        throw new Error(`Expected 201, got ${res.status}`);
      }
      if (res.data.data.status !== "GENERATED") {
        throw new Error(
          `Expected status GENERATED, got ${res.data.data.status}`
        );
      }

      deliveryId = res.data.data.id;
    });

    await runTest(
      "Reject assigning delivery to non-existent bill",
      async () => {
        try {
          await axios.post(
            `${API_URL}/deliveries`,
            { bill_id: "999999999" },
            { headers: authHeaders() }
          );
          throw new Error("API accepted non-existent bill_id");
        } catch (error: any) {
          if (error.response?.status !== 404) {
            throw new Error(
              `Expected HTTP 404, got ${error.response?.status}`
            );
          }
        }
      }
    );

    await runTest(
      "Reject duplicate delivery assignment for same bill",
      async () => {
        const lastBillId =
          createdBillIds[createdBillIds.length - 1].toString();

        try {
          await axios.post(
            `${API_URL}/deliveries`,
            { bill_id: lastBillId },
            { headers: authHeaders() }
          );
          throw new Error("API accepted duplicate delivery for bill");
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(
              `Expected HTTP 409, got ${error.response?.status}`
            );
          }
        }
      }
    );

    await runTest(
      "Reject assigning delivery to a cancelled bill",
      async () => {
        const billId = await createWalkInBill();

        await axios.patch(
          `${API_URL}/bills/${billId}/cancel`,
          {},
          { headers: authHeaders() }
        );

        try {
          await axios.post(
            `${API_URL}/deliveries`,
            { bill_id: billId },
            { headers: authHeaders() }
          );
          throw new Error(
            "API accepted delivery assignment for cancelled bill"
          );
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(
              `Expected HTTP 409, got ${error.response?.status}`
            );
          }
        }
      }
    );

    await runTest("Get delivery by ID", async () => {
      const res = await axios.get(
        `${API_URL}/deliveries/${deliveryId}`,
        { headers: authHeaders() }
      );
      if (res.status !== 200 || res.data.data.id !== deliveryId) {
        throw new Error("Delivery retrieval by ID failed");
      }
    });

    await runTest("Get delivery by bill ID", async () => {
      const billId = createdBillIds[0].toString();
      const res = await axios.get(
        `${API_URL}/deliveries/bill/${billId}`,
        { headers: authHeaders() }
      );
      if (res.status !== 200 || res.data.data.bill_id !== billId) {
        throw new Error("Delivery retrieval by bill ID failed");
      }
    });

    await runTest("List deliveries filtered by status", async () => {
      const res = await axios.get(
        `${API_URL}/deliveries?status=GENERATED`,
        { headers: authHeaders() }
      );
      if (
        res.data.data.some((d: any) => d.status !== "GENERATED")
      ) {
        throw new Error("Status filter returned wrong data");
      }
    });

    await runTest(
      "Reject invalid status transition (GENERATED -> REACHED)",
      async () => {
        try {
          await axios.patch(
            `${API_URL}/deliveries/${deliveryId}/status`,
            { status: "REACHED" },
            { headers: authHeaders() }
          );
          throw new Error("API accepted an invalid transition");
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(
              `Expected HTTP 409, got ${error.response?.status}`
            );
          }
        }
      }
    );

    await runTest(
      "Full pipeline GENERATED -> SENT -> REACHED -> CLEARED",
      async () => {
        const sent = await axios.patch(
          `${API_URL}/deliveries/${deliveryId}/status`,
          { status: "SENT" },
          { headers: authHeaders() }
        );
        if (!sent.data.data.sent_at) {
          throw new Error("sent_at was not stamped");
        }

        const reached = await axios.patch(
          `${API_URL}/deliveries/${deliveryId}/status`,
          { status: "REACHED" },
          { headers: authHeaders() }
        );
        if (!reached.data.data.reached_at) {
          throw new Error("reached_at was not stamped");
        }

        const cleared = await axios.patch(
          `${API_URL}/deliveries/${deliveryId}/status`,
          { status: "CLEARED" },
          { headers: authHeaders() }
        );
        if (!cleared.data.data.cleared_at) {
          throw new Error("cleared_at was not stamped");
        }
      }
    );

    await runTest(
      "Reject transition from terminal CLEARED state",
      async () => {
        try {
          await axios.patch(
            `${API_URL}/deliveries/${deliveryId}/status`,
            { status: "SENT" },
            { headers: authHeaders() }
          );
          throw new Error(
            "API accepted a transition out of CLEARED"
          );
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(
              `Expected HTTP 409, got ${error.response?.status}`
            );
          }
        }
      }
    );

    await runTest(
      "Reject reassigning agent on a cleared delivery",
      async () => {
        try {
          await axios.patch(
            `${API_URL}/deliveries/${deliveryId}/agent`,
            { delivery_agent_id: null },
            { headers: authHeaders() }
          );
          throw new Error(
            "API allowed reassignment on a cleared delivery"
          );
        } catch (error: any) {
          if (error.response?.status !== 409) {
            throw new Error(
              `Expected HTTP 409, got ${error.response?.status}`
            );
          }
        }
      }
    );

    await runTest(
      "Alternate pipeline REACHED -> BALANCE -> CLEARED",
      async () => {
        const billId = await createWalkInBill();

        const delivery = await axios.post(
          `${API_URL}/deliveries`,
          { bill_id: billId },
          { headers: authHeaders() }
        );
        const id = delivery.data.data.id;

        await axios.patch(
          `${API_URL}/deliveries/${id}/status`,
          { status: "SENT" },
          { headers: authHeaders() }
        );
        await axios.patch(
          `${API_URL}/deliveries/${id}/status`,
          { status: "REACHED" },
          { headers: authHeaders() }
        );

        const balance = await axios.patch(
          `${API_URL}/deliveries/${id}/status`,
          { status: "BALANCE" },
          { headers: authHeaders() }
        );
        if (balance.data.data.status !== "BALANCE") {
          throw new Error("Did not transition to BALANCE");
        }

        const cleared = await axios.patch(
          `${API_URL}/deliveries/${id}/status`,
          { status: "CLEARED" },
          { headers: authHeaders() }
        );
        if (cleared.data.data.status !== "CLEARED") {
          throw new Error("Did not transition BALANCE -> CLEARED");
        }
      }
    );

    await runTest("Reassign delivery agent on an open delivery", async () => {
      const billId = await createWalkInBill();

      const delivery = await axios.post(
        `${API_URL}/deliveries`,
        { bill_id: billId },
        { headers: authHeaders() }
      );
      const id = delivery.data.data.id;

      const res = await axios.patch(
        `${API_URL}/deliveries/${id}/agent`,
        { delivery_agent_id: testAgentId },
        { headers: authHeaders() }
      );

      if (res.data.data.delivery_agent_id !== testAgentId) {
        throw new Error("Agent was not assigned");
      }
    });

    /*
     * TEMPORARY AGENT NAME (one-off agent, not added to the
     * permanent delivery_agents list)
     */
    await runTest(
      "Assign bill with a temporary agent name",
      async () => {
        const billId = await createWalkInBill();

        const res = await axios.post(
          `${API_URL}/deliveries`,
          { bill_id: billId, temp_agent_name: "Raju - Auto" },
          { headers: authHeaders() }
        );

        if (res.status !== 201) {
          throw new Error(`Expected 201, got ${res.status}`);
        }
        if (res.data.data.temp_agent_name !== "Raju - Auto") {
          throw new Error(
            `Expected temp_agent_name "Raju - Auto", got "${res.data.data.temp_agent_name}"`
          );
        }
        if (res.data.data.delivery_agent_id !== null) {
          throw new Error(
            "Temporary agent bill unexpectedly has a delivery_agent_id"
          );
        }
      }
    );

    await runTest(
      "Temporary agent is not created in the permanent Agents list",
      async () => {
        const before = await axios.get(`${API_URL}/delivery-agents`, {
          headers: authHeaders(),
        });
        const countBefore = before.data.count;

        const billId = await createWalkInBill();
        await axios.post(
          `${API_URL}/deliveries`,
          { bill_id: billId, temp_agent_name: "Suresh - Tata Ace" },
          { headers: authHeaders() }
        );

        const after = await axios.get(`${API_URL}/delivery-agents`, {
          headers: authHeaders(),
        });

        if (after.data.count !== countBefore) {
          throw new Error(
            `Agents list count changed (${countBefore} -> ${after.data.count}) — a temporary agent was persisted as a permanent one`
          );
        }

        const match = (after.data.data as any[]).find(
          (a) => a.name === "Suresh - Tata Ace"
        );
        if (match) {
          throw new Error(
            "Temporary agent name leaked into the permanent Agents list"
          );
        }
      }
    );

    await runTest(
      "Bill with no agent leaves delivery unassigned",
      async () => {
        const billId = await createWalkInBill();

        const res = await axios.post(
          `${API_URL}/deliveries`,
          { bill_id: billId },
          { headers: authHeaders() }
        );

        if (res.data.data.delivery_agent_id !== null) {
          throw new Error("Expected delivery_agent_id to be null");
        }
        if (res.data.data.temp_agent_name !== null) {
          throw new Error("Expected temp_agent_name to be null");
        }
      }
    );

    await runTest(
      "Reject assigning both an existing agent and a temporary agent name",
      async () => {
        const billId = await createWalkInBill();

        try {
          await axios.post(
            `${API_URL}/deliveries`,
            {
              bill_id: billId,
              delivery_agent_id: testAgentId,
              temp_agent_name: "Ramesh - Riksha",
            },
            { headers: authHeaders() }
          );
          throw new Error("API accepted both an agent ID and a temp name");
        } catch (error: any) {
          if (error.response?.status !== 400) {
            throw new Error(
              `Expected HTTP 400, got ${error.response?.status ?? error.message}`
            );
          }
        }
      }
    );

    await runTest(
      "Reassigning to a temporary agent clears any existing agent link",
      async () => {
        const billId = await createWalkInBill();

        const delivery = await axios.post(
          `${API_URL}/deliveries`,
          { bill_id: billId, delivery_agent_id: testAgentId },
          { headers: authHeaders() }
        );
        const id = delivery.data.data.id;

        const res = await axios.patch(
          `${API_URL}/deliveries/${id}/agent`,
          { temp_agent_name: "Auto AP03XX1234" },
          { headers: authHeaders() }
        );

        if (res.data.data.temp_agent_name !== "Auto AP03XX1234") {
          throw new Error("Temporary agent name was not set on reassign");
        }
        if (res.data.data.delivery_agent_id !== null) {
          throw new Error(
            "Existing agent link was not cleared when reassigning to a temporary name"
          );
        }
      }
    );

    await runTest(
      "Existing agent still appears correctly via its own endpoint",
      async () => {
        const res = await axios.get(
          `${API_URL}/delivery-agents/${testAgentId}`,
          { headers: authHeaders() }
        );

        if (res.status !== 200 || res.data.data.id !== testAgentId) {
          throw new Error("Existing permanent agent lookup failed");
        }
      }
    );

    await runTest(
      "Reject unauthenticated access on delivery endpoints",
      async () => {
        const calls = [
          () => axios.post(`${API_URL}/deliveries`, {}),
          () => axios.get(`${API_URL}/deliveries`),
          () => axios.get(`${API_URL}/delivery-agents`),
          () =>
            axios.patch(`${API_URL}/deliveries/1/status`, {
              status: "SENT",
            }),
        ];

        for (const call of calls) {
          try {
            await call();
            throw new Error("Unauthenticated request was accepted");
          } catch (error: any) {
            if (error.response?.status !== 401) {
              throw new Error(
                `Expected 401, got ${
                  error.response?.status ?? error.message
                }`
              );
            }
          }
        }
      }
    );

    await runTest("Reject cross-business delivery access", async () => {
      const business2 = await prisma.businesses.create({
        data: {
          name: `Delivery Test Business 2 ${Date.now()}`,
          is_active: true,
        },
      });
      business2Id = business2.id;

      const passwordHash = await bcrypt.hash("TestPass@123", 12);
      const username2 = `delivery_test_admin2_${Date.now()}`;

      const user2 = await prisma.users.create({
        data: {
          business_id: business2.id,
          name: "Delivery Test Admin 2",
          username: username2,
          password_hash: passwordHash,
          role: "ADMIN",
          is_active: true,
        },
      });
      user2Id = user2.id;

      const loginRes = await axios.post(`${API_URL}/auth/login`, {
        username: username2,
        password: "TestPass@123",
      });
      token2 = loginRes.data.data.token;

      try {
        await axios.get(`${API_URL}/deliveries/${deliveryId}`, {
          headers: authHeaders(token2),
        });
        throw new Error(
          "Business 2 token accessed Business 1 delivery"
        );
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(
            `Expected HTTP 404, got ${error.response?.status}`
          );
        }
      }

      try {
        await axios.get(
          `${API_URL}/delivery-agents/${testAgentId}`,
          { headers: authHeaders(token2) }
        );
        throw new Error(
          "Business 2 token accessed Business 1 delivery agent"
        );
      } catch (error: any) {
        if (error.response?.status !== 404) {
          throw new Error(
            `Expected HTTP 404, got ${error.response?.status}`
          );
        }
      }

      const listRes = await axios.get(`${API_URL}/deliveries`, {
        headers: authHeaders(token2),
      });
      if (listRes.data.count !== 0) {
        throw new Error(
          "Business 2 delivery list leaked Business 1 data"
        );
      }
    });
  } finally {
    try {
      for (const billId of createdBillIds) {
        await prisma.bill_deliveries.deleteMany({
          where: { bill_id: billId },
        });
        await prisma.payment_allocations.deleteMany({
          where: { bill_id: billId },
        });
        await prisma.ledger_entries.deleteMany({
          where: { bill_id: billId },
        });
        await prisma.audit_logs.deleteMany({
          where: { entity_type: "bill", entity_id: billId },
        });
        await prisma.bill_items.deleteMany({
          where: { bill_id: billId },
        });
        await prisma.bills.deleteMany({ where: { id: billId } });
      }

      for (const agentId of createdAgentIds) {
        await prisma.bill_deliveries.updateMany({
          where: { delivery_agent_id: agentId },
          data: { delivery_agent_id: null },
        });
        await prisma.delivery_agents.deleteMany({
          where: { id: agentId },
        });
      }

      for (const itemId of createdItemIds) {
        await prisma.item_units.deleteMany({
          where: { item_id: itemId },
        });
        await prisma.items.deleteMany({ where: { id: itemId } });
      }

      if (testCategoryId) {
        await prisma.categories.deleteMany({ where: { id: BigInt(testCategoryId) } });
      }

      if (business2Id) {
        if (user2Id) {
          await prisma.users.deleteMany({ where: { id: user2Id } });
        }
        await prisma.businesses.deleteMany({
          where: { id: business2Id },
        });
      }
    } catch (cleanupErr) {
      console.error("Cleanup warning:", cleanupErr);
    }
  }

  console.log("\n========================================");
  console.log(" TEST REPORT");
  console.log("========================================\n");

  for (const result of results) {
    const icon = result.status === "PASS" ? "✓" : "✗";
    console.log(`${icon} ${result.status} - ${result.test}`);
    if (result.details) console.log(`  ${result.details}`);
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log("\n========================================");
  console.log(`TOTAL  : ${results.length}`);
  console.log(`PASSED : ${passed}`);
  console.log(`FAILED : ${failed}`);
  console.log("========================================\n");

  if (failed > 0) process.exitCode = 1;
}

runDeliveryTests();
