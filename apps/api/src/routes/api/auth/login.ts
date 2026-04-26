import { pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { api } from "@agent-center/control-plane/api";
import type { Id } from "@agent-center/control-plane/data-model";
import { Hono } from "hono";
import { ApiError } from "../../../http/errors";
import { ok } from "../../../http/responses";
import type { ApiEnv } from "../../../http/types";
import { tokenStore } from "../../../middleware/basic-auth";
import { convexServiceClient } from "../../../services/convex-service-client";
import { hashSessionToken } from "../../../services/session-token-service";

export const authLoginRoutes = new Hono<ApiEnv>();

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_HASH_PREFIX = "pbkdf2";
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_LENGTH = 16;
const PASSWORD_PBKDF2_ITERATIONS = 310_000;
const PASSWORD_PBKDF2_DIGEST = "sha256";
const pbkdf2 = promisify(pbkdf2Callback);

type LocalPasswordUser = {
  id: string;
  name?: string;
  passwordHash?: string;
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function isSignupDisabled() {
  return process.env.AUTH_SIGNUP_DISABLED === "true" || process.env.SIGNUP_DISABLED === "true";
}

function safeEqual(left: string, right: string) {
  try {
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

function validateCredentials(username: string | undefined, password: string | undefined) {
  const normalizedUsername = normalizeUsername(username ?? "");

  if (!normalizedUsername || !password) {
    throw new ApiError(400, "bad_request", "Username and password are required");
  }

  if (normalizedUsername.length < 3 || normalizedUsername.length > 64) {
    throw new ApiError(400, "bad_request", "Username must be between 3 and 64 characters");
  }

  if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
    throw new ApiError(
      400,
      "bad_request",
      "Username may only include letters, numbers, dots, underscores, and hyphens",
    );
  }

  if (password.length < 8 || password.length > 256) {
    throw new ApiError(400, "bad_request", "Password must be between 8 and 256 characters");
  }

  return { username: normalizedUsername, password };
}

async function hashPassword(password: string) {
  const salt = randomBytes(PASSWORD_SALT_LENGTH).toString("base64url");
  const key = (await pbkdf2(
    password,
    salt,
    PASSWORD_PBKDF2_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_PBKDF2_DIGEST,
  )) as Buffer;

  return [
    PASSWORD_HASH_PREFIX,
    PASSWORD_PBKDF2_ITERATIONS,
    PASSWORD_PBKDF2_DIGEST,
    salt,
    key.toString("base64url"),
  ].join("$");
}

async function verifyPassword(password: string, passwordHash: string | undefined) {
  if (!passwordHash) {
    return false;
  }

  const parts = passwordHash.split("$");
  if (parts.length !== 5 || parts[0] !== PASSWORD_HASH_PREFIX) {
    return false;
  }

  const [, iterations, digest, salt, expectedKey] = parts;
  if (!iterations || !digest || !salt || !expectedKey) {
    return false;
  }

  const key = (await pbkdf2(
    password,
    salt,
    Number(iterations),
    PASSWORD_KEY_LENGTH,
    digest,
  )) as Buffer;

  const expected = Buffer.from(expectedKey, "base64url");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

async function createPersistentSession(username: string, expiresAt: number) {
  const user = await convexServiceClient.mutation(api.serviceApi.upsertLocalBasicAuthUser, {
    username,
  });

  if (!user) {
    throw new ApiError(500, "user_create_failed", "Failed to create user");
  }

  const token = `sess_${randomBytes(32).toString("hex")}`;

  await convexServiceClient.mutation(api.serviceApi.createSession, {
    userId: user.id as Id<"users">,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return token;
}

async function createSessionForUser(userId: Id<"users">, expiresAt: number) {
  const token = `sess_${randomBytes(32).toString("hex")}`;

  await convexServiceClient.mutation(api.serviceApi.createSession, {
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });

  return token;
}

async function authenticatePersistentSession(token: string) {
  if (!token.startsWith("sess_")) {
    return null;
  }

  return await convexServiceClient.mutation(api.serviceApi.authenticateSessionToken, {
    tokenHash: hashSessionToken(token),
  });
}

async function deletePersistentSession(token: string) {
  if (!token.startsWith("sess_")) {
    return false;
  }

  return await convexServiceClient.mutation(api.serviceApi.deleteSessionByTokenHash, {
    tokenHash: hashSessionToken(token),
  });
}

function createLegacySession(username: string, expiresAt: number) {
  const token = randomBytes(32).toString("hex");

  tokenStore.set(token, {
    username,
    expiresAt,
  });

  return token;
}

authLoginRoutes.post("/login", async (context) => {
  const authUsername = process.env.AUTH_USERNAME;
  const authPassword = process.env.AUTH_PASSWORD;

  const body = await context.req.json<{ username: string; password: string }>();

  if (!body.username || !body.password) {
    throw new ApiError(400, "bad_request", "Username and password are required");
  }

  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;

  if (
    authUsername &&
    authPassword &&
    safeEqual(body.username, authUsername) &&
    safeEqual(body.password, authPassword)
  ) {
    let token: string;

    try {
      token = await createPersistentSession(authUsername, expiresAt);
    } catch (error) {
      console.warn("[auth] Falling back to in-memory local login session:", error);
      token = createLegacySession(authUsername, expiresAt);
    }

    return ok(context, {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  const username = normalizeUsername(body.username);
  const user = (await convexServiceClient.query(api.serviceApi.getLocalPasswordUser, {
    username,
  })) as LocalPasswordUser | null;

  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new ApiError(401, "invalid_credentials", "Invalid username or password");
  }

  const token = await createSessionForUser(user.id as Id<"users">, expiresAt);

  return ok(context, {
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

authLoginRoutes.post("/signup", async (context) => {
  if (isSignupDisabled()) {
    throw new ApiError(403, "signup_disabled", "Sign up is currently disabled");
  }

  const body = await context.req.json<{ username: string; password: string }>();
  const { username, password } = validateCredentials(body.username, body.password);
  const existingUser = await convexServiceClient.query(api.serviceApi.getLocalPasswordUser, {
    username,
  });

  if (existingUser) {
    throw new ApiError(409, "username_taken", "That username is already taken");
  }

  const passwordHash = await hashPassword(password);
  const user = (await convexServiceClient.mutation(api.serviceApi.createLocalPasswordUser, {
    username,
    passwordHash,
  })) as LocalPasswordUser | null;

  if (!user) {
    throw new ApiError(409, "username_taken", "That username is already taken");
  }

  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const token = await createSessionForUser(user.id as Id<"users">, expiresAt);

  return ok(
    context,
    {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    },
    201,
  );
});

authLoginRoutes.get("/me", async (context) => {
  const authUsername = process.env.AUTH_USERNAME;
  const authHeader = context.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "unauthorized", "Authentication required");
  }

  const token = authHeader.slice(7);

  try {
    const session = await authenticatePersistentSession(token);
    if (session) {
      return ok(context, {
        authenticated: true,
        username: authUsername ?? "local-basic",
      });
    }
  } catch (error) {
    console.warn("[auth] Failed to authenticate persistent local session:", error);
  }

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

  try {
    const deleted = await deletePersistentSession(token);
    if (!deleted) {
      tokenStore.delete(token);
    }
  } catch (error) {
    console.warn("[auth] Failed to delete persistent local session:", error);
    tokenStore.delete(token);
  }

  return ok(context, {
    message: "Logged out successfully",
  });
});
