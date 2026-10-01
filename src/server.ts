import app from "./app";
import { env } from "./config/env";
import { prisma } from "./config/database";

const server = app.listen(env.PORT, () => {
  console.log(
    `Lakshmi Ganapathi Enterprises API running on http://localhost:${env.PORT}`
  );
});

// Best-effort: nudge Neon's compute awake as soon as the server starts,
// rather than waiting for the first real request to pay for that wake-up.
// The retry wrapper in config/database.ts already covers the case where
// this races a request anyway, so a failure here is not fatal.
prisma.businesses
  .count()
  .catch(() => {
    /* the retry wrapper already logged it; nothing else to do here */
  });

process.on("SIGINT", () => {
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});