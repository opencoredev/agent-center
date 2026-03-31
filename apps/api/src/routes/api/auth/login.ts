import { randomBytes, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { ApiError } from "../../../http/errors";
import { ok } from "../../../http/responses";
import type { ApiEnv } from "../../../http/types";
import { tokenStore } from "../../../middleware/basic-auth";

export const authLoginRoutes = new Hono<ApiEnv>();

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

authLoginRoutes.post("/login", async (context) => {
  const authUsername = process.env.AUTH_USERNAME;
  const authPassword = process.env.AUTH_PASSWORD;

  if (!authUsername || !authPassword) {
    throw new ApiError(401, "auth_disabled", "Authentication is not configured");
  }

  const body = await context.req.json<{ username: string; password: string }>();

  if (!body.username || !body.password) {
    throw new ApiError(400, "bad_request", "Username and password are required");
  }

  try {
    const usernameMatch = timingSafeEqual(
      Buffer.from(body.username),
      Buffer.from(authUsername),
    );
    const passwordMatch = timingSafeEqual(
      Buffer.from(body.password),
      Buffer.from(authPassword),
    );

    if (!usernameMatch || !passwordMatch) {
      throw new ApiError(401, "invalid_credentials", "Invalid username or password");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, "invalid_credentials", "Invalid username or password");
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;

  tokenStore.set(token, {
    username: authUsername,
    expiresAt,
  });

  return ok(context, {
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

authLoginRoutes.get("/me", async (context) => {
  const authHeader = context.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "unauthorized", "Authentication required");
  }

  const token = authHeader.slice(7);
  const session = tokenStore.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (session) tokenStore.delete(token);
    throw new ApiError(401, "unauthorized", "Invalid or expired token");
  }

  return ok(context, {
    authenticated: true,
    username: session.username,
  });
});

authLoginRoutes.post("/logout", async (context) => {
  const authHeader = context.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "unauthorized", "Authentication required");
  }

  const token = authHeader.slice(7);
  tokenStore.delete(token);

  return ok(context, {
    message: "Logged out successfully",
  });
});
