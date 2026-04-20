import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

import { db, apiKeys, sessions } from "@agent-center/db";

import { ApiError } from "../http/errors";

const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/google/start",
  "/api/auth/google/callback",
  "/api/auth/claude/start",
  "/api/auth/claude/callback",
  "/api/auth/github/start",
  "/api/auth/github/callback",
  "/api/runners/register",
  "/health",
  "/assets/",
];

function isPublicPath(path: string): boolean {
  if (path === "/") return true;
  return PUBLIC_PATHS.some((p) => path.startsWith(p));
}

function isFrontendPath(path: string): boolean {
  return (
    !path.startsWith("/api/") &&
    !path.startsWith("/ws") &&
    !path.startsWith("/internal/") &&
    path !== "/health"
  );
}

/**
 * Auth middleware that supports multiple strategies:
 *
 * 1. API keys (Bearer ac_xxx) — looked up via hash in api_keys table
 * 2. Session tokens (Bearer sess_xxx) — looked up in sessions table
 * 3. Legacy basic auth tokens (Bearer <hex>) — from in-memory tokenStore (backwards compat)
 *
 * Internal routes use their own dedicated auth middleware and are allowed to
 * continue through this layer untouched.
 *
 * When AUTH_USERNAME/AUTH_PASSWORD are not set and DEPLOY_MODE is 'self-hosted'
 * (default), user auth is disabled entirely.
 */
export const authMiddleware = createMiddleware(async (context, next) => {
  const path = new URL(context.req.url).pathname;

  // Always allow public paths, internal routes with dedicated middleware, and frontend assets
  if (isPublicPath(path) || path.startsWith("/internal/") || isFrontendPath(path)) {
    return next();
  }

  const deployMode = process.env.DEPLOY_MODE || "self-hosted";
  const authUsername = process.env.AUTH_USERNAME;
  const authPassword = process.env.AUTH_PASSWORD;

  // Self-hosted with no auth configured → auth disabled
  if (deployMode === "self-hosted" && !authUsername && !authPassword) {
    return next();
  }

  const authHeader = context.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "unauthorized", "Authentication required");
  }

  const token = authHeader.slice(7);

  // Strategy 1: API key (prefixed with ac_)
  if (token.startsWith("ac_")) {
    const keyHash = createHash("sha256").update(token).digest("hex");
    const [apiKey] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);

    if (!apiKey) {
      throw new ApiError(401, "unauthorized", "Invalid API key");
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new ApiError(401, "unauthorized", "API key expired");
    }

    // Update last used (fire-and-forget)
    void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKey.id));

    if (apiKey.userId) {
      context.set("userId", apiKey.userId);
    }
    return next();
  }

  // Strategy 2: Session token (prefixed with sess_)
  if (token.startsWith("sess_")) {
    const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);

    if (!session) {
      throw new ApiError(401, "unauthorized", "Invalid session");
    }

    if (session.expiresAt < new Date()) {
      // Cleanup expired session
      void db.delete(sessions).where(eq(sessions.id, session.id));
      throw new ApiError(401, "unauthorized", "Session expired");
    }

    context.set("userId", session.userId);
    return next();
  }

  // Strategy 3: Legacy in-memory token (from basic auth login)
  const { tokenStore } = await import("./basic-auth");
  const legacySession = tokenStore.get(token);

  if (legacySession && legacySession.expiresAt > Date.now()) {
    return next();
  }

  if (legacySession) {
    tokenStore.delete(token);
  }

  throw new ApiError(401, "unauthorized", "Invalid or expired token");
});
