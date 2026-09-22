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

app.use(errorMiddleware);

export default app;