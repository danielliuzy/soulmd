import { createClient } from "@libsql/client/web";
import { createApiApp } from "./app.js";
import { S3Storage } from "./storage/s3.js";
import { createDatabase } from "./storage/sqlite.js";

export interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_REDIRECT_URI?: string;
  JWT_SECRET: string;
  WEB_APP_URL?: string;
  OPENAI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Set env vars for middleware/routes that read from process.env
    // (Workers don't have process.env natively, but we bridge it)
    (globalThis as any).process ??= { env: {} };
    Object.assign(process.env, {
      GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
      GITHUB_REDIRECT_URI: env.GITHUB_REDIRECT_URI,
      JWT_SECRET: env.JWT_SECRET,
      WEB_APP_URL: env.WEB_APP_URL,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
    });

    const db = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });

    // Run migrations on first request (idempotent)
    await createDatabase(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

    const storage = new S3Storage({
      endpoint: env.R2_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
    });

    const app = createApiApp(db, storage);
    return app.fetch(request);
  },
};
