import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { sign } from "hono/jwt";
import type { Client } from "@libsql/client";
import { createDatabase } from "./packages/api/src/storage/sqlite.js";
import { LocalStorage } from "./packages/api/src/storage/local.js";
import { createApiApp } from "./packages/api/src/app.js";

const TEST_JWT_SECRET = "e2e-test-secret";
const fixturesDir = resolve(import.meta.dirname, "fixtures");
const rideOrDie = readFileSync(resolve(fixturesDir, "ride-or-die.soul.md"), "utf-8");
const chaosGoblin = readFileSync(resolve(fixturesDir, "chaos-goblin.soul.md"), "utf-8");
const gentlePresence = readFileSync(resolve(fixturesDir, "gentle-presence.soul.md"), "utf-8");
const professionalWarmth = readFileSync(resolve(fixturesDir, "professional-warmth.soul.md"), "utf-8");

let tmpDir: string;
let db: Client;
let storage: LocalStorage;
let apiApp: ReturnType<typeof createApiApp>;
let authToken: string;
let authToken2: string;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "opensoul-e2e-"));
  db = await createDatabase(`file:${join(tmpDir, "e2e.db")}`);
  storage = new LocalStorage(join(tmpDir, "registry"));
  apiApp = createApiApp(db, storage);

  process.env.JWT_SECRET = TEST_JWT_SECRET;

  // Create two test users for rating tests
  await db.execute({
    sql: "INSERT INTO users (github_id, github_username, avatar_url) VALUES (?, ?, ?)",
    args: [99999, "e2euser", "https://example.com/avatar.png"],
  });
  await db.execute({
    sql: "INSERT INTO users (github_id, github_username, avatar_url) VALUES (?, ?, ?)",
    args: [88888, "e2euser2", "https://example.com/avatar2.png"],
  });

  authToken = await sign(
    { id: 1, github_id: 99999, github_username: "e2euser", exp: Math.floor(Date.now() / 1000) + 3600 },
    TEST_JWT_SECRET
  );
  authToken2 = await sign(
    { id: 2, github_id: 88888, github_username: "e2euser2", exp: Math.floor(Date.now() / 1000) + 3600 },
    TEST_JWT_SECRET
  );
});

afterAll(() => {
  db.close();
  rmSync(tmpDir, { recursive: true });
  delete process.env.JWT_SECRET;
});

function authHeaders(token = authToken): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

describe("E2E: Full registry + local workflow", () => {
  // --- Upload ---
  it("uploads all fixture souls to the registry", async () => {
    const fixtures = [rideOrDie, chaosGoblin, gentlePresence, professionalWarmth];
    for (const content of fixtures) {
      const res = await apiApp.request("/api/v1/souls", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content }),
      });
      expect(res.status).toBe(201);
    }

    const listRes = await apiApp.request("/api/v1/souls");
    const body = await listRes.json();
    expect(body.data.length).toBeGreaterThanOrEqual(4);
    expect(body.pagination.total).toBeGreaterThanOrEqual(4);
  });

  it("allows duplicate names (different IDs, suffixed labels)", async () => {
    const res = await apiApp.request("/api/v1/souls", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: rideOrDie }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toHaveLength(8);
    // Label should be suffixed since this name already exists
    expect(body.label).toMatch(/-\d+$/);
  });

  it("rejects upload without auth", async () => {
    const res = await apiApp.request("/api/v1/souls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: rideOrDie }),
    });
    expect(res.status).toBe(401);
  });

  // --- Search ---
  it("searches souls by keyword", async () => {
    const res = await apiApp.request("/api/v1/souls?search=chaos");
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].name).toContain("Chaos");
    expect(body.data[0].label).toBeDefined();
  });

  it("returns empty results for unknown query", async () => {
    const res = await apiApp.request("/api/v1/souls?search=zzz_nonexistent_zzz");
    const body = await res.json();
    expect(body.data).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  // --- Pagination ---
  it("paginates listing results", async () => {
    const res = await apiApp.request("/api/v1/souls?page=1&limit=2");
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.total).toBeGreaterThanOrEqual(4);
    expect(body.pagination.totalPages).toBeGreaterThanOrEqual(2);

    const res2 = await apiApp.request("/api/v1/souls?page=2&limit=2");
    const body2 = await res2.json();
    expect(body2.data).toHaveLength(2);
    expect(body2.pagination.page).toBe(2);
  });

  // --- Detail + Content ---
  it("retrieves soul metadata", async () => {
    const listRes = await apiApp.request("/api/v1/souls");
    const slug = (await listRes.json()).data[0].slug;

    const res = await apiApp.request(`/api/v1/souls/${slug}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe(slug);
    expect(body.author).toBe("e2euser");
    expect(body.versions).toBeDefined();
    expect(body.versions.data.length).toBeGreaterThanOrEqual(1);
  });

  it("retrieves soul content", async () => {
    const listRes = await apiApp.request("/api/v1/souls");
    const slug = (await listRes.json()).data[0].slug;

    const res = await apiApp.request(`/api/v1/souls/${slug}/content`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it("returns 404 for missing soul", async () => {
    const res = await apiApp.request("/api/v1/souls/nonexistent");
    expect(res.status).toBe(404);
  });

  // --- Rating ---
  it("rates a soul and updates cached stats", async () => {
    const listRes = await apiApp.request("/api/v1/souls");
    const slug = (await listRes.json()).data[0].slug;

    // User 1 rates 4
    const res1 = await apiApp.request(`/api/v1/souls/${slug}/rate`, {
      method: "POST",
      headers: authHeaders(authToken),
      body: JSON.stringify({ rating: 4 }),
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.rating_avg).toBe(4);
    expect(body1.rating_count).toBe(1);

    // User 2 rates 2
    const res2 = await apiApp.request(`/api/v1/souls/${slug}/rate`, {
      method: "POST",
      headers: authHeaders(authToken2),
      body: JSON.stringify({ rating: 2 }),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.rating_avg).toBe(3); // (4+2)/2
    expect(body2.rating_count).toBe(2);
  });

  it("allows user to update their rating (upsert)", async () => {
    const listRes = await apiApp.request("/api/v1/souls");
    const slug = (await listRes.json()).data[0].slug;

    // User 2 changes rating from 2 to 5
    const res = await apiApp.request(`/api/v1/souls/${slug}/rate`, {
      method: "POST",
      headers: authHeaders(authToken2),
      body: JSON.stringify({ rating: 5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rating_avg).toBe(4.5); // (4+5)/2
    expect(body.rating_count).toBe(2);
  });

  it("rejects invalid rating values", async () => {
    const listRes = await apiApp.request("/api/v1/souls");
    const slug = (await listRes.json()).data[0].slug;

    const res = await apiApp.request(`/api/v1/souls/${slug}/rate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ rating: 0 }),
    });
    expect(res.status).toBe(400);

    const res2 = await apiApp.request(`/api/v1/souls/${slug}/rate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ rating: 6 }),
    });
    expect(res2.status).toBe(400);
  });

  it("rejects rating without auth", async () => {
    const res = await apiApp.request("/api/v1/souls/some-slug/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 5 }),
    });
    expect(res.status).toBe(401);
  });

  // --- Sort ---
  it("sorts by top rating", async () => {
    // Rate a second soul higher
    const listRes = await apiApp.request("/api/v1/souls");
    const slugs = (await listRes.json()).data.map((s: { slug: string }) => s.slug);
    const secondSlug = slugs[1];

    await apiApp.request(`/api/v1/souls/${secondSlug}/rate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ rating: 5 }),
    });
    await apiApp.request(`/api/v1/souls/${secondSlug}/rate`, {
      method: "POST",
      headers: authHeaders(authToken2),
      body: JSON.stringify({ rating: 5 }),
    });

    const topRes = await apiApp.request("/api/v1/souls?sort=top");
    const topBody = await topRes.json();
    // The soul with rating 5.0 should come before the one with 4.5
    expect(topBody.data[0].rating_avg).toBeGreaterThanOrEqual(topBody.data[1].rating_avg);
  });

  it("sorts by popular (most ratings)", async () => {
    const popRes = await apiApp.request("/api/v1/souls?sort=popular");
    const popBody = await popRes.json();
    // Rated souls should appear before unrated ones
    expect(popBody.data[0].rating_count).toBeGreaterThan(0);
  });

  // --- New version ---
  it("publishes a new version of an existing soul", async () => {
    const listRes = await apiApp.request("/api/v1/souls");
    const slug = (await listRes.json()).data[0].slug;

    const updatedContent = `${rideOrDie}\n<!-- updated -->`;
    const res = await apiApp.request(`/api/v1/souls/${slug}/versions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content: updatedContent, changelog: "Minor update" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe("1.0.1");

    // Check version history
    const detailRes = await apiApp.request(`/api/v1/souls/${slug}`);
    const detail = await detailRes.json();
    expect(detail.versions.data.length).toBeGreaterThanOrEqual(2);
  });
});

// --- Local swap/rollback ---
describe("E2E: Local swap and rollback", () => {
  let localHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    localHome = mkdtempSync(join(tmpdir(), "opensoul-e2e-swap-"));
    originalHome = process.env.HOME;
    process.env.HOME = localHome;

    // Create the workspace directory
    const wsDir = join(localHome, ".openclaw", "workspace");
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(join(wsDir, "SOUL.md"), "# Original Soul\nThis is the original.", "utf-8");
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(localHome, { recursive: true });
  });

  it("swaps, checks status, and rolls back", async () => {
    // Dynamic import to pick up the changed HOME
    const swap = await import("./packages/cli/src/swap.js");

    // Initial state
    expect(swap.isSwapped()).toBe(false);
    expect(swap.hasBackup()).toBe(false);

    const original = swap.readCurrentSoul();
    expect(original).toContain("Original Soul");

    // Swap in a new soul
    const { backedUp } = swap.swapSoul(chaosGoblin);
    expect(backedUp).toBe(true);
    expect(swap.isSwapped()).toBe(true);
    expect(swap.hasBackup()).toBe(true);

    const swapped = swap.readCurrentSoul();
    expect(swapped).toContain(chaosGoblin);

    // Swap again (no new backup since already swapped)
    const { backedUp: backedUp2 } = swap.swapSoul(gentlePresence);
    expect(backedUp2).toBe(false);
    expect(swap.isSwapped()).toBe(true);

    // Rollback
    const restored = swap.rollbackSoul();
    expect(restored).toBe(true);

    const rolledBack = swap.readCurrentSoul();
    expect(rolledBack).toContain("Original Soul");
  });
});
