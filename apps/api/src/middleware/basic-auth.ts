import { createMiddleware } from "hono/factory";
import { ApiError } from "../http/errors";

// Paths that bypass auth even when enabled
const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/claude/start",
  "/api/auth/claude/callback",
  "/api/auth/claude/exchange",
  "/api/auth/codex/save-auth",
  "/health",
  "/",
];

// In-memory token store: token -> { username, expiresAt }
export const tokenStore = new Map<string, { username: string; expiresAt: number }>();

export const basicAuthMiddleware = createMiddleware(async (context, next) => {
  const authUsername = process.env.AUTH_USERNAME;
  const authPassword = process.env.AUTH_PASSWORD;

  // Auth is disabled when env vars not set
  if (!authUsername || !authPassword) {
    return next();
  }

  const path = new URL(context.req.url).pathname;

  // Skip auth for public paths
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return next();
  }

  // Check Bearer token
  const authHeader = context.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "unauthorized", "Authentication required");
  }

  const token = authHeader.slice(7);
  const session = tokenStore.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (session) tokenStore.delete(token); // cleanup expired
    throw new ApiError(401, "unauthorized", "Invalid or expired token");
  }

  return next();
});
