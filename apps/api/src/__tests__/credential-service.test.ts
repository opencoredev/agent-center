import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { encrypt } from "@agent-center/shared";
import { Hono } from "hono";

import { ApiError } from "../http/errors";
import type { ApiEnv } from "../http/types";

const mockSelectResult: unknown[] = [];
const savedEnv: Record<string, string | undefined> = {};
let mockLastWhere: unknown;
let mockConvexMutationCalled = false;
let mockLastConvexQuery: unknown;
let mockLastConvexMutationArgs: unknown;
const mockConvexMutationCalls: unknown[] = [];

function withAwaitable<T extends object, TValue>(
  value: T,
  resolveValue: () => TValue | Promise<TValue>,
) {
  Object.defineProperty(value, "th" + "en", {
    value: (onFulfilled?: (value: TValue) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolveValue()).then(onFulfilled, onRejected),
  });
  return value;
}

const mockLimit = mock(() => Promise.resolve(mockSelectResult));
function createSelectWhereResult() {
  return withAwaitable({ limit: mockLimit }, () => mockSelectResult);
}
const mockWhere = mock((where: unknown) => {
  mockLastWhere = where;
  return createSelectWhereResult();
});
const mockFrom = mock(() => ({ where: mockWhere }));
const mockSelect = mock(() => ({ from: mockFrom }));

const mockOnConflictDoUpdate = mock(() => Promise.resolve());
const mockInsertValues = mock(() => {
  return withAwaitable(
    {
      onConflictDoUpdate: mockOnConflictDoUpdate,
      returning: () => Promise.resolve(mockSelectResult),
    },
    () => undefined,
  );
});
const mockInsert = mock(() => ({ values: mockInsertValues }));

const mockUpdateWhere = mock((where: unknown) => {
  mockLastWhere = where;
  return withAwaitable({}, () => undefined);
});
const mockUpdateSet = mock(() => ({ where: mockUpdateWhere }));
const mockUpdate = mock(() => ({ set: mockUpdateSet }));

const mockDeleteReturning = mock(() => Promise.resolve(mockSelectResult));
const mockDeleteWhere = mock((where: unknown) => {
  mockLastWhere = where;
  return withAwaitable({ returning: mockDeleteReturning }, () => undefined);
});
const mockDelete = mock(() => ({ where: mockDeleteWhere }));

mock.module("@agent-center/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  },
  apiKeys: {
    id: "id",
    userId: "userId",
    keyHash: "keyHash",
  },
  credentials: {
    provider: "provider",
    userId: "userId",
    id: "id",
    source: "source",
    encryptedApiKey: "encryptedApiKey",
    encryptedAccessToken: "encryptedAccessToken",
    tokenExpiresAt: "tokenExpiresAt",
    encryptedRefreshToken: "encryptedRefreshToken",
    profileEmail: "profileEmail",
    profileName: "profileName",
    subscriptionType: "subscriptionType",
    metadata: "metadata",
    updatedAt: "updatedAt",
  },
  sessions: {
    id: "sessionId",
    token: "sessionToken",
    userId: "sessionUserId",
    expiresAt: "sessionExpiresAt",
  },
}));

mock.module("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (...args: unknown[]) => ({ op: "eq", args }),
  isNull: (arg: unknown) => ({ op: "isNull", arg }),
}));

const mockConvexQuery = mock(async (_ref: unknown, args: unknown) => {
  mockLastConvexQuery = {
    args,
  };

  if (args && typeof args === "object" && "provider" in args) {
    return mockSelectResult[0] ?? null;
  }

  if (args && typeof args === "object" && "username" in args) {
    return mockSelectResult[0] ?? null;
  }

  return [...mockSelectResult];
});

const mockConvexMutation = mock(async (_ref: unknown, args: unknown) => {
  mockConvexMutationCalled = true;
  mockLastConvexMutationArgs = args;
  mockConvexMutationCalls.push(args);

  if (args && typeof args === "object") {
    if ("username" in args && "passwordHash" in args) {
      const email =
        "email" in args && typeof args.email === "string"
          ? args.email
          : `${args.username}@local.agent.center`;
      return {
        id: "local-password-user-1",
        email,
        name: email,
        authProvider: "local-password",
        authProviderId: args.username,
        passwordHash: args.passwordHash,
      };
    }

    if ("username" in args) {
      return {
        id: "local-user-1",
        email: "leo@local.agent.center",
        name: args.username,
        authProvider: "local-basic",
        authProviderId: args.username,
      };
    }

    if ("userId" in args && "tokenHash" in args && "expiresAt" in args) {
      return {
        id: "session-1",
        userId: args.userId,
        token: args.tokenHash,
        expiresAt: args.expiresAt,
      };
    }

    if ("keyHash" in args || "tokenHash" in args) {
      return mockSelectResult[0] ?? null;
    }

    if ("apiKeyId" in args) {
      return mockSelectResult[0] ?? null;
    }
  }

  return null;
});

mock.module("../services/convex-service-client", () => ({
  convexServiceClient: {
    query: mockConvexQuery,
    mutation: mockConvexMutation,
    action: mock(async () => null),
  },
}));

mock.module("../env", () => ({
  apiEnv: {
    CREDENTIAL_ENCRYPTION_KEY: "test-encryption-key-for-unit-tests",
    NODE_ENV: "development",
  },
}));

const { credentialService } = await import("../services/credential-service");
const { authMiddleware } = await import("../middleware/auth");
const { tokenStore } = await import("../middleware/basic-auth");
const { authLoginRoutes } = await import("../routes/api/auth/login");
const { apiKeyRoutes } = await import("../routes/api/api-keys");
const { hashSessionToken } = await import("../services/session-token-service");
mock.restore();

function createAuthTestApp() {
  const app = new Hono<ApiEnv>();
  app.use("*", authMiddleware);
  app.get("/api/protected", (context) =>
    context.json({ ok: true, userId: context.get("userId") ?? null }),
  );
  app.onError((error, _context) => {
    const apiError =
      error instanceof ApiError ? error : new ApiError(500, "internal_error", "Unexpected error");
    return new Response(JSON.stringify({ code: apiError.code }), {
      status: apiError.status,
      headers: { "content-type": "application/json" },
    });
  });
  return app;
}

function createLoginTestApp() {
  const app = new Hono<ApiEnv>();
  app.route("/api/auth", authLoginRoutes);
  app.onError((error, _context) => {
    const apiError =
      error instanceof ApiError ? error : new ApiError(500, "internal_error", "Unexpected error");
    return new Response(JSON.stringify({ code: apiError.code }), {
      status: apiError.status,
      headers: { "content-type": "application/json" },
    });
  });
  return app;
}

function createApiKeysTestApp(userId?: string) {
  const app = new Hono<ApiEnv>();
  if (userId) {
    app.use("*", async (context, next) => {
      context.set("userId", userId);
      return next();
    });
  }
  app.route("/api-keys", apiKeyRoutes);
  app.onError((error, _context) => {
    const apiError =
      error instanceof ApiError ? error : new ApiError(500, "internal_error", "Unexpected error");
    return new Response(JSON.stringify({ code: apiError.code }), {
      status: apiError.status,
      headers: { "content-type": "application/json" },
    });
  });
  return app;
}

describe("credential-service", () => {
  beforeEach(() => {
    savedEnv.NODE_ENV = process.env.NODE_ENV;
    savedEnv.AUTH_DISABLED = process.env.AUTH_DISABLED;
    savedEnv.AUTH_USERNAME = process.env.AUTH_USERNAME;
    savedEnv.AUTH_PASSWORD = process.env.AUTH_PASSWORD;
    savedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    savedEnv.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS =
      process.env.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS;
    mockSelectResult.length = 0;
    mockConvexMutationCalled = false;
    mockLastWhere = undefined;
    mockLastConvexQuery = undefined;
    mockLastConvexMutationArgs = undefined;
    mockConvexMutationCalls.length = 0;
    tokenStore.clear();
    mockConvexQuery.mockClear();
    mockConvexMutation.mockClear();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS;
  });

  afterEach(() => {
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    process.env.AUTH_DISABLED = savedEnv.AUTH_DISABLED;
    process.env.AUTH_USERNAME = savedEnv.AUTH_USERNAME;
    process.env.AUTH_PASSWORD = savedEnv.AUTH_PASSWORD;
    process.env.ANTHROPIC_API_KEY = savedEnv.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
    process.env.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS =
      savedEnv.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS;
  });

  describe("auth middleware", () => {
    test("rejects anonymous protected API requests when credentials are unset", async () => {
      process.env.NODE_ENV = "production";

      const response = await createAuthTestApp().request("/api/protected");

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "unauthorized" });
    });

    test("allows explicit auth disable outside production", async () => {
      process.env.NODE_ENV = "development";
      process.env.AUTH_DISABLED = "true";

      const response = await createAuthTestApp().request("/api/protected");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, userId: null });
    });

    test("rejects ownerless API keys", async () => {
      process.env.NODE_ENV = "production";
      mockSelectResult.push({
        id: "key-1",
        userId: null,
        expiresAt: null,
      });

      const response = await createAuthTestApp().request("/api/protected", {
        headers: { Authorization: "Bearer ac_test" },
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "unauthorized" });
    });

    test("looks up session tokens by hash", async () => {
      process.env.NODE_ENV = "production";
      mockSelectResult.push({
        id: "session-1",
        token: hashSessionToken("sess_test"),
        userId: "user-1",
        expiresAt: new Date(Date.now() + 60_000),
      });

      const response = await createAuthTestApp().request("/api/protected", {
        headers: { Authorization: "Bearer sess_test" },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, userId: "user-1" });
      expect(mockLastConvexMutationArgs).toEqual({
        tokenHash: hashSessionToken("sess_test"),
      });
    });

    test("maps legacy local login tokens to a local user id", async () => {
      process.env.NODE_ENV = "development";
      process.env.AUTH_DISABLED = "";
      tokenStore.set("legacy-token", {
        username: "leo",
        expiresAt: Date.now() + 60_000,
      });

      const response = await createAuthTestApp().request("/api/protected", {
        headers: { Authorization: "Bearer legacy-token" },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        userId: "local-basic:leo",
      });
    });
  });

  describe("local auth routes", () => {
    test("basic login creates a persistent sess token", async () => {
      process.env.AUTH_USERNAME = "leo";
      process.env.AUTH_PASSWORD = "secret";

      const response = await createLoginTestApp().request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "leo", password: "secret" }),
        headers: { "content-type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { token: string; expiresAt: string } };

      expect(body.data.token.startsWith("sess_")).toBe(true);
      expect(tokenStore.get(body.data.token)).toBeUndefined();
      expect(mockConvexMutationCalls).toContainEqual({ username: "leo" });
      expect(mockConvexMutationCalls).toContainEqual({
        userId: "local-user-1",
        tokenHash: hashSessionToken(body.data.token),
        expiresAt: Date.parse(body.data.expiresAt),
      });
    });

    test("signup creates a local password user and persistent sess token", async () => {
      const response = await createLoginTestApp().request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "New.User@example.com", password: "secret123" }),
        headers: { "content-type": "application/json" },
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as { data: { token: string; expiresAt: string } };

      expect(body.data.token.startsWith("sess_")).toBe(true);
      expect(mockConvexMutationCalls).toContainEqual({
        userId: "local-password-user-1",
        tokenHash: hashSessionToken(body.data.token),
        expiresAt: Date.parse(body.data.expiresAt),
      });

      const createUserCall = mockConvexMutationCalls.find(
        (call) =>
          typeof call === "object" && call !== null && "username" in call && "passwordHash" in call,
      ) as { email?: string; username: string; passwordHash: string } | undefined;

      expect(createUserCall).toBeDefined();
      expect(createUserCall?.username).toBe("new.user@example.com");
      expect(createUserCall?.email).toBe("new.user@example.com");
      expect(createUserCall?.passwordHash.startsWith("pbkdf2$")).toBe(true);
      expect(createUserCall?.passwordHash).not.toContain("secret123");
    });

    test("signup returns a helpful conflict for duplicate emails", async () => {
      mockSelectResult.push({
        id: "existing-user",
        email: "taken@example.com",
        name: "taken@example.com",
        authProvider: "local-password",
        authProviderId: "taken@example.com",
        passwordHash: "pbkdf2$310000$sha256$salt$key",
      });

      const response = await createLoginTestApp().request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "taken@example.com", password: "secret123" }),
        headers: { "content-type": "application/json" },
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: "email_taken",
      });
      expect(mockConvexMutationCalled).toBe(false);
    });

    test("local password login creates a persistent sess token", async () => {
      const signupResponse = await createLoginTestApp().request("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "member@example.com", password: "secret123" }),
        headers: { "content-type": "application/json" },
      });
      expect(signupResponse.status).toBe(201);

      const createUserCall = mockConvexMutationCalls.find(
        (call) =>
          typeof call === "object" && call !== null && "username" in call && "passwordHash" in call,
      ) as { passwordHash: string } | undefined;
      expect(createUserCall).toBeDefined();

      mockSelectResult.push({
        id: "local-password-user-1",
        email: "member@example.com",
        name: "member@example.com",
        authProvider: "local-password",
        authProviderId: "member@example.com",
        passwordHash: createUserCall?.passwordHash,
      });
      mockConvexMutationCalls.length = 0;

      const response = await createLoginTestApp().request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "member@example.com", password: "secret123" }),
        headers: { "content-type": "application/json" },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: { token: string; expiresAt: string } };

      expect(body.data.token.startsWith("sess_")).toBe(true);
      expect(mockConvexMutationCalls).toContainEqual({
        userId: "local-password-user-1",
        tokenHash: hashSessionToken(body.data.token),
        expiresAt: Date.parse(body.data.expiresAt),
      });
    });

    test("/me accepts persistent sess tokens", async () => {
      process.env.AUTH_USERNAME = "leo";
      process.env.AUTH_PASSWORD = "secret";
      mockSelectResult.push({
        id: "session-1",
        token: hashSessionToken("sess_test"),
        userId: "local-user-1",
        expiresAt: Date.now() + 60_000,
      });

      const response = await createLoginTestApp().request("/api/auth/me", {
        headers: { Authorization: "Bearer sess_test" },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: {
          authenticated: true,
          username: "leo",
        },
      });
      expect(mockLastConvexMutationArgs).toEqual({
        tokenHash: hashSessionToken("sess_test"),
      });
    });

    test("/logout deletes persistent sess sessions", async () => {
      mockSelectResult.push({
        id: "session-1",
        token: hashSessionToken("sess_test"),
        userId: "local-user-1",
        expiresAt: Date.now() + 60_000,
      });

      const response = await createLoginTestApp().request("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer sess_test" },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { message: "Logged out successfully" },
      });
      expect(mockLastConvexMutationArgs).toEqual({
        tokenHash: hashSessionToken("sess_test"),
      });
    });
  });

  describe("api key routes", () => {
    test("list requires an authenticated user id", async () => {
      const response = await createApiKeysTestApp().request("/api-keys");

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "unauthorized" });
      expect(mockLastWhere).toBeUndefined();
    });

    test("list is scoped to the authenticated user id", async () => {
      mockSelectResult.push({
        id: "key-1",
        name: "Personal",
        keyPrefix: "ac_12345678",
        lastUsedAt: null,
        expiresAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      });

      const response = await createApiKeysTestApp("user-1").request("/api-keys");

      expect(response.status).toBe(200);
      expect(mockLastConvexQuery).toEqual({
        args: {
          userId: "user-1",
        },
      });
    });

    test("delete is scoped to the authenticated user id", async () => {
      mockSelectResult.push({ id: "key-1" });

      const response = await createApiKeysTestApp("user-1").request("/api-keys/key-1", {
        method: "DELETE",
      });

      expect(response.status).toBe(200);
      expect(mockLastConvexMutationArgs).toEqual({
        apiKeyId: "key-1",
        userId: "user-1",
      });
    });
  });

  describe("getClaudeCredentials", () => {
    test("returns disconnected when no DB rows", async () => {
      const result = await credentialService.getClaudeCredentials("user-1");
      expect(result.connected).toBe(false);
      expect(result.source).toBeNull();
      expect(result.email).toBeNull();
      expect(result.expiresAt).toBeNull();
      expect(result.subscriptionType).toBeNull();
      expect(mockLastConvexQuery).toEqual({
        args: {
          provider: "claude",
          userId: "user-1",
        },
      });
    });

    test("returns connected when DB row exists", async () => {
      mockSelectResult.push({
        provider: "claude",
        source: "api_key",
        profileEmail: null,
        tokenExpiresAt: null,
        subscriptionType: null,
      });

      const result = await credentialService.getClaudeCredentials("user-1");
      expect(result.connected).toBe(true);
      expect(result.source).toBe("api_key");
      expect(result.expiresAt).toBeNull();
    });
  });

  describe("resolveCredential", () => {
    test("returns env API key when no DB creds and ANTHROPIC_API_KEY set", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";

      const result = await credentialService.resolveCredential("user-1");
      expect(result.type).toBe("api_key");
      expect(result.value).toBe("sk-ant-test-key");
    });

    test("throws no_claude_credentials when no creds at all", async () => {
      try {
        await credentialService.resolveCredential("user-1");
        expect.unreachable("should have thrown");
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe("no_claude_credentials");
        expect((error as { status: number }).status).toBe(422);
      }
    });

    test("returns decrypted API key from DB row", async () => {
      const encKey = "test-encryption-key-for-unit-tests";
      const encryptedApiKey = encrypt("sk-ant-db-key", encKey);

      mockSelectResult.push({
        id: "cred-1",
        provider: "claude",
        source: "api_key",
        encryptedApiKey,
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
      });

      const result = await credentialService.resolveCredential("user-1");
      expect(result.type).toBe("api_key");
      expect(result.value).toBe("sk-ant-db-key");
    });
  });

  describe("storeClaudeApiKey", () => {
    test("inserts credentials with the provided user id", async () => {
      await credentialService.storeClaudeApiKey("sk-ant-new-key", "user-1");

      expect(mockConvexMutationCalled).toBe(true);
      expect(mockLastConvexMutationArgs).toMatchObject({
        userId: "user-1",
        provider: "claude",
        source: "api_key",
      });
    });
  });

  describe("storeOpenAITokens", () => {
    test("encrypts Codex id_token before storing credential metadata", async () => {
      await credentialService.storeOpenAITokens(
        "oauth-access-token",
        "oauth-refresh-token",
        3600,
        "oauth-id-token",
        "user-1",
      );

      expect(mockLastConvexMutationArgs).toMatchObject({
        provider: "openai",
        source: "oauth",
        userId: "user-1",
      });
      const metadata = (mockLastConvexMutationArgs as { metadata?: Record<string, unknown> })
        .metadata;
      expect(metadata?.idToken).toBeUndefined();
      expect(typeof metadata?.encryptedIdToken).toBe("string");
      expect(metadata?.encryptedIdToken).not.toBe("oauth-id-token");
    });
  });

  describe("resolveCodexCredential", () => {
    test("returns reconstructed auth.json from stored oauth tokens with encrypted id token", async () => {
      const encKey = "test-encryption-key-for-unit-tests";
      const encryptedAccessToken = encrypt("oauth-access-token", encKey);
      const encryptedRefreshToken = encrypt("oauth-refresh-token", encKey);
      const encryptedIdToken = encrypt("oauth-id-token", encKey);

      mockSelectResult.push({
        id: "cred-openai-1",
        provider: "openai",
        source: "oauth",
        encryptedApiKey: null,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: null,
        metadata: { encryptedIdToken },
      });

      const result = await credentialService.resolveCodexCredential("user-1");
      expect(result.type).toBe("auth_json");
      expect(JSON.parse(result.value)).toEqual({
        tokens: {
          access_token: "oauth-access-token",
          refresh_token: "oauth-refresh-token",
          id_token: "oauth-id-token",
        },
      });
    });

    test("keeps resolving legacy plaintext id token metadata", async () => {
      const encKey = "test-encryption-key-for-unit-tests";
      const encryptedAccessToken = encrypt("oauth-access-token", encKey);
      const encryptedRefreshToken = encrypt("oauth-refresh-token", encKey);

      mockSelectResult.push({
        id: "cred-openai-1",
        provider: "openai",
        source: "oauth",
        encryptedApiKey: null,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: null,
        metadata: { idToken: "oauth-id-token" },
      });

      const result = await credentialService.resolveCodexCredential("user-1");
      expect(JSON.parse(result.value).tokens.id_token).toBe("oauth-id-token");
    });
  });

  describe("runner-safe credential resolution", () => {
    test("returns env-backed Claude credentials for self-hosted runners", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-runner-safe-key";

      const result = await credentialService.resolveRunnerClaudeCredential("workspace-1");

      expect(result).toEqual({
        type: "api_key",
        value: "sk-ant-runner-safe-key",
      });
    });

    test("returns env-backed OpenAI credentials for self-hosted runners", async () => {
      process.env.OPENAI_API_KEY = "sk-openai-runner-safe-key";

      const result = await credentialService.resolveRunnerOpenAICredential("workspace-1");

      expect(result).toEqual({
        type: "api_key",
        value: "sk-openai-runner-safe-key",
      });
    });

    test("does not fall back to user-scoped OpenAI oauth credentials outside production", async () => {
      const encKey = "test-encryption-key-for-unit-tests";
      const encryptedAccessToken = encrypt("oauth-access-token", encKey);
      const encryptedRefreshToken = encrypt("oauth-refresh-token", encKey);
      const encryptedIdToken = encrypt("oauth-id-token", encKey);

      mockSelectResult.push({
        id: "cred-openai-1",
        provider: "openai",
        source: "oauth",
        encryptedApiKey: null,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: null,
        metadata: { encryptedIdToken },
      });

      try {
        await credentialService.resolveRunnerOpenAICredential("workspace-1");
        expect.unreachable("should have thrown");
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe("no_runner_openai_credentials");
      }
    });

    test("uses explicitly allowed global OpenAI oauth credentials", async () => {
      process.env.RUNNER_ALLOW_GLOBAL_PROVIDER_CREDENTIALS = "true";
      const encKey = "test-encryption-key-for-unit-tests";
      const encryptedAccessToken = encrypt("oauth-access-token", encKey);
      const encryptedRefreshToken = encrypt("oauth-refresh-token", encKey);

      mockSelectResult.push({
        id: "cred-openai-1",
        userId: null,
        provider: "openai",
        source: "oauth",
        encryptedApiKey: null,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt: null,
        metadata: { idToken: "oauth-id-token" },
      });

      const result = await credentialService.resolveRunnerOpenAICredential("workspace-1");
      expect(result.type).toBe("auth_json");
      expect(JSON.parse(result.value)).toEqual({
        tokens: {
          access_token: "oauth-access-token",
          refresh_token: "oauth-refresh-token",
          id_token: "oauth-id-token",
        },
      });
      expect(mockLastConvexQuery).toEqual({
        args: {
          provider: "openai",
          userId: null,
        },
      });
    });
  });
});
