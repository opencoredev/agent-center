import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { db, users, sessions } from "@agent-center/db";

import { ApiError } from "../../../http/errors";
import type { ApiEnv } from "../../../http/types";
import { hashSessionToken } from "../../../services/session-token-service";

export const authGoogleRoutes = new Hono<ApiEnv>();

const SESSION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// In-memory CSRF state store (short-lived)
const stateStore = new Map<string, { createdAt: number }>();

authGoogleRoutes.get("/google/start", (context) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new ApiError(501, "not_configured", "Google OAuth is not configured");
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3100/api/auth/google/callback";
  const state = randomBytes(16).toString("hex");
  stateStore.set(state, { createdAt: Date.now() });

  // Cleanup old states (> 10 min)
  for (const [key, val] of stateStore) {
    if (Date.now() - val.createdAt > 600_000) stateStore.delete(key);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return context.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authGoogleRoutes.get("/google/callback", async (context) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3100/api/auth/google/callback";
  const webUrl = process.env.VITE_WEB_URL || "http://localhost:3100";

  if (!clientId || !clientSecret) {
    throw new ApiError(501, "not_configured", "Google OAuth is not configured");
  }

  const code = context.req.query("code");
  const state = context.req.query("state");
  const error = context.req.query("error");

  if (error) {
    return context.redirect(`${webUrl}/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    throw new ApiError(400, "bad_request", "Missing code or state parameter");
  }

  // Validate state
  if (!stateStore.has(state)) {
    throw new ApiError(400, "invalid_state", "Invalid or expired OAuth state");
  }
  stateStore.delete(state);

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("[auth] Google token exchange failed:", await tokenRes.text());
    return context.redirect(`${webUrl}/login?error=token_exchange_failed`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; id_token?: string };

  // Fetch user info
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userInfoRes.ok) {
    return context.redirect(`${webUrl}/login?error=userinfo_failed`);
  }

  const userInfo = (await userInfoRes.json()) as {
    id: string;
    email: string;
    name?: string;
    picture?: string;
  };

  // Upsert user
  let [user] = await db.select().from(users).where(eq(users.email, userInfo.email)).limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: userInfo.email,
        name: userInfo.name ?? null,
        avatarUrl: userInfo.picture ?? null,
        authProvider: "google",
        authProviderId: userInfo.id,
      })
      .returning();
  } else if (user.authProvider !== "google") {
    // Update auth provider if they previously used a different one
    await db
      .update(users)
      .set({
        authProvider: "google",
        authProviderId: userInfo.id,
        name: userInfo.name ?? user.name,
        avatarUrl: userInfo.picture ?? user.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user!.id));
  }

  // Create session
  const sessionToken = `sess_${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  await db.insert(sessions).values({
    userId: user!.id,
    token: hashSessionToken(sessionToken),
    expiresAt,
  });

  // Keep bearer tokens out of request URLs and server access logs.
  return context.redirect(`${webUrl}/login#token=${encodeURIComponent(sessionToken)}`);
});
