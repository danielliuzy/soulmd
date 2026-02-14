import { Hono } from "hono";
import type { Client } from "@libsql/client";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { StorageInterface } from "../storage/local.js";
import type { SoulWithAuthor } from "../storage/sqlite.js";
import { generateLabel } from "../storage/sqlite.js";
import { requireAuth } from "../middleware/auth.js";

const SOUL_SELECT = "SELECT s.*, u.github_username as author FROM souls s JOIN users u ON s.user_id = u.id";

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function fallbackName(content: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].replace(/^SOUL\.md\s*[-–—]\s*/i, "").trim();
  const firstLine = content.trim().split("\n")[0]?.trim();
  if (firstLine && firstLine.length <= 60) return firstLine;
  return `soul-${contentHash(content).slice(0, 8)}`;
}

async function summarize(content: string): Promise<{ name: string; description: string }> {
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        name: z
          .string()
          .describe(
            "A short, memorable name for this persona (2-4 words, title case). Examples: 'Gentle Presence', 'Chaos Goblin', 'Senior TypeScript Engineer'",
          ),
        description: z
          .string()
          .describe(
            "A single sentence summary of this persona, max 80 characters. Be punchy and specific, not generic.",
          ),
      }),
      prompt: `You are analyzing a personality/persona definition for an AI assistant. Generate a short name and description that capture the essence of this persona.\n\n${content}`,
    });
    return object;
  } catch {
    return { name: fallbackName(content), description: "" };
  }
}

function parseSoulRow(row: Record<string, unknown>) {
  return {
    ...row,
    tags: JSON.parse(row.tags as string),
  };
}

export function soulRoutes(db: Client, storage: StorageInterface) {
  const app = new Hono();

  // List/search souls (public)
  app.get("/", async (c) => {
    const tag = c.req.query("tag");
    const search = c.req.query("search");
    const sort = c.req.query("sort");
    const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    let whereClause = "";
    const params: (string | number)[] = [];

    if (tag) {
      whereClause = " WHERE s.tags LIKE ?";
      params.push(`%"${tag}"%`);
    } else if (search) {
      whereClause = " WHERE s.name LIKE ? OR s.description LIKE ? OR u.github_username LIKE ?";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    let orderClause = " ORDER BY s.updated_at DESC";
    if (sort === "top") {
      orderClause = " ORDER BY s.rating_avg DESC, s.rating_count DESC";
    } else if (sort === "popular") {
      orderClause = " ORDER BY s.rating_count DESC, s.rating_avg DESC";
    }

    const countResult = await db.execute({
      sql: `SELECT COUNT(*) as total FROM souls s JOIN users u ON s.user_id = u.id${whereClause}`,
      args: params,
    });
    const total = Number(countResult.rows[0].total);

    const query = `${SOUL_SELECT}${whereClause}${orderClause} LIMIT ? OFFSET ?`;
    const result = await db.execute({ sql: query, args: [...params, limit, offset] });

    return c.json({
      data: result.rows.map(parseSoulRow),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // Get soul metadata (public) — accepts slug (nanoid) or label
  app.get("/:slug", async (c) => {
    const slug = c.req.param("slug");

    const result = await db.execute({
      sql: `${SOUL_SELECT} WHERE s.slug = ? OR s.label = ?`,
      args: [slug, slug],
    });
    const soul = result.rows[0] as unknown as SoulWithAuthor | undefined;

    if (!soul) {
      return c.json({ error: "Soul not found" }, 404);
    }

    return c.json(parseSoulRow(soul as unknown as Record<string, unknown>));
  });

  // Get soul content (public) — accepts slug (nanoid) or label
  app.get("/:slug/content", async (c) => {
    const slug = c.req.param("slug");
    const result = await db.execute({
      sql: "SELECT * FROM souls WHERE slug = ? OR label = ?",
      args: [slug, slug],
    });
    const soul = result.rows[0] as unknown as { slug: string } | undefined;

    if (!soul) {
      return c.json({ error: "Soul not found" }, 404);
    }

    const content = await storage.getSoul(soul.slug);
    if (!content) {
      return c.json({ error: "Soul content not found" }, 404);
    }

    return c.text(content);
  });

  // Track a download (public)
  app.post("/:slug/download", async (c) => {
    const slug = c.req.param("slug");
    await db.execute({
      sql: "UPDATE souls SET downloads_count = downloads_count + 1 WHERE slug = ? OR label = ?",
      args: [slug, slug],
    });
    return c.json({ ok: true });
  });

  // Upload new soul (requires auth)
  app.post("/", requireAuth, async (c) => {
    const user = c.get("user");
    const body = await c.req.json<{ content: string }>();
    if (!body.content) {
      return c.json({ error: "Missing 'content' field" }, 400);
    }

    const { name, description } = await summarize(body.content);
    const slug = nanoid(8);
    const label = await generateLabel(db, name);
    const hash = contentHash(body.content);

    await storage.saveSoul(slug, body.content);

    await db.execute({
      sql: "INSERT INTO souls (slug, label, name, user_id, description, tags) VALUES (?, ?, ?, ?, ?, ?)",
      args: [slug, label, name, user.id, description, "[]"],
    });

    return c.json({ slug, label, name, hash }, 201);
  });

  // Update soul name/description (requires auth + ownership)
  app.patch("/:slug", requireAuth, async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");
    const body = await c.req.json<{ name?: string; description?: string; label?: string }>();

    if (!body.name && !body.description && !body.label) {
      return c.json({ error: "Nothing to update" }, 400);
    }

    const result = await db.execute({
      sql: `${SOUL_SELECT} WHERE s.slug = ? OR s.label = ?`,
      args: [slug, slug],
    });
    const soul = result.rows[0] as unknown as SoulWithAuthor | undefined;

    if (!soul) {
      return c.json({ error: "Soul not found" }, 404);
    }

    if ((soul.user_id as number) !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const updates: string[] = [];
    const args: (string | number)[] = [];

    if (body.name) {
      updates.push("name = ?");
      args.push(body.name);
      const newLabel = await generateLabel(db, body.name);
      updates.push("label = ?");
      args.push(newLabel);
    }

    if (body.label) {
      const existing = await db.execute({
        sql: "SELECT id FROM souls WHERE label = ? AND id != ?",
        args: [body.label, soul.id],
      });
      if (existing.rows.length > 0) {
        return c.json({ error: "Label already taken" }, 409);
      }
      updates.push("label = ?");
      args.push(body.label);
    }

    if (body.description !== undefined) {
      updates.push("description = ?");
      args.push(body.description);
    }

    updates.push("updated_at = datetime('now')");
    args.push(soul.id as number);

    await db.execute({
      sql: `UPDATE souls SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    const updated = await db.execute({
      sql: `${SOUL_SELECT} WHERE s.id = ?`,
      args: [soul.id],
    });

    return c.json(parseSoulRow(updated.rows[0] as unknown as Record<string, unknown>));
  });

  // Update soul content (requires auth + ownership)
  app.put("/:slug/content", requireAuth, async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");
    const body = await c.req.json<{ content: string }>();

    if (!body.content) {
      return c.json({ error: "Missing 'content' field" }, 400);
    }

    const result = await db.execute({
      sql: `${SOUL_SELECT} WHERE s.slug = ? OR s.label = ?`,
      args: [slug, slug],
    });
    const soul = result.rows[0] as unknown as SoulWithAuthor | undefined;

    if (!soul) {
      return c.json({ error: "Soul not found" }, 404);
    }

    if ((soul.user_id as number) !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await storage.saveSoul(soul.slug as string, body.content);
    await db.execute({
      sql: "UPDATE souls SET updated_at = datetime('now') WHERE id = ?",
      args: [soul.id],
    });

    return c.json({ ok: true });
  });

  // Delete soul (requires auth + ownership)
  app.delete("/:slug", requireAuth, async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");

    const result = await db.execute({
      sql: `${SOUL_SELECT} WHERE s.slug = ? OR s.label = ?`,
      args: [slug, slug],
    });
    const soul = result.rows[0] as unknown as SoulWithAuthor | undefined;

    if (!soul) {
      return c.json({ error: "Soul not found" }, 404);
    }

    if ((soul.user_id as number) !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await storage.deleteSoul(soul.slug as string);
    await db.execute({ sql: "DELETE FROM souls WHERE id = ?", args: [soul.id] });

    return c.json({ ok: true });
  });

  // Rate a soul (requires auth)
  app.post("/:slug/rate", requireAuth, async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");
    const body = await c.req.json<{ rating: number }>();

    if (!body.rating || body.rating < 1 || body.rating > 5 || !Number.isInteger(body.rating)) {
      return c.json({ error: "Rating must be an integer between 1 and 5" }, 400);
    }

    const soulResult = await db.execute({
      sql: "SELECT * FROM souls WHERE slug = ? OR label = ?",
      args: [slug, slug],
    });
    const soul = soulResult.rows[0] as unknown as { id: number } | undefined;
    if (!soul) {
      return c.json({ error: "Soul not found" }, 404);
    }

    await db.execute({
      sql: "INSERT INTO soul_ratings (soul_id, user_id, rating) VALUES (?, ?, ?) ON CONFLICT(soul_id, user_id) DO UPDATE SET rating = excluded.rating",
      args: [soul.id, user.id, body.rating],
    });

    const statsResult = await db.execute({
      sql: "SELECT AVG(rating) as avg, COUNT(*) as count FROM soul_ratings WHERE soul_id = ?",
      args: [soul.id],
    });
    const stats = statsResult.rows[0] as unknown as { avg: number; count: number };

    const avg = Math.round(stats.avg * 10) / 10;
    await db.execute({
      sql: "UPDATE souls SET rating_avg = ?, rating_count = ? WHERE id = ?",
      args: [avg, stats.count, soul.id],
    });

    return c.json({ slug, rating: body.rating, rating_avg: avg, rating_count: stats.count });
  });

  return app;
}
