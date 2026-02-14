import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { sign } from "hono/jwt";
import type { Client } from "@libsql/client";
import { createDatabase } from "./storage/sqlite.js";
import { LocalStorage } from "./storage/local.js";
import { createApiApp } from "./app.js";

const TEST_JWT_SECRET = "test-secret-key";
const fixturesDir = resolve(import.meta.dirname, "../../../fixtures");
const rideOrDie = readFileSync(resolve(fixturesDir, "ride-or-die.soul.md"), "utf-8");
const chaosGoblin = readFileSync(resolve(fixturesDir, "chaos-goblin.soul.md"), "utf-8");

let tmpDir: string;
let db: Client;
let storage: LocalStorage;
let app: ReturnType<typeof createApiApp>;
let authToken: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "opensoul-test-"));
  db = await createDatabase(`file:${join(tmpDir, "test.db")}`);
  storage = new LocalStorage(join(tmpDir, "registry"));
  app = createApiApp(db, storage);

  process.env.JWT_SECRET = TEST_JWT_SECRET;

  // Create a test user and generate a JWT
  await db.execute({
    sql: "INSERT INTO users (github_id, github_username, avatar_url) VALUES (?, ?, ?)",
    args: [12345, "testuser", "https://example.com/avatar.png"],
  });
  authToken = await sign(
    { id: 1, github_id: 12345, github_username: "testuser", exp: Math.floor(Date.now() / 1000) + 3600 },
    TEST_JWT_SECRET
  );
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true });
  delete process.env.JWT_SECRET;
});

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };
}

describe("Soul CRUD API", () => {
  it("rejects upload without auth", async () => {
    const res = await app.request("/api/v1/souls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: rideOrDie }),
    });
    expect(res.status).toBe(401);
  });

  it("uploads a new soul with auth", async () => {
    const res = await app.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: rideOrDie }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.hash).toHaveLength(64);
  });

  it("sets author from GitHub username", async () => {
    await app.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: rideOrDie }),
    });

    const listRes = await app.request("/api/v1/souls");
    const body = await listRes.json();
    expect(body.data[0].author).toBe("testuser");
  });

  it("allows duplicate names with different IDs and suffixed labels", async () => {
    const res1 = await app.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: rideOrDie }),
    });
    expect(res1.status).toBe(201);
    const data1 = await res1.json();

    const res2 = await app.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: rideOrDie }),
    });
    expect(res2.status).toBe(201);
    const data2 = await res2.json();

    expect(data1.slug).not.toBe(data2.slug);
    expect(data1.slug).toHaveLength(8);
    expect(data2.slug).toHaveLength(8);
    // Labels should be unique with suffix
    expect(data2.label).toBe(`${data1.label}-2`);
  });

  it("lists souls (public)", async () => {
    await app.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: rideOrDie }),
    });
    await app.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: chaosGoblin }),
    });

    const res = await app.request("/api/v1/souls");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pagination.total).toBe(2);
  });

  it("gets soul content (public)", async () => {
    await app.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: rideOrDie }),
    });

    const listRes = await app.request("/api/v1/souls");
    const listBody = await listRes.json();
    const slug = listBody.data[0].slug;

    const res = await app.request(`/api/v1/souls/${slug}/content`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(rideOrDie);
  });

  it("returns 404 for missing soul", async () => {
    const res = await app.request("/api/v1/souls/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("Soul Rating API", () => {
  it("rejects rating without auth", async () => {
    const res = await app.request("/api/v1/souls/some-soul/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 5 }),
    });
    expect(res.status).toBe(401);
  });

  it("rates a soul", async () => {
    await app.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: rideOrDie }),
    });

    const listRes = await app.request("/api/v1/souls");
    const listBody = await listRes.json();
    const slug = listBody.data[0].slug;

    const res = await app.request(`/api/v1/souls/${slug}/rate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ rating: 4 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rating_avg).toBe(4);
    expect(data.rating_count).toBe(1);
  });

  it("rejects invalid rating", async () => {
    await app.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: rideOrDie }),
    });

    const listRes = await app.request("/api/v1/souls");
    const listBody = await listRes.json();
    const slug = listBody.data[0].slug;

    const res = await app.request(`/api/v1/souls/${slug}/rate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ rating: 6 }),
    });

    expect(res.status).toBe(400);
  });
});
