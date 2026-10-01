import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { env } from "./env";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

const basePrisma = new PrismaClient({
  adapter,
});

function isTransientConnectionError(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  // P2024: Prisma timed out acquiring a connection from the pool.
  // ETIMEDOUT/ECONNRESET: the driver couldn't (re)establish one — this
  // is Neon dropping an idle pooled connection, seen intermittently on
  // whichever query happens to be first to reuse it. In both cases the
  // query was never actually sent to Postgres, so retrying is safe.
  if (code === "P2024" || code === "ETIMEDOUT" || code === "ECONNRESET") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Connection terminated unexpectedly");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Neon's free-tier compute scales to zero after 5 minutes idle. Waking
// it back up from a full stop (not just a dropped idle connection) can
// take a few seconds, not milliseconds — so the retry has to actually
// wait that out, with a few attempts of growing backoff, rather than
// firing again almost immediately.
const RETRY_DELAYS_MS = [300, 800, 1500, 2500];

/** Retries on a connection blip — Neon (the DB host) either drops an
 * idle pooled connection or, on the free tier, fully suspends its
 * compute after 5 minutes idle; either way the next query fails with
 * ETIMEDOUT/P2024 even though the database itself is fine, and just
 * needs a moment to reconnect/wake up. Without this, that shows up to
 * the user as a page that randomly fails to load. */
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
          if (!isTransientConnectionError(error) || attempt >= RETRY_DELAYS_MS.length) {
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