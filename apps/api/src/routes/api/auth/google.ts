import { randomBytes } from "node:crypto";

import { api } from "@agent-center/control-plane/api";
import type { Id } from "@agent-center/control-plane/data-model";
import { Hono } from "hono";

import { ApiError } from "../../../http/errors";
import type { ApiEnv } from "../../../http/types";
import { convexServiceClient } from "../../../services/convex-service-client";
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

  const user = await convexServiceClient.mutation(api.serviceApi.upsertGoogleUser, {
    email: userInfo.email,
    googleId: userInfo.id,
    name: userInfo.name,
    avatarUrl: userInfo.picture,
  });

  if (!user) {
    throw new ApiError(500, "user_create_failed", "Failed to create user");
  }

  // Create session
  const sessionToken = `sess_${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

  await convexServiceClient.mutation(api.serviceApi.createSession, {
    userId: user.id as Id<"users">,
    tokenHash: hashSessionToken(sessionToken),
    expiresAt: expiresAt.getTime(),
  });

  // Keep bearer tokens out of request URLs and server access logs.
  return context.redirect(`${webUrl}/login#token=${encodeURIComponent(sessionToken)}`);
});
