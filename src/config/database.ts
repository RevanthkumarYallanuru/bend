import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { env } from "./env";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  // pg defaults this to 0 (wait forever for a connection). On Linux
  // (Render) a stalled connect then falls back to the OS TCP timeout,
  // around two minutes — far past any request timeout. A Neon cold
  // start normally completes in well under a second; 5s is a generous
  // ceiling, and the retry below covers anything slower.
  connectionTimeoutMillis: 5_000,
  // Client-side per-query ceiling (pg's own timer — no server-side
  // startup parameter, so it's safe through Neon's pooler) so a query
  // can never hang a request indefinitely. Every query in this app is
  // milliseconds; 20s matches the interactive transactions' own
  // `timeout: 20000` (see the $transaction options in the services).
  query_timeout: 20_000,
});

const basePrisma = new PrismaClient({
  adapter,
});

/** Errors that prove the query was never sent to Postgres — safe to
 * retry for any operation, including writes. */
function isConnectPhaseError(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  if (code === "P2024" || code === "ECONNREFUSED") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("timeout exceeded when trying to connect");
}

/** Connection drops that *may* have happened after Postgres already
 * ran the statement (e.g. a reset arriving after an INSERT committed).
 * Retrying those is only safe for reads — retrying a write could
 * create a duplicate bill/payment/customer. */
function isAmbiguousConnectionError(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  if (code === "ETIMEDOUT" || code === "ECONNRESET") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Connection terminated unexpectedly");
}

// Every non-transaction $queryRaw in this app is a pure SELECT (reports,
// stock tally, payables insights). The side-effecting raw calls
// (generate_bill_number(), SELECT ... FOR UPDATE) all run inside
// interactive transactions, where a dropped connection has already
// killed the transaction — a retry there just fails again, it can't
// duplicate anything. $executeRaw (an explicit write) is not listed.
const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "$queryRaw",
  "$queryRawUnsafe",
]);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Neon's free-tier compute scales to zero after 5 minutes idle; the
// first query after that has to wait for it to wake. Worst case for a
// read: 4 attempts x 5s connect ceiling + 5s of backoff = ~25s, which
// finishes before the frontend's 30s axios timeout — so even a request
// that does fail comes back as a clean JSON error, not a client-side
// timeout racing a still-running server.
const RETRY_DELAYS_MS = [500, 1500, 3000];

/** Retries on a connection blip — Neon either drops an idle pooled
 * connection or, on the free tier, fully suspends its compute after 5
 * minutes idle; either way the next query fails even though the
 * database itself is fine, and just needs a moment to reconnect/wake
 * up. Writes are only retried when the error proves the statement was
 * never sent (see isConnectPhaseError). */
// Cast back to the plain PrismaClient type: the extension only wraps
// existing calls with a retry, it adds no new surface, and every
// existing call site (including `Prisma.TransactionClient`-typed
// helpers built around `prisma.$transaction(async (tx) => ...)`)
// keeps working unchanged.
export const prisma = basePrisma.$extends({
  name: "retry-transient-connection-errors",
  query: {
    async $allOperations({ operation, model, args, query }) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await query(args);
        } catch (error) {
          const retryable =
            isConnectPhaseError(error) ||
            (READ_OPERATIONS.has(operation) && isAmbiguousConnectionError(error));
          if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
            throw error;
          }
          const wait = RETRY_DELAYS_MS[attempt];
          console.warn(
            `[db] transient connection error on ${model ?? ""}.${operation}, retrying in ${wait}ms (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`
          );
          await delay(wait);
        }
      }
    },
  },
}) as unknown as PrismaClient;