// SOULmd.ai API
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Client } from "@libsql/client";
import { soulRoutes } from "./routes/soul.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/user.js";
import type { StorageInterface } from "./storage/local.js";

export function createApiApp(
  db: Client,
  storage: StorageInterface
) {
  const app = new Hono();

  app.use("*", cors());

  app.route("/api/v1/auth", authRoutes(db));
  app.route("/api/v1/souls", soulRoutes(db, storage));
  app.route("/api/v1/users", userRoutes(db));

  return app;
}
