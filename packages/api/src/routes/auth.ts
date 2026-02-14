import { Hono } from "hono";
import { sign } from "hono/jwt";
import type { Client } from "@libsql/client";
import type { UserRecord } from "../storage/sqlite.js";

export function authRoutes(db: Client) {
  const app = new Hono();

  // Redirect to GitHub OAuth authorize URL
  app.get("/github", (c) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return c.json({ error: "GITHUB_CLIENT_ID not configured" }, 500);
    }

    const redirectUri = process.env.GITHUB_REDIRECT_URI ?? `${c.req.url.replace(/\/api\/v1\/auth\/github$/, "")}/api/v1/auth/github/callback`;
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
    return c.redirect(url);
  });

  // GitHub OAuth callback — exchange code for token, create/update user, return JWT
  app.get("/github/callback", async (c) => {
    const code = c.req.query("code");
    if (!code) {
      return c.json({ error: "Missing 'code' parameter" }, 400);
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const jwtSecret = process.env.JWT_SECRET;

    if (!clientId || !clientSecret || !jwtSecret) {
      return c.json({ error: "OAuth not configured" }, 500);
    }

    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return c.json({ error: tokenData.error ?? "Failed to get access token" }, 400);
    }

    // Fetch GitHub user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "SoulMD-API",
      },
    });

    if (!userRes.ok) {
      return c.json({ error: "Failed to fetch GitHub user info" }, 400);
    }

    const ghUser = await userRes.json() as {
      id: number;
      login: string;
      avatar_url: string;
    };

    // Create or update user record
    const existingResult = await db.execute({ sql: "SELECT * FROM users WHERE github_id = ?", args: [ghUser.id] });
    const existing = existingResult.rows[0] as unknown as UserRecord | undefined;

    let userId: number;
    if (existing) {
      await db.execute({
        sql: "UPDATE users SET github_username = ?, avatar_url = ?, last_login = datetime('now') WHERE id = ?",
        args: [ghUser.login, ghUser.avatar_url, existing.id],
      });
      userId = existing.id;
    } else {
      const result = await db.execute({
        sql: "INSERT INTO users (github_id, github_username, avatar_url) VALUES (?, ?, ?)",
        args: [ghUser.id, ghUser.login, ghUser.avatar_url],
      });
      userId = Number(result.lastInsertRowid!);
    }

    // Issue JWT
    const token = await sign(
      {
        id: userId,
        github_id: ghUser.id,
        github_username: ghUser.login,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
      },
      jwtSecret
    );

    // Redirect to web app with auth params
    const webAppUrl = process.env.WEB_APP_URL ?? "https://soulmd.dev";
    const callbackUrl = new URL("/auth/callback", webAppUrl);
    callbackUrl.searchParams.set("token", token);
    callbackUrl.searchParams.set("id", String(userId));
    callbackUrl.searchParams.set("username", ghUser.login);
    callbackUrl.searchParams.set("avatar", ghUser.avatar_url);
    return c.redirect(callbackUrl.toString());
  });

  // Logout (client-side token discard — stateless JWT)
  app.post("/logout", (c) => {
    return c.json({ success: true });
  });

  return app;
}
