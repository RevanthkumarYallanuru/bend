import app from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";

const server = app.listen(env.PORT, () => {
  console.log(
    `Lakshmi Ganapathi Enterprises API listening on port ${env.PORT} (${env.NODE_ENV})`
  );
  // CORS_ORIGIN falls back to http://localhost:5173 when unset — fine
  // locally, but on the deployed backend that blocks every request from
  // the real frontend. Logged at startup so a wrong value is visible in
  // the host's logs straight away.
  console.log(`Allowed CORS origins: ${env.CORS_ORIGIN.join(", ")}`);
});

// Socket-inactivity ceiling: a connection that sends nothing for 35s is
// destroyed (Node has no "response must finish by" timer — this is the
// closest backstop). It sits just above the frontend's own 30s axios
// timeout, so the client always gives up first with a clean "request
// took too long" message; this only frees sockets a client has already
// abandoned. The database layer has its own tighter limits (see
// connectionTimeoutMillis/query_timeout in config/database.ts), so a
// request genuinely reaching this is not expected in normal operation.
server.timeout = 35_000;

// Best-effort: nudge Neon's compute awake as soon as the server starts,
// rather than waiting for the first real request to pay for that wake-up.
// The retry wrapper in config/database.ts already covers the case where
// this races a request anyway, so a failure here is not fatal.
prisma.businesses
  .count()
  .catch(() => {
    /* the retry wrapper already logged it; nothing else to do here */
  });

let shuttingDown = false;

/** Stop accepting new connections, let in-flight requests finish, close
 * the database pool, then exit. A hard deadline guarantees the process
 * actually exits even if a request never completes. */
function shutdown(reason: string, exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[server] Shutting down (${reason})`);

  const forceExit = setTimeout(() => {
    console.error("[server] Forced exit after shutdown deadline");
    process.exit(exitCode);
  }, 10_000);
  forceExit.unref();

  server.close(() => {
    prisma
      .$disconnect()
      .catch(() => {})
      .finally(() => process.exit(exitCode));
  });
}

// An uncaught exception or unhandled rejection means some code path
// escaped every try/catch — the process may now hold half-updated state,
// so it is treated as fatal rather than kept alive. Shutdown is graceful
// (other in-flight requests get to finish) and exits non-zero, so the
// host's process manager (Render restarts a service whose process exits)
// starts a clean instance. This matches Node's own default for both
// (crash), just with logging and without dropping in-flight requests.
process.on("uncaughtException", (error) => {
  console.error("[server] Uncaught exception:", error);
  shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
  shutdown("unhandledRejection", 1);
});

process.on("SIGINT", () => shutdown("SIGINT", 0));
process.on("SIGTERM", () => shutdown("SIGTERM", 0));
