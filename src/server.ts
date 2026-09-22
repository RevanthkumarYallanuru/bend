import app from "./app";
import { env } from "./config/env";

const server = app.listen(env.PORT, () => {
  console.log(
    `Lakshmi Ganapathi Enterprises API running on http://localhost:${env.PORT}`
  );
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