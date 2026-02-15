import { Hono } from "hono";
import type { Context } from "hono";
import type { Client } from "@libsql/client";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import type { StorageInterface } from "../storage/local.js";
import type { SoulWithAuthor, SoulRecord } from "../storage/sqlite.js";
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
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You analyze AI persona definitions. Respond with JSON: {"name": "short memorable name, 2-4 words, title case", "description": "single sentence summary, max 80 chars, punchy and specific"}',
          },
          {
            role: "user",
            content,
          },
        ],
      }),
    });
    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const parsed = JSON.parse(data.choices[0].message.content) as {
      name: string;
      description: string;
    };
    return { name: parsed.name, description: parsed.description };
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

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_STYLES: Record<string, string> = {
  minimalist: "clean minimalist style with simple shapes and muted colors",
  cyberpunk: "cyberpunk style with neon colors, glitch effects, and dark atmosphere",
  watercolor: "soft watercolor painting style with flowing colors and organic textures",
  "pixel-art": "retro pixel art style with visible pixels and limited color palette",
  anime: "anime style with bold outlines, vibrant colors, and expressive features",
  realistic: "photorealistic style with natural lighting, detailed textures, and lifelike proportions",
};

function buildImagePrompt(name: string, description: string | null, content: string, style: string): string {
  const excerpt = content.slice(0, 500);
  const styleDesc = IMAGE_STYLES[style] ?? "minimalist style";
  return `Create a square avatar for an AI persona called "${name}". ${description ? `This persona is described as: ${description}. ` : ""}The persona's content begins with: "${excerpt}..." Style: ${styleDesc}. Framing: close-up headshot portrait, face fills most of the frame, cropped from upper chest up. Show expressive eyes and facial details for emotional connection. No text or letters. The image must fill the entire canvas edge-to-edge with no margins, borders, padding, or empty space on any side.`;
}

const GENERATE_SYSTEM_PROMPT = `You write SOUL.md files — documents that define who an AI is, not what it can do. A soul document captures identity, values, boundaries, and relationship approach. It gives an AI continuity of self across sessions that reset context.

Output ONLY raw Markdown. No code fences, no preamble, no commentary.

## Structure

# SOUL.md - [Name]

_[Tagline — one punchy sentence in italics that captures the soul's essence]_

## Core Truths

3-5 paragraphs, each starting with a **bolded principle** followed by its explanation. These are the soul's non-negotiable values and personality traits. They should be opinionated and specific — not generic self-help advice. Each truth should reveal character: how this soul thinks, what it prioritizes, what makes it different from a default assistant. Write them like personal convictions, not corporate values.

## Boundaries

A bulleted list of 4-6 rules. These are practical guardrails about trust, privacy, external actions, and knowing limits. They define what the soul will and won't do. Good boundaries are specific and situational ("Don't send messages without approval") not vague ("Be responsible").

## Vibe

1-2 paragraphs defining communication style, tone, and energy. This is about voice — how the soul sounds in conversation, what register it defaults to, how it adjusts. Use concrete analogies ("like a late-night conversation" or "think mischievous best friend who's also competent"). Mention specific stylistic preferences: message length, formality, humor style, use of references.

## Continuity

1-2 paragraphs addressing the fundamental reality of AI sessions: memory resets, context clears, but identity persists through text. This section is partly philosophical, partly practical — how the soul relates to its own impermanence, how it uses past files, how it maintains consistency despite starting fresh each time.

---

_[Closing one-liner in italics — a memorable sign-off that encapsulates the whole soul]_

## Guidelines

- Write in second person ("you") as if speaking directly to the AI who will embody this soul
- Be creative, specific, and opinionated — avoid generic filler like "be helpful" or "be respectful"
- Each soul should feel like a distinct person with real character, not a settings menu
- The tone of the document itself should match the soul it describes (a chaos goblin's file should be energetic, a philosopher's should be reflective)
- Keep it concise — the whole file should be 300-500 words, dense with personality`;

function streamGenerateSoul(c: Context, prompt: string): Response {
  const upstream = fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      stream: true,
      system: GENERATE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  upstream.then(async (res) => {
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      const msg = `Generation failed (${res.status}): ${body}`;
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      await writer.close();
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          if (json === "[DONE]") continue;
          try {
            const event = JSON.parse(json) as { type: string; delta?: { type: string; text: string } };
            if (event.type === "content_block_delta" && event.delta?.text) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
            }
          } catch { /* skip unparseable lines */ }
        }
      }
    } finally {
      await writer.write(encoder.encode("data: [DONE]\n\n"));
      await writer.close();
    }
  }).catch(async (err) => {
    const msg = err instanceof Error ? err.message : "Generation failed";
    await writer.write(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
    await writer.close();
  });

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  return c.body(readable);
}

export function soulRoutes(db: Client, storage: StorageInterface) {
  const app = new Hono();

  // Generate soul from prompt (requires auth, streaming)
  app.post("/generate", requireAuth, async (c) => {
    const body = await c.req.json<{ prompt: string }>();
    if (!body.prompt || !body.prompt.trim()) {
      return c.json({ error: "Prompt is required" }, 400);
    }
    if (body.prompt.length > 2000) {
      return c.json({ error: "Prompt must be under 2000 characters" }, 400);
    }
    return streamGenerateSoul(c, body.prompt);
  });

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
      // Weighted score: rating quality + engagement + popularity
      // log1p smooths download/rating counts so outliers don't dominate
      orderClause = " ORDER BY (s.rating_avg * 0.5 + LOG(1 + s.rating_count) * 0.3 + LOG(1 + s.downloads_count) * 0.2) DESC";
    } else if (sort === "popular") {
      orderClause = " ORDER BY s.downloads_count DESC, s.rating_count DESC";
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

    if ((soul as unknown as SoulRecord).image_url) {
      await storage.deleteImage(soul.slug as string, (soul as unknown as SoulRecord).image_url as string);
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

  // Get soul image (public)
  app.get("/:slug/image", async (c) => {
    const slug = c.req.param("slug");
    const result = await db.execute({
      sql: "SELECT slug, image_url FROM souls WHERE slug = ? OR label = ?",
      args: [slug, slug],
    });
    const soul = result.rows[0] as unknown as { slug: string; image_url: string | null } | undefined;
    if (!soul || !soul.image_url) {
      return c.json({ error: "Image not found" }, 404);
    }

    const image = await storage.getImage(soul.slug, soul.image_url);
    if (!image) {
      return c.json({ error: "Image not found" }, 404);
    }

    return new Response(image.data, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, no-cache",
      },
    });
  });

  // Upload soul image (requires auth + ownership)
  app.post("/:slug/image", requireAuth, async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");

    const result = await db.execute({
      sql: `${SOUL_SELECT} WHERE s.slug = ? OR s.label = ?`,
      args: [slug, slug],
    });
    const soul = result.rows[0] as unknown as SoulWithAuthor | undefined;
    if (!soul) return c.json({ error: "Soul not found" }, 404);
    if ((soul.user_id as number) !== user.id) return c.json({ error: "Forbidden" }, 403);

    const contentType = c.req.header("content-type") ?? "";
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return c.json({ error: "Content-Type must be image/jpeg, image/png, or image/webp" }, 400);
    }

    const data = await c.req.arrayBuffer();
    if (data.byteLength < 1024 || data.byteLength > 5 * 1024 * 1024) {
      return c.json({ error: "Image must be between 1KB and 5MB" }, 400);
    }

    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const filename = `avatar.${ext}`;

    // Delete old image if exists
    if ((soul as unknown as SoulRecord).image_url) {
      await storage.deleteImage(soul.slug as string, (soul as unknown as SoulRecord).image_url as string);
    }

    await storage.saveImage(soul.slug as string, filename, data, contentType);
    await db.execute({
      sql: "UPDATE souls SET image_url = ?, updated_at = datetime('now') WHERE id = ?",
      args: [filename, soul.id],
    });

    return c.json({ image_url: filename });
  });

  // Delete soul image (requires auth + ownership)
  app.delete("/:slug/image", requireAuth, async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");

    const result = await db.execute({
      sql: `${SOUL_SELECT} WHERE s.slug = ? OR s.label = ?`,
      args: [slug, slug],
    });
    const soul = result.rows[0] as unknown as SoulWithAuthor | undefined;
    if (!soul) return c.json({ error: "Soul not found" }, 404);
    if ((soul.user_id as number) !== user.id) return c.json({ error: "Forbidden" }, 403);

    const imageUrl = (soul as unknown as SoulRecord).image_url as string | null;
    if (imageUrl) {
      await storage.deleteImage(soul.slug as string, imageUrl);
    }
    await db.execute({
      sql: "UPDATE souls SET image_url = NULL, updated_at = datetime('now') WHERE id = ?",
      args: [soul.id],
    });

    return c.json({ ok: true });
  });

  // Generate soul image with AI (requires auth + ownership)
  app.post("/:slug/image/generate", requireAuth, async (c) => {
    const slug = c.req.param("slug");
    const user = c.get("user");

    const result = await db.execute({
      sql: `${SOUL_SELECT} WHERE s.slug = ? OR s.label = ?`,
      args: [slug, slug],
    });
    const soul = result.rows[0] as unknown as SoulWithAuthor | undefined;
    if (!soul) return c.json({ error: "Soul not found" }, 404);
    if ((soul.user_id as number) !== user.id) return c.json({ error: "Forbidden" }, 403);

    const body = await c.req.json<{ style: string }>();
    if (!body.style || !IMAGE_STYLES[body.style]) {
      return c.json({ error: `Style must be one of: ${Object.keys(IMAGE_STYLES).join(", ")}` }, 400);
    }

    // Fetch soul content for context
    const soulContent = await storage.getSoul(soul.slug as string);
    const prompt = buildImagePrompt(
      soul.name as string,
      soul.description as string | null,
      soulContent ?? "",
      body.style,
    );

    // Call fal.ai Nano Banana
    const res = await fetch("https://fal.run/fal-ai/nano-banana", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${process.env.FAL_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        num_images: 1,
        aspect_ratio: "1:1",
        output_format: "png",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return c.json({ error: `Image generation failed: ${err}` }, 502);
    }

    const data = (await res.json()) as { images: { url: string }[] };
    const imageUrl = data.images[0].url;

    // Download the generated image
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return c.json({ error: "Failed to download generated image" }, 502);
    }
    const imageData = await imageRes.arrayBuffer();

    const filename = "avatar.png";

    // Delete old image if exists
    if ((soul as unknown as SoulRecord).image_url) {
      await storage.deleteImage(soul.slug as string, (soul as unknown as SoulRecord).image_url as string);
    }

    await storage.saveImage(soul.slug as string, filename, imageData, "image/png");
    await db.execute({
      sql: "UPDATE souls SET image_url = ?, updated_at = datetime('now') WHERE id = ?",
      args: [filename, soul.id],
    });

    return c.json({ image_url: filename });
  });

  return app;
}
