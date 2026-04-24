import { createHash } from "node:crypto";

import { api } from "@agent-center/control-plane/api";
import { createMiddleware } from "hono/factory";

import { ApiError } from "../http/errors";
import { convexServiceClient } from "../services/convex-service-client";
import { hashSessionToken } from "../services/session-token-service";

const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/google/start",
  "/api/auth/google/callback",
  "/api/auth/claude/start",
  "/api/auth/claude/callback",
  "/api/auth/github/start",
  "/api/auth/github/callback",
  "/api/github/webhook",
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
 * Auth fails closed by default. For local development only, set
 * AUTH_DISABLED=true to bypass API auth.
 */
export const authMiddleware = createMiddleware(async (context, next) => {
  const path = new URL(context.req.url).pathname;

  // Always allow public paths, internal routes with dedicated middleware, and frontend assets
  if (isPublicPath(path) || path.startsWith("/internal/") || isFrontendPath(path)) {
    return next();
  }

  const isDevelopmentAuthDisabled =
    process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";

  if (isDevelopmentAuthDisabled) {
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
    const apiKey = await convexServiceClient.mutation(api.serviceApi.authenticateApiKey, {
      keyHash,
    });

    if (!apiKey) {
      throw new ApiError(401, "unauthorized", "Invalid API key");
    }

    if (!apiKey.userId) {
      throw new ApiError(401, "unauthorized", "API key has no owner");
    }

    context.set("userId", apiKey.userId);
    return next();
  }

  // Strategy 2: Session token (prefixed with sess_)
  if (token.startsWith("sess_")) {
    const session = await convexServiceClient.mutation(api.serviceApi.authenticateSessionToken, {
      tokenHash: hashSessionToken(token),
    });

    if (!session) {
      throw new ApiError(401, "unauthorized", "Invalid session");
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
