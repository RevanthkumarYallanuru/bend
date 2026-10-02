import cors from "cors";
import express from "express";
import routes from "./routes";
import { env } from "./config/env";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());

app.use("/api", routes);

// Anything past here is a path no route matched — without this,
// Express falls through to its own default HTML 404 page instead of
// the JSON body every other response (success or error) on this API
// uses, which the frontend's error handling doesn't expect.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Not found",
  });
});

app.use(errorMiddleware);

export default app;